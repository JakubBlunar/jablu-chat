import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Spinner, Toggle } from '@/components/ui'
import { api, type AutoModRule } from '@/lib/api'
import type { Server } from '@/stores/server.store'

function AutoModCard({
  title,
  description,
  enabled,
  saving,
  onToggle,
  children
}: {
  title: string
  description: string
  enabled: boolean
  saving: boolean
  onToggle: (enabled: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-dark p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <Toggle checked={enabled} onChange={onToggle} disabled={saving} />
      </div>
      {enabled && <div className="mt-4 border-t border-white/5 pt-4">{children}</div>}
    </div>
  )
}

function WordFilterConfig({
  config,
  onSave
}: {
  config: { words?: string[]; action?: string }
  onSave: (config: Record<string, unknown>) => void
}) {
  const [input, setInput] = useState('')
  const words = config.words ?? []
  const action = config.action ?? 'block'

  const addWord = () => {
    const word = input.trim().toLowerCase()
    if (word && !words.includes(word)) {
      onSave({ words: [...words, word], action })
      setInput('')
    }
  }

  const removeWord = (word: string) => {
    onSave({ words: words.filter((w) => w !== word), action })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-1">
        <label className="text-xs text-gray-400">Action:</label>
        <select
          value={action}
          onChange={(e) => onSave({ words, action: e.target.value })}
          className="rounded-md border border-white/10 bg-surface px-2 py-1 text-xs text-white outline-none"
        >
          <option value="block">Block message</option>
          <option value="flag">Flag for review</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWord()}
            placeholder="Add a word..."
            className="bg-surface py-1.5"
          />
        </div>
        <Button type="button" size="sm" onClick={addWord}>
          Add
        </Button>
      </div>
      {words.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-gray-300">
              {w}
              <button type="button" onClick={() => removeWord(w)} className="text-gray-500 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LinkFilterConfig({
  config,
  onSave
}: {
  config: { blockAll?: boolean; allowedDomains?: string[] }
  onSave: (config: Record<string, unknown>) => void
}) {
  const [input, setInput] = useState('')
  const blockAll = config.blockAll ?? false
  const allowedDomains = config.allowedDomains ?? []

  const addDomain = () => {
    const domain = input.trim().toLowerCase()
    if (domain && !allowedDomains.includes(domain)) {
      onSave({ blockAll, allowedDomains: [...allowedDomains, domain] })
      setInput('')
    }
  }

  const removeDomain = (domain: string) => {
    onSave({ blockAll, allowedDomains: allowedDomains.filter((d) => d !== domain) })
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={blockAll}
          onChange={(e) => onSave({ blockAll: e.target.checked, allowedDomains })}
          className="rounded border-white/20 bg-surface text-primary focus:ring-primary/50"
        />
        Block all links (except allowed domains)
      </label>
      {blockAll && (
        <>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                placeholder="e.g. youtube.com"
                className="bg-surface py-1.5"
              />
            </div>
            <Button type="button" size="sm" onClick={addDomain}>
              Allow
            </Button>
          </div>
          {allowedDomains.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allowedDomains.map((d) => (
                <span key={d} className="flex items-center gap-1 rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs text-green-300">
                  {d}
                  <button type="button" onClick={() => removeDomain(d)} className="text-green-500 hover:text-red-400">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SpamDetectionConfig({
  config,
  onSave
}: {
  config: { maxDuplicates?: number; windowSeconds?: number; maxMessagesPerMinute?: number }
  onSave: (config: Record<string, unknown>) => void
}) {
  const maxDuplicates = config.maxDuplicates ?? 3
  const windowSeconds = config.windowSeconds ?? 60
  const maxMessagesPerMinute = config.maxMessagesPerMinute ?? 10

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Max messages per minute</span>
          <span className="font-mono text-white">{maxMessagesPerMinute}</span>
        </div>
        <input
          type="range"
          min={3}
          max={30}
          value={maxMessagesPerMinute}
          onChange={(e) =>
            onSave({ maxDuplicates, windowSeconds, maxMessagesPerMinute: Number(e.target.value) })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Max duplicate messages</span>
          <span className="font-mono text-white">{maxDuplicates}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={maxDuplicates}
          onChange={(e) =>
            onSave({ maxDuplicates: Number(e.target.value), windowSeconds, maxMessagesPerMinute })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Duplicate window (seconds)</span>
          <span className="font-mono text-white">{windowSeconds}s</span>
        </div>
        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={windowSeconds}
          onChange={(e) =>
            onSave({ maxDuplicates, windowSeconds: Number(e.target.value), maxMessagesPerMinute })
          }
          className="mt-1 w-full accent-primary"
        />
      </div>
    </div>
  )
}

export function AutoModTab({ server }: { server: Server }) {
  const [rules, setRules] = useState<AutoModRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api
      .getAutoModRules(server.id)
      .then(setRules)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [server.id])

  const handleToggle = useCallback(
    async (type: string, enabled: boolean) => {
      const rule = rules.find((r) => r.type === type)
      if (!rule) return
      setSaving(type)
      try {
        const updated = await api.updateAutoModRule(server.id, type, enabled, rule.config)
        setRules((prev) => prev.map((r) => (r.type === type ? updated : r)))
      } catch {
        /* rule update failed */
      }
      setSaving(null)
    },
    [server.id, rules]
  )

  const handleConfigChange = useCallback(
    async (type: string, config: Record<string, unknown>) => {
      const rule = rules.find((r) => r.type === type)
      if (!rule) return
      setSaving(type)
      try {
        const updated = await api.updateAutoModRule(server.id, type, rule.enabled, config)
        setRules((prev) => prev.map((r) => (r.type === type ? updated : r)))
      } catch {
        /* config update failed */
      }
      setSaving(null)
    },
    [server.id, rules]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    )
  }

  const wordRule = rules.find((r) => r.type === 'word_filter')
  const linkRule = rules.find((r) => r.type === 'link_filter')
  const spamRule = rules.find((r) => r.type === 'spam_detection')

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Configure automatic content filtering and spam prevention for this server.</p>

      {wordRule && (
        <AutoModCard
          title="Word Filter"
          description="Block messages containing specific words"
          enabled={wordRule.enabled}
          saving={saving === 'word_filter'}
          onToggle={(enabled) => handleToggle('word_filter', enabled)}
        >
          <WordFilterConfig
            config={wordRule.config as { words?: string[]; action?: string }}
            onSave={(config) => handleConfigChange('word_filter', config)}
          />
        </AutoModCard>
      )}

      {linkRule && (
        <AutoModCard
          title="Link Filter"
          description="Control which links can be shared"
          enabled={linkRule.enabled}
          saving={saving === 'link_filter'}
          onToggle={(enabled) => handleToggle('link_filter', enabled)}
        >
          <LinkFilterConfig
            config={linkRule.config as { blockAll?: boolean; allowedDomains?: string[] }}
            onSave={(config) => handleConfigChange('link_filter', config)}
          />
        </AutoModCard>
      )}

      {spamRule && (
        <AutoModCard
          title="Spam Detection"
          description="Limit message rate and duplicate content"
          enabled={spamRule.enabled}
          saving={saving === 'spam_detection'}
          onToggle={(enabled) => handleToggle('spam_detection', enabled)}
        >
          <SpamDetectionConfig
            config={spamRule.config as { maxDuplicates?: number; windowSeconds?: number; maxMessagesPerMinute?: number }}
            onSave={(config) => handleConfigChange('spam_detection', config)}
          />
        </AutoModCard>
      )}
    </div>
  )
}
