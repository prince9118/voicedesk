/*
  Warnings:

  - You are about to drop the column `customer_email` on the `tickets` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `tickets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('customer', 'agent');

-- AlterTable
ALTER TABLE "tickets" DROP COLUMN "customer_email",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'customer';

-- CreateIndex
CREATE INDEX "tickets_user_id_created_at_id_idx" ON "tickets"("user_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
