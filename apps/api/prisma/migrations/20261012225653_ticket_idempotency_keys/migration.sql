-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "idempotency_key" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_user_id_idempotency_key_key" ON "tickets"("user_id", "idempotency_key");

