-- Step 1: Add isAdmin column to server_roles
ALTER TABLE "server_roles" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Mark the seeded "Owner" roles as isAdmin
UPDATE "server_roles" SET "is_admin" = true WHERE "position" = 100;

-- Step 3: Create the join table
CREATE TABLE "server_member_roles" (
    "user_id"   TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "role_id"   TEXT NOT NULL,
    CONSTRAINT "server_member_roles_pkey" PRIMARY KEY ("user_id", "server_id", "role_id")
);
CREATE INDEX "server_member_roles_role_id_idx" ON "server_member_roles"("role_id");

-- Step 4: Migrate existing data — copy non-@everyone role assignments to join table
INSERT INTO "server_member_roles" ("user_id", "server_id", "role_id")
SELECT sm."user_id", sm."server_id", sm."role_id"
FROM "server_members" sm
JOIN "server_roles" sr ON sr."id" = sm."role_id"
WHERE sr."is_default" = false;

-- Step 5: Add foreign keys on the join table
ALTER TABLE "server_member_roles"
  ADD CONSTRAINT "server_member_roles_member_fkey"
    FOREIGN KEY ("user_id", "server_id")
    REFERENCES "server_members"("user_id", "server_id")
    ON DELETE CASCADE,
  ADD CONSTRAINT "server_member_roles_role_fkey"
    FOREIGN KEY ("role_id")
    REFERENCES "server_roles"("id")
    ON DELETE CASCADE;

-- Step 6: Drop the old roleId column and its FK/index from server_members
ALTER TABLE "server_members" DROP CONSTRAINT IF EXISTS "server_members_role_id_fkey";
DROP INDEX IF EXISTS "server_members_role_id_idx";
ALTER TABLE "server_members" DROP COLUMN "role_id";
