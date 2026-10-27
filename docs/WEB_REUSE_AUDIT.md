# Web component and hook reuse audit

Reviewed 27 October 2026. The initial analysis is followed by the implementation progress below.

## Implementation progress

- Phase 1: shared controls adopted in auth alerts, channel/forum textareas, category selection, and repeated header icon actions. Added a header size to IconButton and a prominent appearance to InlineAlert.
- Phase 1 validation: production build, focused lint, 28 auth/control tests, and the local server-settings browser journey passed. The first browser attempt had a transient fetch failure; a clean run without retries passed.
- Test environment: SWC tests require access to the user's native cache outside the sandbox. Tests run successfully with that access; no dependency change was needed.
- Phase 2: shared ChannelDetailsFields and ForumSettingsFields now render create/edit forms. useChannelDraft, useCreateChannel, and useEditChannel separate draft state and request lifecycles from the views. Cancel/reset behavior is owned by the create hook.
- Phase 2 validation: TypeScript, focused lint, six new hook tests, and a real local browser journey passed. The journey creates/edits a forum, verifies persisted values, and checks an unobstructed mobile modal after the drawer closes; its screenshot was visually reviewed.
- Phase 3: one SuggestionList renders mention/channel/command/emoji suggestions. useComposerSuggestions and useAutosizeTextarea separate behavior from ChatInputBar; composerCompletion contains pure parsing/replacement functions and composerTypes holds neutral types. Escape dismissal survives queued detection, and IME Enter does not submit.
- Phase 3 validation: production build and final TypeScript check passed, as did six focused composer tests, lint, and both local desktop/mobile browser journeys.
- Phase 4: desktop/mobile navigation now use one layout-owned ServerDialogs host and testable dialog state hook. Mobile text-channel groups reuse TextChannelItem; useVisibleChannelGroups shares permission filtering and grouping. Mobile channel clicks await navigation before closing the drawer to prevent synthetic-history cleanup restoring the previous URL.
- Phase 4 validation: TypeScript, focused lint, 36 affected unit tests, and four local browser journeys passed. Checks cover touch context menus, preserved unsaved dialog drafts across responsive changes, and mobile channel URL navigation.
- Phase 5: PaginationControls now owns shared previous/page/next rendering in attachments, search, and settings lists. useListPage, usePagedContent, and useMessageSearch separate client paging, server paging, and debounced search from presentation.
- Phase 5 validation: TypeScript, focused lint, 24 pagination/search/media tests, and the large-list desktop/mobile browser journey passed. Updated the existing browser fixture for the current roster API and for settings dialogs that now survive responsive changes.
- Phase 6: reaction details/tooltips share a pure identity resolver and store-binding hook. Speaker subscriptions and time-zone/time conversion helpers are outside UI modules. useMessageComposer now owns UnifiedInput's existing draft, typing, attachment, command, and submission workflow; draft/outbox stores retain persistence and delivery ownership.
- Phase 6 validation: TypeScript, focused lint, 55 affected tests, and both local UI browser journeys passed. New tests cover independent drafts across composer identities, speaker listener cleanup, nickname/DM/unknown identity rules, command expansion, and quiet-hour conversions.
- Phase 7: pending.

## Recommendation

Make reusable React components the primary goal. Consolidate repeated markup, Tailwind class lists, labels, control states, and recurring UI sections behind clear component APIs. Start by using the existing primitives consistently, then extract repeated field groups, suggestion lists, pagination controls, and navigation/dialog presentation.

Extract the related stateful behavior into separate hook modules as those components take shape. The component should own the repeated UI; its hook should expose the state and actions needed to render it. Keep deterministic calculations in plain functions for focused tests.

The intended outcome is simpler consumer code and one place to update each recurring UI pattern. Source duplication and component ownership are the primary measures of success. Bundle measurements are regression checks.

## Component ownership

Use three levels of reuse:

- Existing primitives: Button, IconButton, Input, Textarea, Select, InlineAlert, ModalOverlay, and ModalFooter should own their recurring markup, appearance, and control states.
- Repeated UI groups: ChannelDetailsFields, ForumSettingsFields, SuggestionList, and shared pager presentation should own recognizable groups of elements that currently repeat across views.
- Feature compositions: shared channel-group presentation and ServerDialogs should assemble existing components for recurring feature UI.

