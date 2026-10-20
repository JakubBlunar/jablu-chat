# Direct conversations

Part of the [Jablu documentation](./README.md).

Open **Conversation info** in the desktop DM header, or tap the conversation
name on mobile. The same panel is available in one-to-one and group DMs.
Mobile headers expose Search directly and mark the conversation-details action
with a chevron. Narrow windows open secondary panels over the conversation
rather than shrinking the message column below a usable width.

On phones, **Chats / Inbox / You** opens navigation, notifications and grouped
settings. The bottom bar hides while composing or while the software keyboard
is open. **You > Appearance > Compact previews** optionally collapses media and
link previews; full previews remain the default.

- **Profile / Members** shows the other person's profile or the group's participants.
- **Media** browses uploaded photos, GIFs and videos with the shared full-screen viewer.
- **Files** shows downloadable attachments, their sizes, senders and dates.
- **Links** collects shared HTTP(S) links, including links without a generated preview.
- **Pins** shows pinned messages and supports unpinning.

Desktop profile popups fit within the browser window wherever they are opened.
They wait for the initial profile details, messaging permissions and member XP,
then measure and reveal the completed card at its final position without an
intermediate jump. They adjust when the window is resized or live content changes,
and scroll internally if the card is too tall. Failed initial requests show an
error instead of leaving the popup hidden; Escape or an outside click can cancel
while it loads.
Mobile profiles keep their modal presentation.

Media and files are paginated across the entire conversation history, not just
the messages loaded in the chat. **Jump to message** opens the original context.
Deleted messages are excluded. Only current conversation members can list
attachments or shared links.

Previews reserve space while loading and expose a retry if the image or video
cannot be loaded. File cards separate **Open original** from **Download**.
Downloads prepare the file only after you request it, rather than fetching every
file in a conversation. Touch browsers that support file sharing show
**Save file** once preparation finishes, so saving/sharing runs from a fresh tap.
The full-screen gallery supports opening and downloading both images and videos.

Message jumps load missing history before highlighting the target. An unavailable
target or failed request does not replace already loaded messages; a notice
provides Retry and Dismiss. Thread and forum replies open in their own context.
Click or tap the quoted message text above a reply to jump to its original
message, or the quoted author's name to open their profile. These are separate
controls; keyboard users can focus either and activate it with Enter or Space.
Replies start a new message group and show a compact author avatar and quote
above the sender, connected to the avatar gutter. Message avatars are 48 pixels
in channels and DMs; consecutive non-reply messages keep compact spacing.
Saved-message jumps update the route and retain the reply's parent-thread target.
Copied and shared message links also retain the parent thread, on both desktop
and mobile.
Paging and returning to the latest messages also expose recoverable failures.

The authenticated `GET /api/dm/:id/attachments` endpoint accepts
`kind=media|files`, zero-based `page` and `limit` (1-100, default 30), and returns
`{ items, total }`. Attachment results include the original `messageId`,
`createdAt` and `authorName`.

The authenticated `GET /api/dm/:id/links` endpoint uses the same pagination
parameters. It pages messages newest first, with all unique links in each
message (not just the first five preview candidates). Results include sender,
date, source-message ID and available preview titles/descriptions.
Counts include messages containing HTTP(S) URL candidates. Malformed links are
not clickable; the entry explains the issue and still lets you open its source.

## Inbox and catch-up

The Inbox opens as a wide workspace on desktop and a full-screen view on phones.
**Unread**, **Mentions**, **Replies** and **Later** group activity by conversation
or thread, across servers and DMs. **Notifications** is the first tab and retains
the notification feed, including friend requests, calls and system notices. Its
live unread badge matches the Inbox button. Opening Inbox selects Notifications
when there are unread notifications; otherwise it remembers the last view you
chose. A count refresh may reveal new notifications on opening, but does not
switch views after you interact with Inbox. Incoming notifications update the
badge without switching your current tab. Continue catch-up is also available
from Notifications; returning from catch-up preserves its conversation view.
Mentions continue to use the existing permission- and notification-preference-aware
delivery pipeline; a reply that also mentions you can appear in both relevant views.
Unread conversations come from message history and read state, not the capped
notification feed. Mentions/replies retain the existing delivery and retention
rules; saved Later entries and frozen queues are stored independently.

