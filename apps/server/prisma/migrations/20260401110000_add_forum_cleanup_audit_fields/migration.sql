ALTER TABLE "storage_audits"
ADD COLUMN "forum_post_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "forum_post_bytes" BIGINT NOT NULL DEFAULT 0;
