export type Shortcut = {
  keys: string[]
  description: string
}

export type ShortcutGroup = {
  category: string
  shortcuts: Shortcut[]
}

export const keyboardShortcuts: ShortcutGroup[] = [
  {
    category: 'General',
    shortcuts: [
      { keys: ['Ctrl', '/'], description: 'Open keyboard shortcuts' },
      { keys: ['Escape'], description: 'Close any open modal, panel, or popover' }
    ]
  },
  {
    category: 'Messaging',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line in message' },
      { keys: ['Enter'], description: 'Save edited message' },
      { keys: ['Escape'], description: 'Cancel message editing' }
    ]
  },
  {
    category: 'Search',
    shortcuts: [
      { keys: ['Enter'], description: 'Execute search' },
      { keys: ['Escape'], description: 'Close search' }
    ]
  },
  {
    category: 'Autocomplete',
    shortcuts: [
      { keys: ['↑'], description: 'Previous suggestion' },
      { keys: ['↓'], description: 'Next suggestion' },
      { keys: ['Tab'], description: 'Accept suggestion' },
      { keys: ['Enter'], description: 'Accept suggestion' },
      { keys: ['Escape'], description: 'Dismiss autocomplete' }
    ]
  },
  {
    category: 'Voice',
    shortcuts: [
      { keys: ['Space'], description: 'Push-to-talk (default, configurable)' },
      { keys: ['Escape'], description: 'Cancel PTT key rebind' }
    ]
  },
  {
    category: 'Media',
    shortcuts: [
      { keys: ['Escape'], description: 'Close image / video lightbox' }
    ]
  },
  {
    category: 'Accessibility',
    shortcuts: [
      { keys: ['Tab'], description: 'Move focus to next element' },
      { keys: ['Shift', 'Tab'], description: 'Move focus to previous element' },
      { keys: ['Enter'], description: 'Activate focused element' },
      { keys: ['Space'], description: 'Activate focused element' }
    ]
  }
]
