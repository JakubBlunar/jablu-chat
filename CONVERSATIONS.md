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
