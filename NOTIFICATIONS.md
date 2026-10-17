# Notifications

How Jablu decides that something happened, whether to tell you, and which of
your devices to tell.

## The goal

Unread DMs appear above the server list on desktop and mobile with a per-conversation
count (displayed up to `99+`). One-to-one shortcuts use the other person's avatar;
group DMs use their name's initial. Shortcuts disappear when the conversation is read,
including when it is read on another device.

Per-conversation DM mute settings suppress message/call alerts, new DM bell
records, unread shortcuts and OS/title badge contributions across devices.
Messages still arrive and remain unread in the conversation. Existing bell
records are retained. Favorites affect ordering only, not notification delivery.

Unmuted channels and their servers stay highlighted while unread, including when
notification delivery is set to mentions only. Muted channels have no indicator.
Selection alone does not hide unread indicators.

Numbered server badges count mentions. The page title, PWA badge, Windows taskbar
overlay and tray count combine channel mentions with unread DMs, rather than counting
every ordinary channel message. Counts display up to `99+`; the tray tooltip retains
the exact count and the overlay clears at zero.

The bell counts durable notification records (including coalesced conversations
and non-message events), not unread messages, so its count can legitimately differ
from a server's mention badge.

Discord's behaviour, stated plainly:

1. **Nothing is ever silently lost.** Every notification-producing event writes
   a durable row first. If the push fails, if the socket was down, if the phone
   was off — it is still in the notification center when you come back.
2. **All your devices get told.** Being logged in on desktop and a phone means
   both light up, unless one of them is already showing you the app.
3. **Reading somewhere cleans up everywhere.** Read the latest messages on your phone
   and the desktop toast disappears, and the badge drops on both.
4. **Clicking takes you there.** Every notification with a target routes to it,
   on web, PWA and desktop alike.

## The problem this replaced

The server used to gate push on `hasActiveSocket`: if the user had *any* live
WebSocket, it assumed they were looking at the app and sent nothing.

A desktop app minimised to the tray holds that socket open indefinitely. So the
tray app suppressed push to the phone, while the tray app itself was a frozen
WebView that could not raise a toast either. Both devices stayed silent.

The fix is that presence is now per-session and about *engagement*, not
connectivity.

## Engagement model

Each socket registers a session in `PresenceRegistry`
(`apps/server/src/gateway/presence-registry.ts`) carrying:

| Field         | Source                                                 |
| ------------- | ------------------------------------------------------ |
| `deviceId`    | Stable UUID in the client's `localStorage`             |
| `platform`    | `web` \| `desktop` \| `mobile` \| `bot`                |
| `visibility`  | `visible` \| `hidden`, from the `presence:state` event |
| `focused`     | Whether the window holds focus                         |
| `lastInputAt` | Refreshed by `activity:heartbeat`                      |

A user is **actively engaged** when at least one session is `visible` and has
had input within `AWAY_THRESHOLD_MS` (5 minutes). Only then is push suppressed.

Three deliberate choices:

- **Visibility, not focus, gates push.** Jablu open on a second monitor while
  you work elsewhere still means you will see the message. Waking your phone for
  it would be noise.
- **Input recency matters.** A visible window you walked away from an hour ago
  is not a reader. After five minutes you are treated as away and push resumes.
- **It fails open.** If engagement cannot be determined, push. A duplicate
  notification is a much cheaper mistake than a missed one.

Manual DND counts as engaged, which suppresses push — that is what DND means.

### On the client

`apps/web/src/lib/appVisibility.ts` computes visibility for both platforms. On
web it reads `document.visibilityState` and `document.hasFocus()`. On desktop
the browser's own value is unreliable for a window hidden to the tray, so the
native window state reported by Tauri wins.

`usePresenceReporter` pushes that state to the server on change and on every
reconnect (the server drops session state on disconnect).

## Delivery pipeline

```
producer
   │
   ▼
NotificationsService.dispatch()          ← the only entry point
   │
   ├─ 1. InAppNotificationsService.record()   durable row
   │       └─ emits IN_APP_NOTIFICATION_USERS_EVENT
   │             └─ gateway → socket 'in_app_notification:new' → badge refresh
   │
   └─ 2. PushService.sendToUsers(away recipients only)
```

The ordering is the whole point. The durable row is written before any transport
is attempted, so a push failure downgrades to "you'll see it in the bell"
instead of "it never happened".

### Messages are the one delegation

Channel and DM messages go through `deliverChannelMessage` /
`deliverDmMessage` in `apps/server/src/gateway/message-notifications.ts` rather
than `dispatch`, because they need per-channel preference resolution and
`VIEW_CHANNEL` permission filtering that only they have the context for. They
implement the same record-then-push ordering.

Every path that creates a message routes through them: WebSocket `message:send`,
REST `POST /channels/:id/messages`, webhooks, bots, polls, and the welcome
message. Emitting `message:new` directly was the bug that left webhook and bot
messages with no mentions, no bell row and no push.

## Notification kinds

