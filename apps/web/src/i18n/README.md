# Internationalization (Phase 5)

## Stack

- **i18next** + **react-i18next** — `initI18n()` in `config.ts` (called from `main.tsx` before first paint) loads locale JSON via Vite `import.meta.glob` so each language/namespace is a separate async chunk. `LocaleSync` loads additional languages when the user switches. Persisted locale is read from the same `jablu-settings` key as the settings store.

## Adding strings

1. Add a key to the right namespace JSON under `locales/en/` (e.g. `settings.json`, `chat.json`, `a11y.json`, `common.json`).
2. Mirror the key in `locales/cs/` and `locales/sk/` when you have a translation (optional — missing keys fall back to English).
3. In components: `const { t } = useTranslation('settings')` then `t('tabs.account')` or `t('appearance.language')`.

Nested keys use dot paths. Do **not** translate user-generated content (messages, names, channel titles).

## New namespace

1. Add `locales/en/<ns>.json` and matching files under `locales/cs/` and `locales/sk/`.
2. Add the namespace id to `I18N_NAMESPACES` in `loadBundles.ts` (order must match files existing for every locale).

## Locale list

Edit `locales.ts` (`APP_LOCALES`, `LOCALE_LABELS`) and add JSON folders for each new language.

## Tests

`src/test/jest-setup-i18n.ts` mocks `useTranslation` so keys render as themselves unless you override the mock.

## Accessibility checklist (P0 surfaces — Phase 5)

- **Keyboard**: Tab order is trapped in `SettingsModal` and `ModalOverlay` dialogs; Escape closes them.
- **Focus**: `:focus-visible` ring in global CSS (`index.css`) for keyboard users.
- **Skip link**: `SkipToMainLink` jumps to `#main-content` (messages / main pane).
- **Landmarks**: Message list is a `role="region"` with a translated `aria-label` (not a noisy live region).
- **Composer**: `ChatInputBar` textarea and icon buttons use translated `aria-label`s.
- **Settings**: Sidebar items use `aria-current="page"` when active; mobile tabs use `role="tab"` / `tablist`.

Re-check with [axe DevTools](https://www.deque.com/axe/devtools/) or similar after large UI changes.
