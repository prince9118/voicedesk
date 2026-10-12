-- DropIndex
DROP INDEX "tickets_status_created_at_idx";

-- CreateIndex
CREATE INDEX "tickets_created_at_id_idx" ON "tickets"("created_at", "id");

-- CreateIndex
CREATE INDEX "tickets_status_created_at_id_idx" ON "tickets"("status", "created_at", "id");
