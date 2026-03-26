-- CreateEnum
CREATE TYPE "DmPrivacy" AS ENUM ('everyone', 'friends_only');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dm_privacy" "DmPrivacy" NOT NULL DEFAULT 'everyone';
