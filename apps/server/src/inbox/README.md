# Inbox catch-up

All endpoints require `UnifiedAuthGuard` and operate exclusively on the authenticated
account. Targets use the shared `InboxTarget` shape (including explicit nulls).
Unknown fields, invalid UUIDs, invalid dates, contexts mismatched to messages/threads,
and future read cutoffs are rejected.

## HTTP contract

- `GET /api/inbox?view=unread|mentions|replies|later&limit=30&cursor=...`
  returns the shared `InboxPage`. Limit is 1–100. Cursors are opaque, view-specific
  keyset positions carrying the original snapshot timestamp.
- `GET /api/inbox/session` returns `{session: InboxSession | null}`.
- `POST /api/inbox/session` accepts `{view, replace?: boolean}`. An unfinished
  session is reused by default, even when a different view is requested. Set
  `replace: true` to explicitly start over.
- `PUT /api/inbox/session/anchor` accepts `{id, revision, target}`. An anchor must
  name a live message in the current conversation/thread and does not mark it read.
- `POST /api/inbox/session/advance` accepts
  `{id, revision, action: 'done'|'later'|'skip'}`. The result is `{session}`.
  Stale revisions return 409. Done acknowledges through the frozen session
  snapshot, Later saves the anchor/current target without acknowledging, and Skip
  only moves the queue.
- `PUT /api/inbox/later` and `DELETE /api/inbox/later` accept `{target}` in the
  JSON request body and return `{ok: true}`.
- `POST /api/inbox/read` accepts `{target, throughAt: ISO timestamp}` and returns
  `{ok: true}`.

Unavailable targets return 410 with
`{code: 'INBOX_TARGET_UNAVAILABLE', message: 'Inbox target is unavailable'}`.
Session anchor/advance failures additionally include `{id, revision, index}`.
Session loads/reuse return 200 with `{session}` even when entries are unavailable,
preserving the id, revision, frozen queue, and index so clients can always Skip.
Unavailable entries have `name: 'Unavailable'`, null serverName, empty highlights,
zero counts, and `unavailable: true`; an unavailable anchor is returned as null.
If the current anchor is unavailable, its current queue entry is also flagged and
redacted so the client can offer Skip-only controls.
Mutation responses use the same redaction/availability flag. The saved target
identifiers/key remain available solely to preserve queue identity. Skip is
allowed after deletion or permission revocation. Non-Skip actions validate the
persisted target and still reject it with 410; redaction does not grant access.

## Persistence and semantics

Migration `20261018223000_inbox_catchup` only adds tables. Deploy migrations before
starting the updated server. `inbox_later` is unique per account and stable group
key. It stores validated targets, not trusted client metadata, and is independent
of notification retention/caps. `inbox_sessions` persists the complete frozen
ordered queue, counters, anchor, and revision. Transactional compare-and-swap
prevents double advancement/side effects across devices.

Root channel/DM unread counts come from actual messages and membership/read
cutoffs, never from the capped activity feed. Counts cap at 100. Threads enter
the inbox through outstanding directed mention/reply/participation notifications;
thread counts use actual messages and independent persisted thread cutoffs,
not the legacy lifetime coalesced counter. Normal channel/server acknowledgments
continue to acknowledge everything as of now and also update thread baselines.
Inbox root acknowledgments do **not** acknowledge threads.
Pre-feature channel read history is inherited as the initial thread baseline;
before an Inbox root acknowledgment advances that channel cutoff, existing
threads retain their previous independent baseline.

All view filtering and grouping precedes pagination. Counts count groups, not
messages. Highlights are deduplicated per message (at most three); direct replies
also represented as mentions appear in both directed views without duplicated
highlights. Names, permissions, preferences, and messages are batch-resolved
across servers/conversations, not fetched in per-row loops. Effective `none`
preferences and muted DMs are omitted from unread/directed activity; accessible
saved entries remain available despite muting/read status.

Bounded acknowledgments advance cutoffs monotonically, preserve coalesced
notifications updated after the cutoff, and emit actual persisted DM read
receipts. Inbox changes reuse `in_app_notification:users` and
`dm:preferences-read-state` for cross-device refresh. Legacy activity endpoints
are unchanged.

Pagination is a live snapshot-bounded keyset, not a durable session: concurrent
reads, permission changes, deletions, and coalescing may remove a group from later
pages. Start a session when a complete frozen queue is required. Directed activity
is intentionally limited by existing notification eligibility and retention;
Later is capped separately at 1,000 saved targets per account, removing the oldest
entries on save. Saves and session deferrals enforce this cap atomically under
the same per-account lock, including concurrent devices. Re-saving a target
refreshes its saved position and always retains that target. Frozen sessions and
read watermarks are not pruned, so cleanup neither marks messages read nor
rewrites an in-progress queue. Notification history defaults to 1,000 records
(`IN_APP_NOTIFICATION_CAP`); read entries are evicted first.

## Focused tests

`pnpm --filter @chat/server test --runInBand src/inbox src/read-state/read-state.service.spec.ts src/in-app-notifications/in-app-notifications.service.spec.ts`

Set `INBOX_TEST_DATABASE_URL` to a **disposable, migrated PostgreSQL database** to
enable `inbox.integration.spec.ts`; without it only the pure validation tests run.
The integration suite creates account-scoped fixtures and removes them afterward.
