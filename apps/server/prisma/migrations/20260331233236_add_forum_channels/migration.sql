-- CreateEnum
CREATE TYPE "ForumSortOrder" AS ENUM ('latest_activity', 'newest');

-- CreateEnum
CREATE TYPE "ForumLayout" AS ENUM ('list', 'grid');

-- AlterEnum
ALTER TYPE "ChannelType" ADD VALUE 'forum';

-- DropForeignKey
ALTER TABLE "server_member_roles" DROP CONSTRAINT "server_member_roles_member_fkey";

-- DropForeignKey
ALTER TABLE "server_member_roles" DROP CONSTRAINT "server_member_roles_role_fkey";

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "default_layout" "ForumLayout" NOT NULL DEFAULT 'list',
ADD COLUMN     "default_sort_order" "ForumSortOrder" NOT NULL DEFAULT 'latest_activity',
ADD COLUMN     "post_guidelines" TEXT,
ADD COLUMN     "require_tags" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "forum_tags" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forum_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_post_tags" (
    "message_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "forum_post_tags_pkey" PRIMARY KEY ("message_id","tag_id")
);

-- CreateIndex
CREATE INDEX "forum_tags_channel_id_idx" ON "forum_tags"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_tags_channel_id_name_key" ON "forum_tags"("channel_id", "name");

-- AddForeignKey
ALTER TABLE "server_member_roles" ADD CONSTRAINT "server_member_roles_user_id_server_id_fkey" FOREIGN KEY ("user_id", "server_id") REFERENCES "server_members"("user_id", "server_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "server_member_roles" ADD CONSTRAINT "server_member_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "server_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_tags" ADD CONSTRAINT "forum_tags_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_post_tags" ADD CONSTRAINT "forum_post_tags_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_post_tags" ADD CONSTRAINT "forum_post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "forum_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