**Continue reading** opens the source without marking it read. **Start catch-up**
freezes an ordered queue; newly arriving activity does not reorder your reading.
**Done** acknowledges only activity up to the session's starting snapshot, leaving
newer messages unread. **Skip** advances without acknowledging. **Later** saves
the current conversation/thread and position without marking it read. These are
not timed reminders. Each account keeps up to **1,000 saved Later items**;
saving more automatically removes the oldest saved entries. Saving an existing
item refreshes its saved position without duplicating it. This cleanup does not
delete messages, change read state, or alter a frozen catch-up queue.

Notification history is capped separately at **1,000 records per account** by
default (`IN_APP_NOTIFICATION_CAP`). On delivery, cleanup removes read records
first, then the oldest remaining records if necessary. Existing explicit
environment overrides still apply. No age-based expiry is enabled by default.

Unfinished queues and message/thread positions are saved to your account, so
**Continue catch-up** resumes on another device. Explicit message links still take
priority. Conflicting progress from another device is reported and reloaded rather
than silently overwritten. Unavailable targets can be skipped; failed loads never
display an all-caught-up success state. Normal reading outside Inbox continues to
mark visible latest messages read as before.

The authenticated `/api/inbox` API filters and groups before cursor pagination.
It exposes `/session`, `/session/anchor`, `/session/advance`, `/later` and `/read`
for persisted queues, revision-protected progress, saved targets and bounded read
acknowledgements. Deploy the API, web client and the additive
`20261018223000_inbox_catchup` migration together.

## Message actions

Edits, deletes and reactions require a live connection and bounded server
confirmation; they are not silently queued while offline. Failed edits keep the
entered text, and failed deletes keep the confirmation open for another attempt.
If confirmation times out, check the current message before retrying: the server
may already have applied the action. Reaction failures roll back the optimistic
change unless a room broadcast has already confirmed it.

Forwarding shows a source preview and searchable destination channels. Selecting
a channel does not send anything: review the destination and press **Send**.
The current conversation stays open by default; **Open the destination after
sending** opts into navigation. Retrying within the dialog reuses the same
message ID for that destination to avoid duplicate forwarded copies.

Message menus support arrow keys, Home, End and typing the start of an action's
name, and stay positioned when the window or conversation scrolls. Mobile
clipboard actions close only after successful copying; unavailable or denied
clipboard access is reported.

Translation capabilities and language preferences share their initial requests
instead of loading once per message. Temporary setup failures expose a retry,
and translations of an older message revision are no longer displayed after an
edit. Changing the preferred language takes effect in already-rendered menus.
Cached translation preferences and results are cleared when the account changes.
Desktop translation/action setup is deferred until a menu or emoji picker is
opened, rather than subscribing every message toolbar to action-only state.

## State and session lifecycle

Desktop and mobile action surfaces share permissions, links and mutation handlers
while retaining their own layouts and dismissal behavior. Channel, DM, thread and
forum message collections share immutable mutations: absent targets, duplicate
reactions and identical replacements preserve state identity without notifying
subscribers. Mention and role lookups update reactively after profile/role edits
without rebuilding indexes in every message row or reacting to presence changes.

Account changes clear transient conversation, call, bookmark and translation
state. Logout waits for session cleanup, and a subsequent login waits for pending
cleanup so an old session cannot erase the new one. Independent cleanup steps
still run if another step fails, and failures are reported. Durable account-scoped
drafts and queued outgoing messages are not deleted by logout.

## Drafts and connection loss

Channel, DM and thread composers keep separate, account-scoped drafts on this
device, including reply context and selected files. Switching conversations,
resizing the window or reopening the app does not intentionally discard them.
Draft markers appear beside channels and conversations with unsent content.

Sending first saves the message and its files to a durable device outbox. Queued
messages are sent automatically when the open app reconnects, or the next time
it is opened with a connection. A closed or suspended PWA cannot guarantee
background delivery. Do not clear browser/app storage while drafts or queued
messages are still needed.

Outgoing messages show queued, sending or failed state. Permanent rejections
remain visible with Retry and Discard controls; connection failures retry
automatically. Stable UUID message IDs prevent duplicate messages when the
server saved a message but its acknowledgement was lost. Queued messages never
send under a different signed-in account.

Selected files show their names, sizes and the server's size limit. Oversized
files are flagged before sending when the limit is known. If no limit is
available offline, files can still be queued and are checked before upload.
Uploads show progress for the current file and distinguish uploading from
waiting for message confirmation.

