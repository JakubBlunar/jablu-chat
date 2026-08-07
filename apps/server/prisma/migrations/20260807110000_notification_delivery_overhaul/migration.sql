-- AlterTable
ALTER TABLE "push_subscriptions" ADD COLUMN "device_id" TEXT;

-- AlterEnum
ALTER TYPE "InAppNotificationKind" ADD VALUE 'reply';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'moderation';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'role_changed';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'level_up';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'server_event';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'announcement';
ALTER TYPE "InAppNotificationKind" ADD VALUE 'friend_accepted';
