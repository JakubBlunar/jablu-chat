# Message navigation and empty-history regressions

Audit date: 2026-10-30. This covers the web/PWA client and the routing shared with
the desktop shell. It does not establish real-device iOS suspend/push behavior or
native Windows toast delivery.

## Shared navigation contract

All conversation entry points use `openConversation` from
`apps/web/src/lib/conversationNavigation.ts`. A request names its target and
position as data. Feature components do not set selection, preload history, or
build a second loader around the returned promise.

```ts
const outcome = await openConversation({
  target: { kind: 'channel', serverId, channelId },
  position: { kind: 'message', messageId, threadParentId },
  source: 'search'
})
if (outcome.status === 'opened') closeSearch()
```

Targets cover channels, DMs, server landing pages and home. Positions cover unread,
latest, explicit messages and threads. A latest request can retain a thread/post
parent. `conversationPath` and `parseConversationPath` own URL conversion, including
same-origin/hash links, encoding and preservation of unrelated query parameters.

The lifecycle is:

```text
feature intent -> openConversation -> Router commits URL -> useRouteSync
  -> coordinator selects context -> scoped structure/history/reply load
  -> ready | empty | unavailable | error
```

A superseding request resolves the previous request as `cancelled`. A committed
URL is the authority for server/channel/DM selection. `useRouteSync` is the only
Router bridge, and `navigation.store` is the only selection/loading coordinator.
The notification bridge supplies the Router transport for all callers, including
queued cold-start clicks. It remains independent of the conversation stores.

| Owner | Responsibility |
| --- | --- |
| Feature / `useAppNavigate` | Submit one typed intent; optionally react to its outcome |
| `useRouteSync` | Observe committed routes; consume successful focus queries without loading twice |
| `navigation.store` | Select the committed context; prepare structure, history and replies; own cancellation, timeout and retry |
| History stores | Commit data with a loaded-context identity and request-generation guard; support abort |
| Surface adapters | Expose only the selected loaded window; submit jump/latest intents; expose coordinator loading |
| `useMessageScroll` | Position prepared content, highlight/reveal rows and paginate older/newer pages |
| Socket recovery | Catch up the active context; wait for navigation before subscription-ack refreshes |

The coordinator exposes `status`, `request` (including `source`), `routeKey`,
`activeNavId` and `error` for diagnosis. Failures have explicit `unavailable` or
`error` outcomes and a retry of the complete intent. A 15-second foreground
navigation deadline also bounds a transport that ignores abort. Cancellation
invalidates the channel, DM, thread and forum request generations, so a late
response or rejection cannot alter the new destination. Leaving conversation
routes, unmounting and session cleanup cancel outstanding work.

Loaded empty history is a successful `empty` state. Initial loading is visible
before a surface store starts its request, so it cannot masquerade as an empty
channel. Previously loaded data is retained in stores, while adapters prevent it
from being rendered as a different conversation.

`MainLayout` renders its nested route outlet in every responsive layout. Its
index route restores the current account's persisted channel, DM or friends list
on a cold launch, including a desktop restart after an update. Explicit
conversation/message links bypass this restoration.

## Regression rules for new features

1. Call the public `openConversation` API or the thin `useAppNavigate`
   conveniences. Include a reply's parent in the intent.
2. Await the typed outcome when subsequent UI work requires successful
   navigation. Treat `cancelled` as superseded work. Do not introduce sleeps,
   clear history, select stores, or issue a separate initial fetch.
3. Keep pagination and background recovery scoped to their loaded context and
   generation. Background refresh must not compete with a foreground load.
4. Add a coordinator contract case for new navigation semantics and a browser
   case for a new user entry point or lifecycle race.

`conversationArchitecture.test.ts` scans production TypeScript with the TypeScript
parser during the ordinary web test run. It rejects feature-level selection
setters (including destructured setters and direct selection `setState`), legacy
preload APIs, direct thread/post opens, raw conversation navigation calls and
initial-history reads outside the listed owners. The scroll hook may fetch an
older page, but cannot become an initial loader again. Test examples verify that
the guard detects these violations. The guard complements runtime tests; it is
not a proof against every possible indirect call.

## Entry points and coverage

