-- CreateTable
CREATE TABLE "storage_audits" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_size_bytes" BIGINT NOT NULL,
    "limit_bytes" BIGINT NOT NULL,
    "orphaned_count" INTEGER NOT NULL,
    "orphaned_bytes" BIGINT NOT NULL,
    "attachment_count" INTEGER NOT NULL,
    "attachment_bytes" BIGINT NOT NULL,
    "message_count" INTEGER NOT NULL,
    "message_bytes" BIGINT NOT NULL,
    "disk_orphan_count" INTEGER NOT NULL,
    "disk_orphan_bytes" BIGINT NOT NULL,
    "total_freeable" BIGINT NOT NULL,
    "executed_at" TIMESTAMP(3),
    "freed_bytes" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_audits_pkey" PRIMARY KEY ("id")
);
