import type { RegisteredGame } from '@chat/shared'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, resolveMediaUrl } from '@/lib/api'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { useActivityStore } from '@/stores/activity.store'

const SOURCE_LABEL_KEY: Record<RegisteredGame['source'], string> = {
  steam: 'games.sourceSteam',
  process: 'games.sourceProcess',
  smtc: 'games.sourceMedia',
  manual: 'games.sourceManual'
}

function GameIcon({ game }: { game: RegisteredGame }) {
  if (game.iconUrl) {
    return (
      <img
        src={resolveMediaUrl(game.iconUrl)}
        alt=""
        className="h-9 w-9 shrink-0 rounded object-cover"
      />
    )
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-white/10 text-sm font-semibold text-gray-300">
      {game.name.charAt(0).toUpperCase()}
    </div>
  )
}

export function RegisteredGamesSection() {
  const { t } = useTranslation('settings')
  const games = useActivityStore((s) => s.games)
  const fetchGames = useActivityStore((s) => s.fetchGames)
  const setGameHidden = useActivityStore((s) => s.setGameHidden)
  const removeGame = useActivityStore((s) => s.removeGame)
  const upsertGameLocal = useActivityStore((s) => s.upsertGameLocal)
  const [newName, setNewName] = useState('')
  const [newExe, setNewExe] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchGames().catch(() => {})
  }, [fetchGames])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name || busy) return
    const executable = newExe.trim() || null
    setBusy(true)
    try {
      const game = await api.upsertRegisteredGame({ name, source: 'manual', executable })
      upsertGameLocal(game)
      setNewName('')
      setNewExe('')
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">{t('games.intro')}</p>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd()
            }}
            placeholder={t('games.namePlaceholder')}
            className="flex-1 rounded-md bg-surface-dark px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={newExe}
            onChange={(e) => setNewExe(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd()
            }}
            placeholder={t('games.executablePlaceholder')}
            className="flex-1 rounded-md bg-surface-dark px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!newName.trim() || busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {t('games.add')}
          </button>
        </div>
        <p className="text-xs text-gray-500">{t('games.executableHint')}</p>
      </div>

      <div className="space-y-2">
        <SectionHeading>{t('games.addedGames', { count: games.length })}</SectionHeading>
        {games.length === 0 ? (
          <p className="rounded-lg bg-surface-dark px-4 py-6 text-center text-sm text-gray-500">
            {t('games.empty')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {games.map((game) => (
              <li
                key={game.id}
                className="flex items-center gap-3 rounded-lg bg-surface-dark px-3 py-2.5"
              >
                <GameIcon game={game} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${game.hidden ? 'text-gray-500' : 'text-white'}`}>
                    {game.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {t(SOURCE_LABEL_KEY[game.source])}
                    {game.executable ? ` · ${game.executable}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void setGameHidden(game.id, !game.hidden)}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                  title={game.hidden ? t('games.show') : t('games.hide')}
                  aria-label={game.hidden ? t('games.show') : t('games.hide')}
                >
                  {game.hidden ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.26 7.13 10.87 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void removeGame(game.id)}
                  className="rounded p-1.5 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"
                  title={t('games.remove')}
                  aria-label={t('games.remove')}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
