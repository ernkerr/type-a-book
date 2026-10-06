// Turns a public-domain plain-text book into the JSON the game reads.
//
//   node scripts/prepare-book.mjs <book.txt> <books/id.json> \
//     --id alice --title "Alice's Adventures in Wonderland" \
//     --author "Lewis Carroll" --year 1865
//
// It keeps only the book itself (no front matter, contents, or any
// distributor's header and license), and converts the text to what a
// typewriter can type: straight quotes, "--" for dashes, no italics.

import { readFileSync, writeFileSync } from "node:fs";

const [src, out, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, "")] = rest[i + 1];
if (!src || !out || !opts.id || !opts.title || !opts.author || !opts.year) {
  console.error("Usage: node scripts/prepare-book.mjs <book.txt> <out.json> --id --title --author --year");
  process.exit(1);
}

let text = readFileSync(src, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const start = text.indexOf("*** START OF");
const end = text.indexOf("*** END OF");
if (start !== -1 && end !== -1) text = text.slice(text.indexOf("\n", start) + 1, end);

const typewriter = (s) =>
  s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—/g, "--")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(/_/g, "")
    .replace(/\[Illustration[^\]]*\]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();

// Chapters start with "CHAPTER I." at the very start of a line. The
// contents list indents them, so it's skipped along with the front matter.
const parts = text.split(/\n(?=CHAPTER [IVXLC]+\.\n)/).slice(1);
if (!parts.length) {
  console.error("No chapters found.");
  process.exit(1);
}

const chapters = parts.map((part) => {
  const lines = part.split("\n");
  const number = lines[0].match(/CHAPTER ([IVXLC]+)\./)[1];
  const title = typewriter(lines[1]);
  const blocks = [];

  for (const para of lines.slice(2).join("\n").split(/\n\s*\n/)) {
    const raw = para.split("\n").filter((l) => l.trim());
    if (!raw.length) continue;

    // "*   *   *" rows mark a scene break.
    if (raw.every((l) => /^[\s*]+$/.test(l))) {
      if (blocks.at(-1)?.type !== "break") blocks.push({ type: "break" });
      continue;
    }

    // Verse keeps its line breaks: lines indented unevenly, a block of only
    // short lines, or 3+ lines that each start with a capital (prose wraps
    // mid-sentence, so its lines rarely all do). Prose is joined.
    const indents = raw.map((l) => l.match(/^ */)[0].length);
    const longest = Math.max(...raw.map((l) => l.trim().length));
    const capitals = raw.length >= 3 && raw.every((l) => /^\s*["'\u2018\u2019\u201C(]*[A-Z]/.test(l));
    const verse =
      new Set(indents).size > 1 || (raw.length > 1 && longest < 45) || capitals;
    if (verse) {
      const base = Math.min(...indents);
      blocks.push({
        type: "verse",
        lines: raw.map((l, i) => ({
          indent: Math.min(8, indents[i] - base),
          text: typewriter(l),
        })),
      });
    } else {
      const joined = typewriter(raw.map((l) => l.trim()).join(" "));
      if (joined) blocks.push({ type: "p", text: joined });
    }
  }
  return { number, title, blocks };
});

const words = chapters
  .flatMap((c) => c.blocks)
  .map((b) => (b.type === "p" ? b.text : b.type === "verse" ? b.lines.map((l) => l.text).join(" ") : ""))
  .join(" ")
  .split(/\s+/)
  .filter(Boolean).length;

const book = {
  id: opts.id,
  title: opts.title,
  author: opts.author,
  year: Number(opts.year),
  words,
  chapters,
};
writeFileSync(out, JSON.stringify(book));
console.log(`${opts.title}: ${chapters.length} chapters, ${words.toLocaleString()} words -> ${out}`);
