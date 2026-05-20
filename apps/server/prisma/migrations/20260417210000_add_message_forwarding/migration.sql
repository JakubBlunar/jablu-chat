-- AlterTable
ALTER TABLE "messages"
  ADD COLUMN "forwarded_from_id"           TEXT,
  ADD COLUMN "forwarded_from_channel_id"   TEXT,
  ADD COLUMN "forwarded_from_dm_id"        TEXT,
  ADD COLUMN "forwarded_from_author_id"    TEXT,
  ADD COLUMN "forwarded_from_author_name"  TEXT,
  ADD COLUMN "forwarded_from_channel_name" TEXT,
  ADD COLUMN "forwarded_from_content"      TEXT,
  ADD COLUMN "forwarded_from_created_at"   TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "messages"
  ADD CONSTRAINT "messages_forwarded_from_id_fkey"
  FOREIGN KEY ("forwarded_from_id")
  REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "messages_forwarded_from_id_idx" ON "messages"("forwarded_from_id");
