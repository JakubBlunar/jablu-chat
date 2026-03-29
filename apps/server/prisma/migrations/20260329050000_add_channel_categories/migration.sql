-- CreateTable
CREATE TABLE "channel_categories" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "channels" ADD COLUMN "category_id" TEXT;

-- AddForeignKey
ALTER TABLE "channel_categories" ADD CONSTRAINT "channel_categories_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "channel_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
