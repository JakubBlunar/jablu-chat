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

Media and files are paginated across the entire conversation history, not just
the messages loaded in the chat. **Jump to message** opens the original context.
Deleted messages are excluded. Only current conversation members can list
attachments or shared links.

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

## Search

Search starts in the current conversation. Scope controls can widen it to all
DMs or everywhere. Everywhere results share one chronological, paginated list.
Filter buttons can be combined with text or used on their own:

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
