import { useCallback, useEffect, useState } from 'react'
import { ProgressBar, Spinner } from '@/components/ui'
import type { StatsData } from '../adminTypes'
import { adminFetch } from '../adminApi'

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function BarChart({
  items,
  labelKey,
  valueKey
}: {
  items: { label: string; sub?: string; value: number }[]
  labelKey: string
  valueKey: string
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400">
        <span>{labelKey}</span>
        <span>{valueKey}</span>
      </div>
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="truncate text-white">
              {item.label}
              {item.sub && <span className="ml-1.5 text-gray-500">{item.sub}</span>}
            </span>
            <span className="shrink-0 ml-3 font-medium text-gray-300">{item.value.toLocaleString()}</span>
          </div>
          <ProgressBar value={(item.value / max) * 100} size="sm" className="bg-white/5" />
        </div>
      ))}
    </div>
  )
}

export function StatsTab() {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminFetch<StatsData>(`/api/admin/stats?days=${days}`)
      setStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void fetchStats()
  }, [fetchStats])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-gray-400">
        <Spinner size="lg" />
        <span>Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
        {error}
        <button type="button" onClick={() => void fetchStats()} className="ml-2 underline hover:text-white">
          Retry
        </button>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Time range:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              days === d ? 'bg-primary text-primary-text' : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Messages" value={stats.totalMessages.toLocaleString()} />
        <StatCard label={`Messages (${days}d)`} value={stats.recentMessages.toLocaleString()} />
        <StatCard label="Users" value={stats.totalUsers} />
        <StatCard label="Servers" value={stats.totalServers} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Top Channels ({days}d)</h3>
          {stats.topChannels.length === 0 ? (
            <p className="text-sm text-gray-500">No activity.</p>
          ) : (
            <BarChart
              items={stats.topChannels.map((c) => ({
                label: `#${c.name}`,
                sub: c.serverName,
                value: c.count
              }))}
              labelKey="Channel"
              valueKey="Messages"
            />
          )}
        </div>

        <div className="rounded-lg bg-surface-dark p-4 ring-1 ring-white/10">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Top Users ({days}d)</h3>
          {stats.topUsers.length === 0 ? (
            <p className="text-sm text-gray-500">No activity.</p>
          ) : (
            <BarChart
              items={stats.topUsers.map((u) => ({
                label: u.displayName ?? u.username,
                sub: u.displayName ? `@${u.username}` : undefined,
                value: u.count
              }))}
              labelKey="User"
              valueKey="Messages"
            />
          )}
        </div>
      </div>
    </div>
  )
}
