ALTER TABLE "server_members" ADD COLUMN "display_name" TEXT,
                             ADD COLUMN "bio" TEXT;

ALTER TABLE "users" ADD COLUMN "server_layout" JSONB NOT NULL DEFAULT '[]';
