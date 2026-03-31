import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui'
import { api, type ServerInsights } from '@/lib/api'
import type { Server } from '@/stores/server.store'

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/5">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function BarChart({ data, labelKey, valueKey, color = '#6366f1' }: {
  data: Record<string, unknown>[]
  labelKey: string
  valueKey: string
  color?: string
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500">No data yet</p>
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1)

  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const pct = (val / max) * 100
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-xs text-gray-300">{String(d[labelKey])}</span>
            <div className="relative h-5 min-w-0 flex-1 rounded bg-white/5">
              <div
                className="absolute inset-y-0 left-0 rounded transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
              <span className="relative z-10 flex h-full items-center px-2 text-[11px] font-medium text-white">
                {val.toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AreaChart({ data, labelKey, valueKey, color = '#6366f1' }: {
  data: Record<string, unknown>[]
  labelKey: string
  valueKey: string
  color?: string
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500">No data yet</p>

  const values = data.map((d) => Number(d[valueKey]) || 0)
  const max = Math.max(...values, 1)
  const w = 500
  const h = 120
  const padY = 8

  const points = data.map((_, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w
    const y = h - padY - ((values[i] / max) * (h - padY * 2))
    return `${x},${y}`
  })

  const areaPoints = [`0,${h}`, ...points, `${w},${h}`].join(' ')
  const linePoints = points.join(' ')

  const labelInterval = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.map((_, i) => {
          const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w
          const y = h - padY - ((values[i] / max) * (h - padY * 2))
          return <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        {data.map((d, i) => {
          if (i % labelInterval !== 0 && i !== data.length - 1) return null
          const label = String(d[labelKey])
          const short = label.length > 5 ? label.slice(5) : label
          return <span key={i}>{short}</span>
        })}
      </div>
    </div>
  )
}

function ContributorRow({ user, count, rank }: {
  user: { username: string; displayName: string | null; avatarUrl: string | null }
  count: number
  rank: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5">
      <span className="w-5 shrink-0 text-center text-xs font-semibold text-gray-500">#{rank}</span>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/30 text-[10px] font-bold text-white">
          {(user.displayName ?? user.username)[0]?.toUpperCase()}
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
        {user.displayName ?? user.username}
      </span>
      <span className="shrink-0 text-xs font-medium text-gray-400">{count.toLocaleString()} msgs</span>
    </div>
  )
}

export function InsightsTab({ server }: { server: Server }) {
  const [data, setData] = useState<ServerInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .getServerInsights(server.id)
      .then(setData)
      .catch(() => setError('Failed to load insights. You may not have permission.'))
      .finally(() => setLoading(false))
  }, [server.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error || !data) {
    return <p className="py-8 text-center text-sm text-red-400">{error ?? 'No data'}</p>
  }

  const { overview } = data

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-white">Server Insights</h2>
        <p className="mt-0.5 text-xs text-gray-400">Analytics for the last 30 days</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Members" value={overview.totalMembers} />
        <StatCard label="Channels" value={overview.totalChannels} sub={`${overview.textChannels} text · ${overview.voiceChannels} voice`} />
        <StatCard label="Total Messages" value={overview.totalMessages} />
        <StatCard
          label="Msgs / Day (avg)"
          value={data.messagesByDay.length > 0
            ? Math.round(data.messagesByDay.reduce((s, d) => s + d.count, 0) / data.messagesByDay.length)
            : 0}
        />
        <StatCard label="Active Days" value={data.messagesByDay.filter((d) => d.count > 0).length} sub="out of 30" />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-300">Message Activity</h3>
        <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/5">
          <AreaChart data={data.messagesByDay} labelKey="day" valueKey="count" color="#818cf8" />
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Top Channels</h3>
          <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/5">
            <BarChart data={data.topChannels} labelKey="name" valueKey="count" color="#34d399" />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Top Contributors</h3>
          <div className="rounded-lg bg-surface-dark p-3 ring-1 ring-white/5">
            {data.topContributors.length === 0 ? (
              <p className="text-sm text-gray-500">No data yet</p>
            ) : (
              <div className="space-y-0.5">
                {data.topContributors.map((c, i) => (
                  <ContributorRow
                    key={c.userId}
                    user={c}
                    count={c.count}
                    rank={i + 1}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {data.membersByWeek.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Member Joins (by week)</h3>
          <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/5">
            <BarChart data={data.membersByWeek} labelKey="week" valueKey="count" color="#f59e0b" />
          </div>
        </section>
      )}
    </div>
  )
}
