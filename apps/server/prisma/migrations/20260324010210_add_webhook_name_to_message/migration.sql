-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "webhook_avatar_url" TEXT,
ADD COLUMN     "webhook_name" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
