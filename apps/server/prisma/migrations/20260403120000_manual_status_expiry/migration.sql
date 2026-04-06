-- Manual presence (timed like Discord): idle/dnd/invisible with optional expiry.
ALTER TABLE "users" ADD COLUMN "manual_status" "UserStatus";
ALTER TABLE "users" ADD COLUMN "manual_status_expires_at" TIMESTAMP(3);
