// Loads apps/api/knowledge/*.md into the database. Safe to run repeatedly:
//   - unchanged files (same SHA-256) are skipped,
//   - changed files have all their chunks replaced in one transaction, so a search never sees a
//     half-updated article,
//   - articles whose file was deleted are removed, so the assistant cannot quote stale content.
// Usage (from apps/api): npm run kb:ingest
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../db.js";
import { parseArticle } from "../kb/chunking.js";

const KNOWLEDGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../knowledge");

const files = (await readdir(KNOWLEDGE_DIR)).filter((f) => f.endsWith(".md")).sort();
const summary = { added: 0, updated: 0, unchanged: 0, removed: 0, chunks: 0 };

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const markdown = await readFile(path.join(KNOWLEDGE_DIR, file), "utf8");
  const contentHash = createHash("sha256").update(markdown).digest("hex");

  const existing = await prisma.kbDocument.findUnique({ where: { slug }, select: { contentHash: true } });
  if (existing?.contentHash === contentHash) {
    summary.unchanged++;
    continue;
  }

  const article = parseArticle(markdown, slug);
  await prisma.$transaction(async (tx) => {
    const doc = await tx.kbDocument.upsert({
      where: { slug },
      create: { slug, title: article.title, contentHash },
      update: { title: article.title, contentHash },
    });
    await tx.kbChunk.deleteMany({ where: { documentId: doc.id } });
    await tx.kbChunk.createMany({
      data: article.chunks.map((chunk, position) => ({ documentId: doc.id, position, ...chunk })),
    });
  });
  summary.chunks += article.chunks.length;
  if (existing) summary.updated++;
  else summary.added++;
}

const removed = await prisma.kbDocument.deleteMany({
  where: { slug: { notIn: files.map((f) => f.replace(/\.md$/, "")) } },
});
summary.removed = removed.count;

console.log(
  `Knowledge base: ${summary.added} added, ${summary.updated} updated, ${summary.unchanged} unchanged, ` +
    `${summary.removed} removed (${summary.chunks} chunks written)`,
);
await prisma.$disconnect();
