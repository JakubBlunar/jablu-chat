-- Server onboarding config
ALTER TABLE "servers" ADD COLUMN "onboarding_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "servers" ADD COLUMN "onboarding_message" TEXT;

-- Role self-assignable flag (for onboarding role picker)
ALTER TABLE "server_roles" ADD COLUMN "self_assignable" BOOLEAN NOT NULL DEFAULT false;

-- Track whether member has completed onboarding (default true for existing members)
ALTER TABLE "server_members" ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT true;
