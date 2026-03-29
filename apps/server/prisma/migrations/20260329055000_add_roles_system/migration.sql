-- CreateTable
CREATE TABLE "server_roles" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_permission_overrides" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "channel_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "server_roles_server_id_name_key" ON "server_roles"("server_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "channel_permission_overrides_channel_id_role_id_key" ON "channel_permission_overrides"("channel_id", "role_id");

-- AddForeignKey
ALTER TABLE "server_roles" ADD CONSTRAINT "server_roles_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_permission_overrides" ADD CONSTRAINT "channel_permission_overrides_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_permission_overrides" ADD CONSTRAINT "channel_permission_overrides_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "server_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a default "@everyone" role for every existing server
INSERT INTO "server_roles" ("id", "server_id", "name", "permissions", "is_default", "position")
SELECT gen_random_uuid(), "id", '@everyone', 0, true, 0
FROM "servers";

-- Seed an "admin" role for every existing server (full permissions = all bits set)
INSERT INTO "server_roles" ("id", "server_id", "name", "permissions", "is_default", "position")
SELECT gen_random_uuid(), "id", 'Admin', 2147483647, false, 1
FROM "servers";

-- Add role_id column (nullable first for data migration)
ALTER TABLE "server_members" ADD COLUMN "role_id" TEXT;

-- Assign admin role to owners, default role to everyone else
UPDATE "server_members" sm
SET "role_id" = r."id"
FROM "server_roles" r
JOIN "servers" s ON s."id" = r."server_id"
WHERE sm."server_id" = r."server_id"
  AND sm."role" = 'owner'
  AND r."name" = 'Admin';

UPDATE "server_members" sm
SET "role_id" = r."id"
FROM "server_roles" r
WHERE sm."server_id" = r."server_id"
  AND sm."role" = 'admin'
  AND r."name" = 'Admin'
  AND sm."role_id" IS NULL;

UPDATE "server_members" sm
SET "role_id" = r."id"
FROM "server_roles" r
WHERE sm."server_id" = r."server_id"
  AND r."is_default" = true
  AND sm."role_id" IS NULL;

-- Make role_id NOT NULL now that all rows are populated
ALTER TABLE "server_members" ALTER COLUMN "role_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "server_members" ADD CONSTRAINT "server_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "server_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "server_members_role_id_idx" ON "server_members"("role_id");

-- Drop old role column and enum
ALTER TABLE "server_members" DROP COLUMN "role";
DROP TYPE "ServerRole";