| Kind              | Trigger                          | Push | Coalesced by         |
| ----------------- | -------------------------------- | ---- | -------------------- |
| `mention`         | @-mentioned in a channel         | yes  | message              |
| `reply`           | Someone replied to your message  | yes  | message              |
| `dm_message`      | Direct message                   | yes  | conversation         |
| `dm_call`         | Incoming direct/group voice call | yes  | call                 |
| `channel_message` | Activity in a channel set to all | yes  | channel              |
| `thread_reply`    | Reply in a thread you follow     | yes  | thread               |
| `friend_request`  | Incoming friend request          | yes  | friendship           |
| `friend_accepted` | Your request was accepted        | yes  | friendship           |
| `moderation`      | Kicked, banned or timed out      | yes  | server + action      |
| `server_event`    | Event starting or starting soon  | yes  | event                |
| `announcement`    | Admin broadcast                  | yes  | not coalesced        |
| `role_changed`    | Roles added or removed           | no   | server               |
| `level_up`        | Crossed an XP threshold          | no   | server               |

Coalescing works through `dedupeKey`: a second message in the same channel
updates the existing row and bumps its count rather than adding another. The
count restarts once the row is read, so the bell never claims "12 new messages"
for a conversation with one unread.

`role_changed` and `level_up` are bell-only by design — worth noticing next time
you look, not worth waking a phone for.

## Reading and cross-device cleanup

Text channels and DMs are automatically acknowledged only when their message surface
is loaded, visible, focused, and within 30 pixels of the bottom, with no newer history
left to load. A short 250 ms debounce coalesces incoming bursts and rechecks focus
before sending. Reading older history, viewing a voice room, minimizing to the tray,
or leaving a conversation does not mark unseen messages read.

The acknowledgement clears the unread marker/banner as well as the counts; the manual
Mark as Read action remains available as an explicit override. Failed acknowledgements
retain unread state. Refreshing unread counts never acknowledges a selected channel
by itself. Unvisited channels are included using server membership as their baseline,
so activity in a new channel survives a reload even before its first read-state row.

`ackChannel` / `ackDm` marks matching in-app rows read and emits two events:

- `IN_APP_NOTIFICATION_USERS_EVENT` → socket `in_app_notification:new` → every
  device refreshes its badge count.
- `NOTIFICATION_CLEAR_EVENT` → socket `notification:clear` carrying the affected
  in-app URLs → every device takes down the matching OS toast.

Clients turn a URL into a notification tag via the shared `notificationTag(url)`
helper. It strips message/thread jump parameters so precise deep links still share
a conversation's `jablu-${path}` tag across the page, service worker and desktop shell.
Call invitation parameters remain part of the tag. `clearNotifications(null)`
clears everything, which is what mark-all-read and returning focus to the app
both do.

## Platform notes

### Web and PWA

Push uses VAPID with `urgency: 'high'` and an explicit TTL, which stops mobile
browsers from batching notifications into a delayed digest.

On iOS Safari, `Notification.requestPermission()` fails silently outside a user
gesture and burns the prompt permanently. So auto-subscribe on login only runs
when permission is *already* granted; the actual prompt happens from the button
in Settings → Notifications.

#### Incoming DM calls

Starting a one-to-one or group call records a `dm_call` notification for every
human invitee, excluding the caller and bots, through `NotificationsService`.
Push uses the existing away/engagement, DND, quiet-hours and push-suppression
rules. Delivery does not block the caller joining the call.

Call pushes expire at the 30-second ringing deadline: expired queued jobs are
dropped, Web Push TTL is capped to the remaining time, and the service worker
ignores already-expired payloads. Ordinary message pushes retain their one-hour
TTL. An already displayed call notification can remain after a call ends.

Both local and push notifications use `/channels/@me/<conversationId>?call=<callId>`
and a call-specific tag, separate from message notifications. Tapping opens that
DM and checks current server state before offering **Join call**. Opening a
notification never acquires the microphone or joins automatically. If the exact
call ended, even if a newer call exists in the same DM, the invitation says it
ended rather than starting/joining a replacement. Active group calls can still be
joined after ringing expires. Calls refresh on reconnect, notification navigation,
and return from the background; check failures show Retry rather than claiming
the call ended. Invitations remain in the bell until read, even after a call ends.

A suspended or closed PWA relies on browser/OS Web Push support and notification
permission, not background JavaScript audio. The notification may make the OS's
normal notification sound, but continuous native-style incoming-call ringing is
not guaranteed. iOS/iPadOS requires an installed Home Screen PWA with permission.
Deploy the `20261017120000_add_dm_call_notifications` database migration before the
updated API, and allow clients to install the updated service worker.

### Desktop (Tauri)

Three things were needed to make the tray case work:

- **WebView2 background throttling is disabled** via `additionalBrowserArgs` in
  `tauri.conf.json`. Without it Chromium freezes the webview of a window hidden
  to the tray, and socket-driven notifications stop arriving entirely.
