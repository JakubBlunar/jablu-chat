ALTER TABLE "users" ADD COLUMN "locale" TEXT;

-- The previous migration defaults existing subscriptions to English, so only
-- treat a non-default locale as an existing user preference.
WITH latest_subscription_locale AS (
  SELECT DISTINCT ON ("user_id") "user_id", "locale"
  FROM "push_subscriptions"
  ORDER BY "user_id", "created_at" DESC, "id" DESC
)
UPDATE "users" AS u
SET "locale" = latest_subscription_locale."locale"
FROM latest_subscription_locale
WHERE u."id" = latest_subscription_locale."user_id"
  AND latest_subscription_locale."locale" <> 'en';

UPDATE "push_subscriptions" AS subscription
SET "locale" = u."locale"
FROM "users" AS u
WHERE subscription."user_id" = u."id"
  AND u."locale" IS NOT NULL
  AND subscription."locale" IS DISTINCT FROM u."locale";
