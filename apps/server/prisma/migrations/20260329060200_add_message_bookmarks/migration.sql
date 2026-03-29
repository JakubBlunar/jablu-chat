-- CreateTable
CREATE TABLE "message_bookmarks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_bookmarks_user_id_created_at_idx" ON "message_bookmarks"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_bookmarks_user_id_message_id_key" ON "message_bookmarks"("user_id", "message_id");

-- AddForeignKey
ALTER TABLE "message_bookmarks" ADD CONSTRAINT "message_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_bookmarks" ADD CONSTRAINT "message_bookmarks_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