**Restore to composer** copies a permanently failed message and its files into
an empty draft without discarding the failed copy. Edit the text or replace a
file, then Send to replace that failed attempt using the same deduplication ID.
An existing draft is never intentionally overwritten. Retry is disabled while
that message is being edited in the current composer.

## Search

Search starts in the current conversation. Scope controls can widen it to all
DMs or everywhere. Everywhere results share one chronological, paginated list.
Filter buttons can be combined with text or used on their own:

On phones, **Filters** expands the optional controls; results get the space by
default. Active filters remain visible as removable chips in a horizontally
scrollable row, with **Clear filters** preserving the free-text query. Buttons
use human-readable labels while raw query syntax remains supported.

- `has:image`, `has:video`, `has:file`, `has:attachment`, `has:link`, `has:pin`.
- `from:username` or `from:"Display Name"` limits results to a sender.
- Date inputs add `after:YYYY-MM-DD` (inclusive) and `before:YYYY-MM-DD`
  (exclusive), both at midnight UTC.
- Server searches additionally offer `has:poll`, `in:thread`, `in:root` and
  `tag:name` (or `tag:"Tag name"`). Forum replies inherit the root post's tags.

Invalid filters and date ranges show an error rather than being silently
ignored. Only currently accessible channels and conversations are searched.

## Conversation controls

Favorites stay above other conversations. Favorites and mute settings are
personal, stored on the server and refreshed across your devices. Muting
suppresses new DM message/call alerts and unread shortcuts/OS badges, but
messages remain available and retain their unread state. Existing bell records
are not deleted by muting.

**Mark unread** leaves the chat and sets a personal reminder. It does not rewind
read receipts already shown to other participants. Reopening and reading the
conversation clears the reminder.

Inbox, saved messages and pinned-message lists distinguish failed loads from
empty results and keep already loaded entries available when a refresh fails.
Retry repeats the failed load or mark-as-seen operation. Removing a saved
message or pin only succeeds after server confirmation; failures are reported
without intentionally removing the entry.

## Group management

Any current participant can rename the group, upload/remove its avatar, and add
people. Groups have a maximum of 10 participants. Adding someone respects
friends-only DM privacy and gives them access to the **full history**, including
old media and files; the add-people dialog warns about this.

Leaving requires confirmation and removes access to messages, attachments and
calls. It does not delete other participants' messages. Someone must add you
again to restore access. Closing a conversation only hides it from your list;
it does not leave the group.

Deployments must run the standard Prisma migration deployment command before
starting the updated server.

## Desktop layout and appearance

Drag the edges of channel, DM, member and secondary panels to resize them.
Focused resize handles also support the arrow keys, Home and End. Double-click
a handle to reset its width. Width preferences stay on this device; panels
temporarily shrink or open as overlays when there is not enough space to keep
480 pixels for the conversation.

The visible **Commands** button opens the command palette; **Ctrl+K** (or
**Command+K** on macOS) remains available. The palette and shared modal surfaces
contain keyboard focus, announce a dialog name, dismiss only the topmost surface
on Escape and restore focus when closed.

**Settings > Appearance > Text size** scales app text without zooming the
interface or changing stored panel widths. The default is 100%; choices persist
on this device. Phone inputs keep a minimum readable size to avoid input zoom.

## Initial language and installation

A fresh installation selects the first supported device/browser language:
English, Czech or Slovak, including regional variants. Unsupported preferences
fall back to English. An existing saved language always takes precedence.
Change the interface language in **Settings > Appearance**.

Conversation dates, relative day labels, Inbox titles, saved-message controls,
reply controls and media-viewer actions follow the selected app language,
including Czech and Slovak plurals.

Installation suggestions recommend the native desktop app on Windows and the
web app on macOS and mobile devices. macOS Safari's Add to Dock requires macOS
Sonoma 14 or later; Chromium browsers provide their own install controls.
Installer downloads prioritize the current platform and show errors and retry
controls when the download list cannot be loaded.

Suggestions disappear inside the desktop shell or an installed web-app window,
after a browser install event, or when a supported browser confirms a related
installed web app. Browsers do not universally expose installation state; a
website cannot reliably detect an arbitrary existing Windows desktop install.
Downloading an installer is never treated as proof that it was installed.
