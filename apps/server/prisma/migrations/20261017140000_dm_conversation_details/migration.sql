ALTER TABLE "direct_conversations" ADD COLUMN "group_avatar_url" TEXT;
ALTER TABLE "direct_conversation_members"
  ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marked_unread" BOOLEAN NOT NULL DEFAULT false;