Extend existing components such as ToggleRow, SectionHeading, and EventScheduleFields when their contracts fit. Keep feature-specific compositions near their feature; components/ui/ should hold broadly applicable controls.

Prefer small semantic APIs such as variant, size, label, selectedIndex, and explicit callbacks. Use children or limited rendering slots for meaningful content variation. Keep recurring visual styling inside the component, with className available for genuine layout integration.

Each extraction should migrate the duplicated callers in the same change. Replacing copied class lists with shared strings alone leaves duplicated element structure, accessibility, and interaction markup. Use React components where the repeated UI itself can have one owner.

Avoid building a universal component with many mode flags. Share the stable repeated structure and retain clearly different layouts as compositions.

## Baseline and limits

The source inventory excludes declarations, test files, and the test support directory:

- 413 production TypeScript modules.
- 249 modules under components/ and pages/, including their hooks and helpers; this is not a count of distinct React components.
- 28 production UI modules, including the barrel and style recipes.
- 44 standalone modules named use*.ts or use*.tsx across the app. 24 have a directly corresponding sibling test. This is a file inventory, not a coverage measurement.
- 173 test files across src/.

In production TSX consumers under components/ and pages/, excluding components/ui/:

- 396 native button elements, 117 Button uses, and 31 IconButton uses.
- 63 native inputs and 63 Input uses. Many native inputs are appropriate: 17 checkboxes, 6 file inputs, 6 ranges, 5 colors, and 4 radios.
- 8 native textareas versus 7 Textarea uses; 20 native selects versus 12 Select uses.

These are static JSX occurrences, not runtime element counts or a list of mandatory migrations.

Exact repeated literal className strings of at least 60 characters produced 77 duplicate groups and 10,498 repeated UTF-8 source bytes. This intentionally narrow scan excludes templates, cn() arguments, reordered classes, and near duplicates. It includes repeats within the same file. It is not a bundle savings estimate.

The standard production build passed:

    pnpm --filter @chat/web build

Vite reported:

- Main CSS: 102.15 kB minified, 16.93 kB gzip.
- Secondary CSS: 9.98 kB minified, 2.09 kB gzip.
- MainLayout JavaScript chunk: 504.07 kB minified, 135.49 kB gzip.

An additional traversal of emitted static JavaScript imports found about 646 kB raw in the entry graph and 1,749 kB raw in the MainLayout graph, including shared dependencies. The MainLayout figure overlaps the entry graph; do not add them together. These figures exclude dynamic imports, CSS, locale initialization requests, and runtime loading. They are not a browser network or CPU profile.

Large optional assets also exist for syntax highlighting, emoji, voice, and noise suppression. Their size does not mean they are all loaded on first render. Syntax highlighting is already loaded dynamically in MarkdownContent.tsx.

## Existing patterns worth extending

- components/ui/ already supplies Button, IconButton, Input, Textarea, Select, MultiSelect, ModalOverlay, ModalFooter, Spinner, and other primitives.
- controlStyles.ts already centralizes field styles. Input.tsx exports inputFieldClassNames for native fields that need the same styling without its wrapper.
- useSortedChannels and useServerMenuItems already share navigation logic. Extend them instead of introducing parallel alternatives.
- MessageSurface, UnifiedInput, and the message/thread/forum surface adapters already share message UI while retaining different store ownership.
- components/chat/hooks/ already separates message scrolling, actions, typing, read receipts, pins, and profile-card behavior.
- useChatLookups demonstrates a useful split between a testable selector factory and its React binding.
- AuthLayout, AttachmentBrowser, and EventScheduleFields already solve specific presentation reuse needs. There is no need to introduce competing abstractions.

Feature-local hooks are already outside their component implementations. They do not need to move into the global hooks/ directory to be testable.

## Ordered implementation candidates

### 1. Adopt the existing controls and share suggestion presentation

This is the first implementation batch. Replace repeated control markup with the existing React components, extending a small variant API where needed. Migrate the actual consumers so the repeated class lists and control structure disappear from their component files.

Concrete repeated strings:

