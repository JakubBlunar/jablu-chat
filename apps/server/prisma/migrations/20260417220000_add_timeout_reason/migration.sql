-- AlterTable
ALTER TABLE "server_members"
  ADD COLUMN "muted_reason" TEXT,
  ADD COLUMN "muted_by_id"  TEXT;

-- AddForeignKey
ALTER TABLE "server_members"
  ADD CONSTRAINT "server_members_muted_by_id_fkey"
  FOREIGN KEY ("muted_by_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
