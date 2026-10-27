ALTER TABLE "messages" ADD COLUMN "deleted_at" TIMESTAMP(3);
-- Historical removals have no trustworthy deletion timestamp. Start their grace
-- period at migration time instead of pretending they were removed at creation.
UPDATE "messages" SET "deleted_at" = CURRENT_TIMESTAMP WHERE "deleted" = true;
CREATE INDEX "messages_created_at_id_idx" ON "messages"("created_at", "id");
CREATE INDEX "messages_deleted_deleted_at_id_idx" ON "messages"("deleted", "deleted_at", "id");
CREATE INDEX "attachments_created_at_id_idx" ON "attachments"("created_at", "id");
ALTER TABLE "storage_audits"
  ADD COLUMN "plan_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'pressure',
  ADD COLUMN "policy" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "after_size_bytes" BIGINT,
  ADD COLUMN "target_bytes" BIGINT,
  ADD COLUMN "stop_reason" TEXT,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "plan_limited" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "processed_items" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "affected_messages" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "affected_attachments" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "storage_audits_created_at_idx" ON "storage_audits"("created_at");
CREATE TABLE "storage_cleanup_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "audit_id" TEXT NOT NULL REFERENCES "storage_audits"("id") ON DELETE CASCADE,
  "sequence" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "source_id" TEXT,
  "snapshot" JSONB NOT NULL,
  "files" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "freed_bytes" BIGINT NOT NULL DEFAULT 0,
  "error" TEXT,
  CONSTRAINT "storage_cleanup_items_audit_id_sequence_key" UNIQUE ("audit_id", "sequence")
);
CREATE INDEX "storage_cleanup_items_status_idx" ON "storage_cleanup_items"("status");
