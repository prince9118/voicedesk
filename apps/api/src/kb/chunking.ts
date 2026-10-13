// Splits a help article into retrievable chunks. Articles are markdown with one "# Title" and
// "## Section" headings; each section becomes one chunk, because a section answers one question.
// Long sections are split on paragraph boundaries so a single chunk never floods the LLM's context.

const MAX_CHUNK_CHARS = 1200;

export interface ParsedArticle {
  title: string;
  chunks: { heading: string; content: string }[];
}

export function parseArticle(markdown: string, fallbackTitle: string): ParsedArticle {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = fallbackTitle;
  const sections: { heading: string; lines: string[] }[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      sections.push({ heading: line.slice(3).trim(), lines: [] });
    } else if (sections.length > 0) {
      sections.at(-1)?.lines.push(line);
    } else if (line.trim()) {
      // Text before the first "##" belongs to an implicit introduction section.
      sections.push({ heading: title, lines: [line] });
    }
  }

  const chunks = sections.flatMap((section) =>
    splitLong(section.lines.join("\n").trim()).map((content) => ({ heading: section.heading, content })),
  );
  return { title, chunks: chunks.filter((c) => c.content.length > 0) };
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    if (current && current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) parts.push(current);
  return parts;
}
