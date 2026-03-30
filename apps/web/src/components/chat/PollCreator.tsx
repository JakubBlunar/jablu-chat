import { useCallback, useState } from 'react'
import { Button, IconButton, Input } from '@/components/ui'
import { api } from '@/lib/api'
import { useMessageStore } from '@/stores/message.store'

export function PollCreator({
  channelId,
  onClose
}: {
  channelId: string
  onClose: () => void
}) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiSelect, setMultiSelect] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addOption = useCallback(() => {
    if (options.length < 10) setOptions((o) => [...o, ''])
  }, [options.length])

  const removeOption = useCallback(
    (idx: number) => {
      if (options.length <= 2) return
      setOptions((o) => o.filter((_, i) => i !== idx))
    },
    [options.length]
  )

  const updateOption = useCallback((idx: number, value: string) => {
    setOptions((o) => o.map((v, i) => (i === idx ? value : v)))
  }, [])

  const canSubmit = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const validOptions = options.map((o) => o.trim()).filter(Boolean)
      const msg = await api.createPoll(channelId, question.trim(), validOptions, multiSelect)
      useMessageStore.getState().addMessage(msg)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create poll')
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, submitting, options, channelId, question, multiSelect, onClose])

  return (
    <div className="rounded-lg border border-white/10 bg-surface-dark p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Create a Poll</h3>
        <IconButton type="button" label="Close" size="sm" onClick={onClose}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      <div className="space-y-3">
        <Input
          id="poll-question"
          label="Question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          maxLength={200}
          className="rounded-md border-0 bg-surface ring-white/10 focus:ring-primary"
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Options</label>
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-1.5">
                <Input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  className="min-w-0 flex-1 rounded-md border-0 bg-surface py-1.5 ring-white/10 focus:ring-primary"
                />
                {options.length > 2 && (
                  <IconButton
                    type="button"
                    label="Remove option"
                    size="md"
                    onClick={() => removeOption(i)}
                    className="text-gray-500 hover:text-red-400"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                )}
              </div>
            ))}
          </div>
          {options.length < 10 && (
            <button
              type="button"
              onClick={addOption}
              className="mt-1.5 text-xs font-medium text-primary/70 transition hover:text-primary"
            >
              + Add option
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={multiSelect}
            onChange={(e) => setMultiSelect(e.target.checked)}
            className="rounded border-white/20 bg-surface text-primary focus:ring-primary/50"
          />
          Allow multiple selections
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="rounded-md">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
            className="rounded-md"
          >
            {submitting ? 'Creating...' : 'Create Poll'}
          </Button>
        </div>
      </div>
    </div>
  )
}
