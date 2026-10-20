export type Shortcut = {
  keys: string[]
  descriptionKey: string
}

export type ShortcutGroup = {
  categoryKey: string
  shortcuts: Shortcut[]
}

export const keyboardShortcuts: ShortcutGroup[] = [
  {
    categoryKey: 'general',
    shortcuts: [
      { keys: ['Ctrl', 'K'], descriptionKey: 'openCommandPalette' },
      { keys: ['?'], descriptionKey: 'openKeyboardShortcuts' },
      { keys: ['Ctrl', '/'], descriptionKey: 'openKeyboardShortcuts' },
      { keys: ['Escape'], descriptionKey: 'closeModal' }
    ]
  },
  {
    categoryKey: 'messaging',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'sendMessage' },
      { keys: ['Shift', 'Enter'], descriptionKey: 'newLine' },
      { keys: ['Enter'], descriptionKey: 'saveEditedMessage' },
      { keys: ['Escape'], descriptionKey: 'cancelMessageEdit' }
    ]
  },
  {
    categoryKey: 'search',
    shortcuts: [
      { keys: ['Enter'], descriptionKey: 'executeSearch' },
      { keys: ['Escape'], descriptionKey: 'closeSearch' }
    ]
  },
  {
    categoryKey: 'autocomplete',
    shortcuts: [
      { keys: ['↑'], descriptionKey: 'previousSuggestion' },
      { keys: ['↓'], descriptionKey: 'nextSuggestion' },
      { keys: ['Tab'], descriptionKey: 'acceptSuggestion' },
      { keys: ['Enter'], descriptionKey: 'acceptSuggestion' },
      { keys: ['Escape'], descriptionKey: 'dismissAutocomplete' }
    ]
  },
  {
    categoryKey: 'voice',
    shortcuts: [
      { keys: ['Space'], descriptionKey: 'pushToTalk' },
      { keys: ['Escape'], descriptionKey: 'cancelPttRebind' }
    ]
  },
  {
    categoryKey: 'media',
    shortcuts: [{ keys: ['Escape'], descriptionKey: 'closeLightbox' }]
  },
  {
    categoryKey: 'accessibility',
    shortcuts: [
      { keys: ['Tab'], descriptionKey: 'focusNext' },
      { keys: ['Shift', 'Tab'], descriptionKey: 'focusPrevious' },
      { keys: ['Enter'], descriptionKey: 'activateFocused' },
      { keys: ['Space'], descriptionKey: 'activateFocused' }
    ]
  }
]
