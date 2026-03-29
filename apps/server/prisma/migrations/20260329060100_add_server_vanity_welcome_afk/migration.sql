-- AlterTable
ALTER TABLE "servers" ADD COLUMN "vanity_code" TEXT;
ALTER TABLE "servers" ADD COLUMN "welcome_channel_id" TEXT;
ALTER TABLE "servers" ADD COLUMN "welcome_message" TEXT;
ALTER TABLE "servers" ADD COLUMN "afk_channel_id" TEXT;
ALTER TABLE "servers" ADD COLUMN "afk_timeout" INTEGER NOT NULL DEFAULT 300;

-- CreateIndex
CREATE UNIQUE INDEX "servers_vanity_code_key" ON "servers"("vanity_code");

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_welcome_channel_id_fkey" FOREIGN KEY ("welcome_channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_afk_channel_id_fkey" FOREIGN KEY ("afk_channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
