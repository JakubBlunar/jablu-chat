-- DropForeignKey
ALTER TABLE "custom_emojis" DROP CONSTRAINT "custom_emojis_uploaded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_author_id_fkey";

-- DropForeignKey
ALTER TABLE "webhooks" DROP CONSTRAINT "webhooks_created_by_id_fkey";

-- AlterTable
ALTER TABLE "custom_emojis" ALTER COLUMN "uploaded_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invites" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "author_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "webhooks" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_emojis" ADD CONSTRAINT "custom_emojis_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
