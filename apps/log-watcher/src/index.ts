import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import nodemailer from 'nodemailer'

const execFileAsync = promisify(execFile)

const HOUR_MS = 60 * 60 * 1000
const MAX_BODY_CHARS = 28_000
const RATE_LIMIT_LOG_COOLDOWN_MS = 60_000

type PersistedState = {
  lastFingerprint: string | null
  windowStart: number
  emailsInWindow: number
}

function env(name: string, fallback?: string): string {
  const v = process.env[name]
  if (v !== undefined && v !== '') return v
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable: ${name}`)
}

function envBool(name: string): boolean {
  const v = (process.env[name] ?? '').toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return n
}

function normalizeForHash(line: string): string {
  let s = line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+\s+/, '')
  s = s.replace(/\[\d{1,2}\/\d{1,2}\/\d{4}[^\]]*]\s*/g, '')
  s = s.replace(/\b\d+\b/g, '#')
  return s.trim()
}

function fingerprint(lines: string[]): string {
  const h = createHash('sha256')
  for (const line of lines) {
    h.update(normalizeForHash(line))
    h.update('\n')
  }
  return h.digest('hex')
}

function matchPatterns(line: string, patterns: string[]): boolean {
  const lower = line.toLowerCase()
  return patterns.some((p) => lower.includes(p.toLowerCase()))
}

async function readState(file: string): Promise<PersistedState> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      lastFingerprint: typeof parsed.lastFingerprint === 'string' ? parsed.lastFingerprint : null,
      windowStart: typeof parsed.windowStart === 'number' ? parsed.windowStart : 0,
      emailsInWindow: typeof parsed.emailsInWindow === 'number' ? parsed.emailsInWindow : 0
    }
  } catch {
    return { lastFingerprint: null, windowStart: 0, emailsInWindow: 0 }
  }
}

async function writeState(file: string, state: PersistedState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state), 'utf8')
}

async function fetchDockerLogs(services: string[], since: string): Promise<string> {
  const args = ['compose', 'logs', '--no-color', '--since', since, ...services]
  const maxBuffer = 24 * 1024 * 1024
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      maxBuffer,
      env: process.env
    })
    if (stderr.trim()) {
      console.warn('[log-watcher] docker stderr:', stderr.slice(0, 2000))
    }
    return stdout
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string }
    console.error('[log-watcher] docker compose logs failed:', err.message)
    if (err.stderr) console.error(err.stderr.slice(0, 4000))
    return ''
  }
}

function createMailer() {
  const port = parseIntEnv('SMTP_PORT', 1025)
  return nodemailer.createTransport({
    host: env('SMTP_HOST', 'localhost'),
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS ?? ''
        }
      : undefined
  })
}

async function sendAlert(
  transporter: nodemailer.Transporter,
  params: { to: string; from: string; project: string; lines: string[] }
): Promise<void> {
  const body = params.lines.join('\n').slice(0, MAX_BODY_CHARS)
  const subject = `[${params.project}] Docker logs: ${params.lines.length} matching line(s)`
  await transporter.sendMail({
    from: params.from,
    to: params.to,
    subject,
    text: `The following lines matched your alert patterns (truncated to ${MAX_BODY_CHARS} chars):\n\n${body}`
  })
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const dryRun = envBool('LOG_WATCHER_DRY_RUN')
  const alertTo = process.env.LOG_WATCHER_ALERT_TO ?? ''
  if (!dryRun && !alertTo) {
    throw new Error('Set LOG_WATCHER_ALERT_TO (recipient email) or LOG_WATCHER_DRY_RUN=1')
  }

  const statePath = env('LOG_WATCHER_STATE_PATH', '/data/state.json')
  const services = env('WATCH_SERVICES', 'api')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const since = env('LOG_WATCHER_LOG_SINCE', '3m')
  const patterns = env(
    'LOG_WATCHER_PATTERNS',
    'ERROR [,WARN [,Exception,Unhandled,FATAL'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const pollMs = parseIntEnv('LOG_WATCHER_POLL_MS', 120_000)
  const startDelayMs = parseIntEnv('LOG_WATCHER_START_DELAY_MS', 30_000)
  const maxPerHour = parseIntEnv('LOG_WATCHER_MAX_EMAILS_PER_HOUR', 5)
  const project = env('COMPOSE_PROJECT_NAME', 'chat')

  console.log(
    `[log-watcher] starting project=${project} services=${services.join(',')} pollMs=${pollMs} since=${since} dryRun=${dryRun}`
  )

  if (startDelayMs > 0) {
    await sleep(startDelayMs)
  }

  const transporter = dryRun ? null : createMailer()
  const from = env('SMTP_FROM', 'noreply@chat.local')

  let shuttingDown = false
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      shuttingDown = true
      console.log(`[log-watcher] received ${sig}, exiting after current cycle`)
    })
  }

  let lastDryFingerprint: string | null = null
  let lastRateLimitLogAt = 0

  while (!shuttingDown) {
    try {
      const raw = await fetchDockerLogs(services, since)
      const allLines = raw.split(/\r?\n/).filter((l) => l.length > 0)
      const matched = allLines.filter((l) => matchPatterns(l, patterns))

      if (matched.length > 0) {
        const fp = fingerprint(matched)
        let state = await readState(statePath)
        const now = Date.now()

        if (now - state.windowStart > HOUR_MS) {
          state = { ...state, windowStart: now, emailsInWindow: 0 }
        }

        if (state.lastFingerprint === fp) {
          console.log('[log-watcher] same fingerprint as last alert, skipping')
        } else if (state.emailsInWindow >= maxPerHour) {
          if (now - lastRateLimitLogAt > RATE_LIMIT_LOG_COOLDOWN_MS) {
            lastRateLimitLogAt = now
            console.warn('[log-watcher] rate limit reached, skipping email this cycle')
          }
        } else {
          if (dryRun) {
            if (lastDryFingerprint !== fp) {
              lastDryFingerprint = fp
              console.log(`[log-watcher] DRY_RUN would send ${matched.length} lines, fp=${fp.slice(0, 12)}…`)
              console.log(matched.slice(0, 20).join('\n'))
            }
          } else if (transporter) {
            await sendAlert(transporter, {
              to: alertTo,
              from,
              project,
              lines: matched
            })
            state = {
              lastFingerprint: fp,
              windowStart: state.windowStart,
              emailsInWindow: state.emailsInWindow + 1
            }
            await writeState(statePath, state)
            console.log(`[log-watcher] sent alert (${matched.length} lines)`)
          }
        }
      } else {
        const cleared = await readState(statePath)
        if (cleared.lastFingerprint !== null) {
          await writeState(statePath, { ...cleared, lastFingerprint: null })
        }
      }
    } catch (err) {
      console.error('[log-watcher] cycle error:', err)
    }

    await sleep(pollMs)
  }
}

void main().catch((err) => {
  console.error('[log-watcher] fatal:', err)
  process.exit(1)
})