| Entry point | Shared path | Coverage |
| --- | --- | --- |
| Inbox Notifications | Typed intent from notification payload | Notification navigation/unit tests; repeated and cross-server browser cases |
| Inbox unread, mentions, replies, Later, catch-up/resume | Typed reader intent with optional parent | Inbox tests; delayed inbox-reader browser case |
| Browser/desktop notifications | Normalized link -> typed intent | Cold binding/unit tests; same/repeated/cross-channel/cross-server browser cases |
| Push/copy/share links and cold launch | Parsed committed route | Cold URL/reload browser cases; shared-link unit tests; OS delivery not exercised |
| Search results | One typed intent and outcome | Actual search-result clicks in desktop and phone browser tests |
| Saved messages | Typed message/reply intent | Actual cross-server clicks, including mobile drawer closure |
| Pins and reply quotes | Adapter jump intent | Actual pinned/quoted-message clicks in desktop and phone browser tests |
| First unread / unread marker | Coordinator unread anchor / explicit jump | Controlled read-state browser fixture; deleted target and cancellation tests |
| Channels, servers, commands, profiles, links, forwarding | Thin public conveniences or typed intent | Sidebar/cached-return browser cases; navigation/cache journeys |
| DM rail, unread DM shortcuts and DM links | Same coordinator with a DM target | DM/server transition browser cases; store and adapter tests |
| Thread/forum opening and reply links | Parent plus optional focused reply in one request | Real persisted thread/forum browser cases; contract/store tests |
| Back/Forward and last-location restoration | Same committed-route bridge | Browser Back/Forward/reload; route-sync and cache tests |
| Resume/reconnect, including tray restore | Scoped catch-up and cache revalidation | Browser visibility/offline/online case; socket/watch-ack tests |
| Older/newer pages and latest | Pagination / coordinator latest intent | Pagination/scroll tests; thread-latest contract test |

Browser tests run in Chromium and WebKit, each at desktop and 390x844 phone sizes.
They use real local API message responses, PostgreSQL, Redis and socket replies.
Unread fixtures control read state; race/failure cases delay or fail selected
requests. Failure cases clear memory and disk history for the destination so a
successful cache hit cannot bypass the intended foreground failure. The
notification bridge is invoked directly, without sending OS push.

## Causes addressed

The earlier design had independent preloads, route/query loaders, surface initial
loaders and subscription refreshes. One request could replace another's history
without releasing its hidden positioning state. A preload could also select a
server before its URL committed, while an old completion could restore an earlier
URL or unread anchor. The consolidated coordinator removes those competing
navigation owners and guards both history writes and route completion.

The changes also scope old scroll targets to their loaded context, distinguish
deleted targets from network failures, centralize mobile drawer closure, remove
duplicate forum reply loading, and stop obsolete server-resource effects from
clearing route-selected history. Subscription acknowledgements wait for the full
navigation (including replies), then refresh only the still-selected, prepared
context. Already-mounted virtual rows no longer perform an unnecessary reveal.

## Re-running locally

Start the dev infrastructure and API/web processes using the repository's local
environment. Apply existing pending migrations with
`pnpm --filter @chat/server db:migrate:deploy`. The suite requires the existing
local test account credentials in `.playwright-mcp/.test-credentials.json` and
superadmin credentials in the local environment. It creates disposable servers;
the DM case only reads a seeded test conversation.

```powershell
docker compose -f docker-compose.dev.yml up -d postgres redis mailpit
pnpm exec playwright install chromium webkit
pnpm test:navigation
pnpm test:navigation:e2e
pnpm --filter @chat/web test -- --runInBand
pnpm --filter @chat/web typecheck
pnpm --filter @chat/web build
```

The API must be running on port 3001. The navigation config starts and stops a
fresh Vite instance on port 5180. This also avoids duplicate dev-store modules
when computed test imports and a previously hot-reloaded module graph have
different timestamps. A physical iPhone PWA
sleep/wake test and packaged Windows notification test remain useful acceptance
checks. This audit reduces the identified failure paths; it cannot guarantee that
future changes will never introduce another navigation regression.

## Validation on 2026-10-30

- 56 local browser cases passed: 14 scenarios × desktop/phone × Chromium/WebKit.
- The existing Tauri-shell browser simulation passed for repeated notification
  jumps, window geometry and Back/Forward. Its synthetic socket is isolated from
  the running backend so an authentication rejection cannot add a real banner.
- All 200 web test suites passed (1,618 tests), including architecture guards.
- TypeScript, changed-source ESLint and the production build passed.
- Existing pending local migrations `20261027140000_storage_cleanup_safety` and
  `20261027143000_storage_cleanup_references` were applied to the Docker test DB.
