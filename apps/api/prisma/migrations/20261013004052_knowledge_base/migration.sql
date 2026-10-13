-- CreateTable
CREATE TABLE "kb_documents" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kb_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "heading" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_documents_slug_key" ON "kb_documents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "kb_chunks_document_id_position_key" ON "kb_chunks"("document_id", "position");

-- AddForeignKey
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

