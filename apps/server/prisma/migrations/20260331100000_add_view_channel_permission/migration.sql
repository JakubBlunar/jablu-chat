-- Grant VIEW_CHANNEL (1<<12 = 4096) to all existing roles so channels
-- remain visible by default. Admins can then deny it per-channel.
UPDATE "server_roles"
SET "permissions" = "permissions" | CAST(4096 AS BIGINT);
