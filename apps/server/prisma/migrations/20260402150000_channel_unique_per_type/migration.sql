-- DropIndex
DROP INDEX "channels_server_id_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "channels_server_id_name_type_key" ON "channels"("server_id", "name", "type");
