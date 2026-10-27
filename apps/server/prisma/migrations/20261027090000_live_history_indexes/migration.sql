-- Partial indexes are maintained here because Prisma cannot express predicates.
-- Keep the existing general indexes: deleted rows and non-history queries still
-- use them. The id tie-breaker also serves both directions of cursor pagination.
CREATE INDEX CONCURRENTLY "messages_live_channel_history_idx"
  ON "messages" ("channel_id", "created_at" DESC, "id" DESC)
  WHERE "deleted" = false AND "thread_parent_id" IS NULL AND "channel_id" IS NOT NULL;

CREATE INDEX CONCURRENTLY "messages_live_dm_history_idx"
  ON "messages" ("direct_conversation_id", "created_at" DESC, "id" DESC)
  WHERE "deleted" = false AND "direct_conversation_id" IS NOT NULL;

CREATE INDEX CONCURRENTLY "messages_live_thread_history_idx"
  ON "messages" ("thread_parent_id", "created_at" DESC, "id" DESC)
  WHERE "deleted" = false AND "thread_parent_id" IS NOT NULL;
