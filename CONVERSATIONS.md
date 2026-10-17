# Direct conversations

Open **Conversation info** in the desktop DM header, or tap the conversation
name on mobile. The same panel is available in one-to-one and group DMs.

- **Profile / Members** shows the other person's profile or the group's participants.
- **Media** browses uploaded photos, GIFs and videos with the shared full-screen viewer.
- **Files** shows downloadable attachments, their sizes, senders and dates.
- **Pins** shows pinned messages and supports unpinning.

Media and files are paginated across the entire conversation history, not just
the messages loaded in the chat. **Jump to message** opens the original context.
Deleted messages are excluded. Only current conversation members can list
attachments.

The authenticated `GET /api/dm/:id/attachments` endpoint accepts
`kind=media|files`, zero-based `page` and `limit` (1-100, default 30), and returns
`{ items, total }`. Attachment results include the original `messageId`,
`createdAt` and `authorName`.

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
