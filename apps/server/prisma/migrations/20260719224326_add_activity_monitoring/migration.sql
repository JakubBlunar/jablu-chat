-- CreateEnum
CREATE TYPE "ActivityDefaultSharing" AS ENUM ('friends_all', 'friends_small', 'friends_only');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('steam', 'process', 'smtc', 'manual');

-- AlterTable
ALTER TABLE "server_members" ADD COLUMN     "share_activity" BOOLEAN;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activity_default_sharing" "ActivityDefaultSharing" NOT NULL DEFAULT 'friends_all',
ADD COLUMN     "activity_share_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "activity_share_games" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "activity_share_music" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "activity_share_online" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "registered_games" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "ActivitySource" NOT NULL DEFAULT 'manual',
    "executable" TEXT,
    "steam_app_id" TEXT,
    "icon_url" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "last_played_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registered_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registered_games_user_id_idx" ON "registered_games"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "registered_games_user_id_name_key" ON "registered_games"("user_id", "name");

-- AddForeignKey
ALTER TABLE "registered_games" ADD CONSTRAINT "registered_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
