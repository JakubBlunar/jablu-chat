import { useMicrophoneTest } from './hooks/useMicrophoneTest'

export function MicrophoneTest({ deviceId, outputId }: { deviceId: string; outputId: string }) {
  const { t, phase, level, error, url, audioRef, start, stop } = useMicrophoneTest({ deviceId, outputId })
  return (
    <section className="space-y-3 rounded-md bg-surface-darkest/80 p-3" aria-label={t('micTest.title')}>
      <h3 className="text-sm font-semibold text-gray-200">{t('micTest.title')}</h3>
      <p className="text-xs text-gray-400">{t('micTest.hint')}</p>
      <div
        className="h-3 overflow-hidden rounded-full bg-surface"
        role="meter"
        aria-label={t('micTest.level')}
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round((level / 100) * 60 - 60)}
      >
        <div
          className={`h-full transition-[width] duration-75 ${level > 95 ? 'bg-amber-400' : 'bg-green-500'}`}
          style={{ width: `${level}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={phase === 'starting'}
          className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-text disabled:opacity-50"
          onClick={() => {
            if (phase === 'recording') stop()
            else void start()
          }}
        >
          {t(phase === 'recording' ? 'micTest.stop' : phase === 'starting' ? 'microphoneStarting' : 'micTest.start')}
        </button>
        {phase === 'recording' && (
          <span role="status" className="text-xs text-gray-300">
            {t('micTest.recording')}
          </span>
        )}
      </div>
      {url && <audio ref={audioRef} controls src={url} className="h-10 w-full" aria-label={t('micTest.playback')} />}
      {error && (
        <p role="alert" className="text-xs text-amber-200">
          {error}
        </p>
      )}
    </section>
  )
}