- **Toasts are raised through the `windows` crate directly** rather than a
  wrapper, so the `Activated` callback runs in-process and can route the click.
  The `ToastNotification` object's lifetime is held in `LIVE_TOASTS`; dropping it
  early silently kills the callback.
- **One AUMID in dev and prod.** Windows routes toast activations by
  AppUserModelID. A dev build registering a different one meant clicks went
  nowhere.

Unread state also surfaces as a red dot on the tray icon and a taskbar overlay
icon.

### Deep links

Notification clicks go through `navigateFromNotification`
(`apps/web/src/lib/notificationNavigation.ts`), which hands off to React Router
via a bridge installed in `App.tsx`. Assigning `window.location.hash` directly —
the previous approach — reloads the app and loses the target on desktop.

The helper queues clicks received before the router mounts, accepts same-origin
path/hash URLs, and rejects cross-origin targets. Message notifications carry
`?m=<messageId>` and thread replies also carry `&thread=<parentId>`. The bell uses
the same route-driven message/thread jump as OS toasts; a target is retained across
login. Jump handling waits for URL/store synchronization and refreshed channel data
instead of applying a new message id to the previous channel.

Cached channel lists are revalidated when entering a server. Explicit navigation to
a missing channel refreshes before resolving it, rather than silently selecting an
unrelated channel. A message notification is not marked read merely by clicking it;
reading its conversation uses the automatic acknowledgement described above.

## Preferences

Per-channel and per-server notification levels (`all` / `mentions` / `none`)
resolve in `effectiveChannelPref`: the channel-level override wins, falling back
to the server member's `notifLevel`, defaulting to `all`.

A reply is delivered like a mention, so a "mentions only" channel still notifies
you when someone replies to you directly.

Quiet hours and suppress-all apply to push only, in
`filterUserIdsForWebPush`. They never suppress the in-app row — muting your phone
should not erase your history. The test notification endpoint bypasses both, so
troubleshooting works during quiet hours.

## Troubleshooting

**Nothing arrives on any device.** Check the browser has permission and a push
subscription exists: Settings → Notifications shows the registered device count
and has a test button that goes straight to `POST /push/test`.

**Arrives on phone but not desktop, or vice versa.** One device is reporting
itself as engaged. Check the `presence:state` events that device is emitting; a
desktop window that is visible with recent input correctly suppresses push
elsewhere.

**Nothing arrives while the desktop app sits in the tray.** Confirm the
`additionalBrowserArgs` throttling flags are present in the running build. A
frozen WebView produces no toasts and holds the socket open, suppressing push.

**Clicking a desktop toast does nothing.** Check the AUMID matches between the
running build and what `register_aumid` set. The click path logs at each stage
(Rust `on_activated`, Tauri emit, JS listener, router navigate).

**The badge does not drop after reading.** The ack path is
`ackChannel` → `markChannelRead` → `IN_APP_NOTIFICATION_USERS_EVENT`. If a new
kind is channel-scoped it must be listed in `channelScopedMatchers`, or opening
the channel will not clear it.

## File map

### Server

| Path                                            | Role                                    |
| ----------------------------------------------- | --------------------------------------- |
| `notifications/notifications.service.ts`        | `dispatch` facade — the entry point     |
| `in-app-notifications/in-app-notifications.service.ts` | Durable rows, coalescing, read state |
| `push/push.service.ts`                          | Web Push transport, quiet hours         |
| `gateway/presence-registry.ts`                  | Per-session engagement state            |
| `gateway/message-notifications.ts`              | Message delivery fan-out                |
| `gateway/gateway-push-helpers.ts`               | Recipient resolution for message push   |
| `gateway/gateway-event-listeners.ts`            | Event bus → notification producers      |

### Web

| Path                                    | Role                                      |
| --------------------------------------- | ----------------------------------------- |
| `lib/notifications.ts`                  | Toast routing, tags, push subscription    |
| `lib/appVisibility.ts`                  | Cross-platform visibility and focus       |
| `lib/notificationNavigation.ts`         | Deep-link routing through React Router    |
| `lib/deviceId.ts`                       | Stable per-install device identity        |
| `hooks/usePresenceReporter.ts`          | Reports `presence:state` to the server    |
| `stores/notificationCenter.store.ts`    | Bell state, badge count, pagination       |
| `components/notifications/InAppNotificationBell.tsx` | Rendering and click routing  |

### Desktop

| Path                          | Role                                        |
| ----------------------------- | ------------------------------------------- |
| `src-tauri/src/notifications.rs` | WinRT toasts, activation, Action Center   |
| `src-tauri/src/badges.rs`     | Tray dot and taskbar overlay icons          |
| `src-tauri/src/lib.rs`        | Window state events, tray, commands         |
| `src-tauri/tauri.conf.json`   | WebView2 throttling flags                   |

## Adding a new notification

See [`.cursor/rules/notifications.mdc`](./.cursor/rules/notifications.mdc) for
the checklist. In short: add the enum value plus a migration, mirror it in the
web types, call `dispatch` from the producer, render and route it in the bell,
and add it to `channelScopedMatchers` if it is channel-scoped.
