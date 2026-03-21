-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "uploader_id" TEXT,
ALTER COLUMN "message_id" DROP NOT NULL;
