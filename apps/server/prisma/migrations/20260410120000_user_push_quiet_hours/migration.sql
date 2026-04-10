-- AlterTable
ALTER TABLE "users" ADD COLUMN     "push_suppress_all" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "push_quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "push_quiet_hours_tz" TEXT,
ADD COLUMN     "push_quiet_hours_start_min" INTEGER NOT NULL DEFAULT 1320,
ADD COLUMN     "push_quiet_hours_end_min" INTEGER NOT NULL DEFAULT 480;
