-- CreateTable
CREATE TABLE "server_bans" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "banned_by" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_bans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_bans_server_id_idx" ON "server_bans"("server_id");

-- CreateIndex
CREATE UNIQUE INDEX "server_bans_server_id_user_id_key" ON "server_bans"("server_id", "user_id");

-- AddForeignKey
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_bans" ADD CONSTRAINT "server_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
