-- AlterTable
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;

-- Backfill: set display_name to username for existing users
UPDATE "users" SET "display_name" = "username" WHERE "display_name" IS NULL;