- The same 196-character textarea style appears four times across CreateChannelModal.tsx, EditChannelModal.tsx, and CreatePostModal.tsx. Use Textarea, or its shared field recipe where a native element is necessary.
- The same 122-character mobile icon-button style appears five times across ChannelInfoDrawer.tsx, MessageArea.tsx, and VoiceRoom.tsx. Use IconButton with an explicit size variant.
- A pagination button style is repeated four times across AttachmentsPager.tsx and SearchDrawer.tsx. Share presentation through a small pager or Button variant while retaining separate pagination models.
- Four auth pages repeat the same error-alert style. Reuse InlineAlert after checking the intended appearance and accessibility behavior.
- Four composer popups repeat selected-row scrolling and very similar list shells.

The composer can use one SuggestionList shell with typed items, a stable item key, selected index, and a renderItem callback. Keep member, channel, command, and emoji row content specialized.

Preserve button type, labels, focus behavior, refs, DOM structure, mobile touch targets, and submission behavior when migrating. Input and Textarea introduce wrapper elements, so they are not always drop-in replacements. Native hidden file inputs, sliders, semantic links, and composite fields should remain appropriate to their purpose.

Use complete static variant maps like Button already does. cn() currently only joins strings: placing a class last does not guarantee it overrides a conflicting utility. Prefer explicit variants; add a class-conflict library only if that need is demonstrated and its bundle cost is justified. See [Tailwind conflicting utilities](https://tailwindcss.com/docs/styling-with-utility-classes).

### 2. Share channel form fields and extract their models

Sources:

- [CreateChannelModal.tsx](../apps/web/src/components/channel/CreateChannelModal.tsx), draft state at line 40.
- [EditChannelModal.tsx](../apps/web/src/components/channel/EditChannelModal.tsx), draft state at line 70; 733 lines in the file.

Share ChannelDetailsFields and ForumSettingsFields, with plain initialization/validation/serialization helpers. Use feature-local create/edit hooks for their distinct save lifecycles.

Creation holds unsaved forum tags; editing manages persisted tags, permissions, archive state, and deletion. Share the overlapping field model without hiding these lifecycle differences behind many mode flags.

Tests should focus on normalization, correct payloads, invalid input, draft reset when channel identity changes, save failure preservation, and duplicate submit prevention.

### 3. Share composer suggestion UI and separate its hooks

Sources:

- [ChatInputBar.tsx](../apps/web/src/components/chat/ChatInputBar.tsx): 961 lines; trigger detection at line 256, insertion at line 318, resizing at line 390, four popup implementations starting at line 725.
- [UnifiedInput.tsx](../apps/web/src/components/chat/UnifiedInput.tsx): 579 lines; draft/outbox coordination, mention subscriptions, upload checks, typing, and submission.

Start with SuggestionList: one React component should own the repeated popup shell, list markup, selected-row styling, and common scrolling behavior. Provide specialized row rendering for mentions, channels, commands, and emoji. Move its stateful selection behavior into a separate hook rather than copying it into each row type.

Supporting boundaries:

- composerCompletion.ts: pure trigger parsing, replacement text, cursor-position calculations, role-name escaping, and command expansion.
- useComposerSuggestions: popup mode, filtered results, selection, keyboard navigation, and dismissal.
- useAutosizeTextarea: measured textarea sizing with explicit min/max behavior.
- useComposerDraft and useComposerTyping: draft identity/lifecycle and context-aware typing throttling.
- useComposerSubmit: coordinate validation and existing outbox operations through explicit inputs.
- SuggestionList: shared popup rendering.

Keep persistent drafts, retries, and message delivery ownership in the existing draft/outbox stores. A hook should adapt that behavior to the UI rather than reimplementing persistence or transport.

Test trigger precedence, Unicode input, quoted roles, empty lists, replacement in the middle of text, caret restoration, Enter/Shift+Enter, composition events, context switches, failed enqueue, file restoration, duplicate submit prevention, and typing timer cleanup. Use pure function tests for parsing and replacement, hook tests for state/timers, and a small number of component integration tests for actual keyboard/focus behavior.

### 4. Share navigation presentation and server dialogs

Sources:

- [ChannelSidebar.tsx](../apps/web/src/components/channel/ChannelSidebar.tsx): 718 lines; dialog state starts at line 152.
- [MobileNavDrawer.tsx](../apps/web/src/components/layout/MobileNavDrawer.tsx): 1,040 lines; similar dialog state starts at line 171.

These files independently assemble similar server menus, channel groups, notification levels, voice actions, and server dialog hosts. Both already use useSortedChannels and useServerMenuItems, so the duplication is partly addressed.

Extract in stages:

1. Shared channel-group components where markup and behavior agree, plus a ServerDialogs host for repeated invite/settings/profile/leaderboard/events/reorder/channel/category/notification/role UI. Pass explicit callbacks or limited rendering slots; keep the desktop sidebar and mobile drawer layouts distinct.
2. A shared useServerNavigationModel that supplies visible channel groups, permissions, unread state, notification levels, and available server actions to those components.
3. A useServerDialogs controller for the shared host. If dialogs must stay coordinated across responsive surfaces, give them one layout-level owner. Calling the same hook in two places creates two independent instances.

Use typed dialog payloads instead of many loosely related boolean flags where the dialogs are mutually exclusive. Retain explicit handling for legitimate nested dialogs. Preserve mobile close-on-navigation, responsive transitions, permission filtering, archived channels, voice join versus view, and leave-server confirmation.

A build warning provides a concrete related bundle issue: ServerProfileModal is dynamically imported by ServerContextMenu, but statically imported by ChannelSidebar, MobileNavDrawer, and MembersTab. A shared lazily loaded dialog host can establish a consistent loading boundary. Measure the resulting import graph instead of assuming the host reduces bytes.

### 5. Share pagination controls and separate loading hooks

Sources:

- [SearchDrawer.tsx](../apps/web/src/components/search/SearchDrawer.tsx): 586 lines; request state and debounce live near the start of the component.
- [PagedContent.tsx](../apps/web/src/components/ui/PagedContent.tsx): loading, retry, page correction, and rendering in one component.
- [ListControls.tsx](../apps/web/src/components/server/server-settings/ListControls.tsx): client-side pagination mixed with controls.

Consolidate repeated previous/next controls and page-label markup into shared pager presentation, with the required variants for compact attachment/search views and settings lists. Adapt their current inputs at the feature boundary instead of duplicating the JSX.

Then extract useMessageSearch for query/scope/offset/debounce/cancellation/retry and usePagedContent for the existing server-page lifecycle. Keep the existing SearchDrawer integration tests, particularly stale-result suppression, transport abort, scope changes, and failed navigation retry.

Client-side list slicing, server offset paging, and cursor history navigation have different contracts. Share their pager controls and small calculations without forcing them through one universal data hook. Do not replace the message history adapters with a generic pagination hook.

The existing createActiveResourceRequest helper is worth evaluating where its ownership semantics fit. Avoid introducing a second fetch/cache framework just to move these effects.

### 6. Small hook extractions and duplicate identity resolution

These extractions support the component work and can accompany the affected UI changes. They are not the first priority ahead of consolidating repeated presentation.

Sources:

- [ListControls.tsx](../apps/web/src/components/server/server-settings/ListControls.tsx), useListPage at line 6.
- [VoiceComponents.tsx](../apps/web/src/components/channel/channel-sidebar/VoiceComponents.tsx), useSpeakingUsers at line 79.
- [ReactionDetailsModal.tsx](../apps/web/src/components/chat/ReactionDetailsModal.tsx), useResolveReactors at line 163.
- [ReactionPill.tsx](../apps/web/src/components/chat/ReactionPill.tsx), useReactorNameResolver at line 283.

Move useListPage into its own hook module while preserving its existing page-reset and deletion-clamping tests. Extract useSpeakingUsers into a voice hook module, with room-change and listener-cleanup tests.

Both reactor hooks resolve self, channel members, and DM participants in the same precedence order, including server-specific display names and an unknown-user fallback. Introduce a pure resolveReactorIdentity function returning the richer identity shape, plus a small useReactorIdentityResolver hook that selects the required store data. Both views can derive their required label or avatar from that result.

Test the self/channel/DM/unknown cases, server nickname precedence, and updates when participants change. Keep subscriptions narrow and consider an indexed lookup for repeated member resolution. Reusing a hook does not reduce the number of subscriptions if every reaction pill still calls it separately.

### 7. Separate voice device and permission behavior

[VoiceSettings.tsx](../apps/web/src/components/voice/VoiceSettings.tsx) is 719 lines and contains device enumeration, permissions, temporary getUserMedia streams, saved selections, push-to-talk capture, processing controls, and rendering.

Extract useMediaDeviceSettings and usePushToTalkCapture around clear resource lifecycles. Keep microphone operations serialized through the existing voice helpers and stores.

Test denied permissions, missing APIs, device disappearance, stale async completion, stream track disposal, listener cleanup, and microphone-operation ordering. Schedule this after the smaller extractions because it touches live media resources and needs browser/device verification.

## Module layout and testing contract

Use three layers:

    Feature view (.tsx)
      -> Feature hook (use*.ts)
        -> Existing store/service and pure model functions (.ts)

Prefer feature-local hooks, such as components/chat/hooks/ and components/voice/hooks/. Put broadly reusable browser/UI hooks in src/hooks/. Avoid a global directory containing every feature-specific hook.

The reusable component owns recurring markup, Tailwind styling, labels, accessibility, and DOM wiring. The separate hook owns one cohesive stateful behavior and exposes domain-oriented actions. A pure helper owns deterministic transformations. Store-owned state remains in the store.

Practical rules:

- A hook can be worth extracting for testability even with one consumer.
- Extract connected behavior rather than every useState call. Small local display state can stay local.
- Accept explicit identities and inputs; pass small dependency interfaces where they meaningfully isolate transport, time, media, or storage in tests.
- Retain stable callbacks and selectors where callers rely on them. A new hook boundary does not prevent rerenders by itself.
- Use renderHook for observable state transitions, rerender with a changed identity to test reset/cancellation, and unmount to test cleanup.
- Keep integration tests for focus, actual DOM events, permission-dependent actions, and navigation outcomes.
- Avoid generic useMount/useEffectOnce/useAsync wrappers that hide dependencies or ownership.

React's guidance supports focused hooks and makes clear that hooks share logic, while each call retains independent state: [Reusing logic with custom hooks](https://react.dev/learn/reusing-logic-with-custom-hooks).

## Delivery order and measurement

Suggested implementation batches:

1. Adopt existing control components across repeated forms, alerts, and icon actions; verify representative desktop/mobile consumers.
2. Extract ChannelDetailsFields and ForumSettingsFields for create/edit reuse, with separate hooks for their distinct save lifecycles.
3. Consolidate the four composer popups into SuggestionList, with a separate suggestion hook and pure completion helpers.
4. Share navigation/group presentation and the ServerDialogs host; extract the model/controller hooks needed by both surfaces.
5. Share pager presentation, separating the associated pagination/search hooks from rendering.
6. Finish independent identity/speaker/list hook extractions and larger composer draft/typing/submission boundaries.
7. Extract voice device hooks with live media verification.

Measure main CSS raw/gzip, entry static graph, authenticated chat static graph, and the affected lazy chunks before and after each relevant batch. Keep optional dependencies behind their existing lazy boundaries. A large shared module or barrel that eagerly imports feature code can erase the savings from deduplication.

The build already places dnd-kit in the emitted entry's static dependency graph. Its owning import/chunk cause was not traced in this audit; investigate separately before attributing it to the UI barrel. Avoid drawing a module-level ownership conclusion from a generated chunk name.

Track duplicated UI patterns removed, migrated consumers, and whether a shared component now owns the recurring class list and element structure. Consumers should read as compositions of named controls and feature sections, with fewer repeated markup blocks and styling decisions.

Do not promise a percentage bundle saving. Success means one place to update recurring UI, simpler consumers, independently testable hooks, and no regression in the measured loading graphs.

## Initial audit validation

- Standard production build: passed, including its TypeScript build.
- AST inventory and emitted static import traversal: completed.
- Focused test command attempted for useSortedChannels, useChatLookups, useMessageActionController, ListControls, and SearchDrawer. Jest stopped before executing any tests because @swc/core could not load its native binding. The tests cannot be claimed as passing in this environment.
- No browser/device behavior validation was performed; implementation-specific regression checks remain part of the proposed batches.
- No application source or dependency changes were made by this audit.
