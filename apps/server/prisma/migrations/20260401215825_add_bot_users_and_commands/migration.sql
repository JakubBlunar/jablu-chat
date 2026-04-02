-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_bot" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bot_applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_commands" (
    "id" TEXT NOT NULL,
    "bot_app_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bot_applications_user_id_key" ON "bot_applications"("user_id");

-- CreateIndex
CREATE INDEX "bot_applications_owner_id_idx" ON "bot_applications"("owner_id");

-- CreateIndex
CREATE INDEX "bot_commands_bot_app_id_idx" ON "bot_commands"("bot_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_commands_bot_app_id_name_key" ON "bot_commands"("bot_app_id", "name");

-- AddForeignKey
ALTER TABLE "bot_applications" ADD CONSTRAINT "bot_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_applications" ADD CONSTRAINT "bot_applications_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_commands" ADD CONSTRAINT "bot_commands_bot_app_id_fkey" FOREIGN KEY ("bot_app_id") REFERENCES "bot_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
