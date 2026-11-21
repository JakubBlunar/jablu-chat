ALTER TABLE "users"
  ALTER COLUMN "push_suppress_all" DROP DEFAULT,
  ALTER COLUMN "push_suppress_all" DROP NOT NULL;

-- The old false default did not override a device's local notification setting.
UPDATE "users" SET "push_suppress_all" = NULL WHERE "push_suppress_all" = FALSE;
