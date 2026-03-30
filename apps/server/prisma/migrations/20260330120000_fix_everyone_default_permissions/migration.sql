-- Fix @everyone roles: ensure SEND_MESSAGES (1<<6 = 64) is granted,
-- and remove MENTION_EVERYONE (1<<7 = 128) so only admins can use @everyone/@here.
UPDATE "server_roles"
SET "permissions" = ("permissions" | 64) & ~CAST(128 AS BIGINT)
WHERE "is_default" = true
  AND "name" = '@everyone';
