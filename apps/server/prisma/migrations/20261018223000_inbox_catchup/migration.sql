CREATE TABLE "inbox_later" (
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "target" JSONB NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inbox_later_pkey" PRIMARY KEY ("user_id", "key"),
    CONSTRAINT "inbox_later_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "inbox_sessions" (
    "user_id" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    CONSTRAINT "inbox_sessions_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "inbox_sessions_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "inbox_sessions_id_key" ON "inbox_sessions"("id");

CREATE TABLE "inbox_thread_read_states" (
    "user_id" TEXT NOT NULL,
    "thread_parent_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inbox_thread_read_states_pkey" PRIMARY KEY ("user_id", "thread_parent_id"),
    CONSTRAINT "inbox_thread_read_states_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inbox_thread_read_states_thread_parent_id_fkey" FOREIGN KEY ("thread_parent_id")
        REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "inbox_thread_read_states_thread_parent_id_idx"
    ON "inbox_thread_read_states"("thread_parent_id");
