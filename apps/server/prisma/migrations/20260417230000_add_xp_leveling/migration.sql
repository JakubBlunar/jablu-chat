-- AlterTable
ALTER TABLE "servers"
  ADD COLUMN "xp_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "server_members"
  ADD COLUMN "xp"          INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "level"       INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "last_xp_at"  TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "server_members_server_id_xp_idx" ON "server_members"("server_id", "xp" DESC);
