// Builds every book on the shelf from its public-domain plain text.
//
//   node scripts/build-books.mjs           all books
//   node scripts/build-books.mjs alice     just one
//
// Reads scripts/books.json (what's on the shelf and how each book marks its
// chapters) and scripts/sources/<id>.txt, and writes books/<id>.json plus
// books/index.json, the catalog the shelf is drawn from.
//
// Only the book itself is kept: no front matter, contents, prefaces,
// footnotes, illustrations, publisher's ads, or a distributor's header and
// license. The text is converted to what a typewriter can type: straight
// quotes, "--" for dashes, no italics, plain ASCII.

import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("./", import.meta.url);
const root = new URL("../", import.meta.url);
const config = JSON.parse(readFileSync(new URL("books.json", dir), "utf8"));
const only = process.argv[2];

const SWAPS = [
  [/[“”„«»]/g, '"'],
  [/[‘’‚]/g, "'"],
  [/—/g, "--"],
  [/[–‒]/g, "-"],
  [/…/g, "..."],
  [/æ/g, "ae"],
  [/Æ/g, "AE"],
  [/œ/g, "oe"],
  [/Œ/g, "OE"],
  [/ß/g, "ss"],
  [/£/g, "L"],
  [/½/g, "1/2"],
  [/¼/g, "1/4"],
  [/¾/g, "3/4"],
  [/×/g, "x"],
  [/°/g, " degrees"],
  [/\u2032/g, "'"],
  [/\u2033/g, '"'],
  [/[\p{Zs}\t]/gu, " "],
];

const GREEK = Object.fromEntries(
  [..."αβγδεζηθικλμνξοπρσςτυφχψω"].map((ch, i) =>
    [ch, ["a","b","g","d","e","z","e","th","i","k","l","m","n","x","o","p","r","s","s","t","u","ph","ch","ps","o"][i]],
  ),
);

const unknown = new Map();

function typewriter(s) {
  let out = s;
  for (const [from, to] of SWAPS) out = out.replace(from, to);
  out = out
    .replace(/_/g, "")
    // Footnotes and their markers, and subscripts like H{2}O.
    .replace(/\[Footnote:[^\]]*\]/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\{(\d+)\}/g, "$1")
    .replace(/([.!?"'])\s?\*(?=\s*$|\s+[^*\s])/g, "$1")
    .replace(/\[Illustration[^\]]*\]/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  // Greek words (Meditations has a few) are spelled out in Latin letters.
  out = out.replace(/[\u0370-\u03FF]/g, (ch) => GREEK[ch.toLowerCase()] ?? "");
  for (const ch of out) {
    if (/[^\x20-\x7E]/.test(ch)) unknown.set(ch, (unknown.get(ch) ?? 0) + 1);
  }
  return out.replace(/[^\x20-\x7E]/g, "").replace(/ {2,}/g, " ").trim();
}

// A chapter's title on the line(s) under its heading: a short block, at most
// three lines, of short or all-capital lines.
const looksLikeTitle = (block) =>
  block.length > 0 &&
  block.length <= 3 &&
  !block[0].startsWith("[") &&
  block.every((l) => l.length <= 60 || l === l.toUpperCase());

function parse(text, book) {
  text = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const start = text.indexOf("*** START OF");
  const end = text.indexOf("*** END OF");
  if (start !== -1 && end !== -1) text = text.slice(text.indexOf("\n", start) + 1, end);
  const lines = text.split("\n");

  const heading = new RegExp(book.heading);
  const drop = book.drop ? new RegExp(book.drop) : null;
  const stop = book.stop ? new RegExp(book.stop) : null;

  // A real heading is followed by text: a long line, or at least a title
  // and a line of story. The contents list repeats the headings, but each is
  // followed by the next heading (and at most its title) instead.
  const real = (i) => {
    let seen = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 18); j++) {
      const t = lines[j].trim();
      if (!t) continue;
      if (heading.test(t) || drop?.test(t)) return false;
      if (t.length >= 50 || ++seen >= 2) return true;
    }
    return seen > 0;
  };

  const chapters = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (current && stop?.test(t)) break;

    if (heading.test(t) && real(i)) {
      const m = t.match(heading);
      current = {
        label: typewriter(m.groups.label),
        title: m.groups.title ? typewriter(m.groups.title) : "",
        body: [],
      };
      chapters.push(current);
      if (!current.title && book.titleNext) {
        let j = i + 1;
        const same = [];
        while (j < lines.length && lines[j].trim()) same.push(lines[j++].trim());
        let block = same;
        let k = j;
        if (!same.length) {
          while (k < lines.length && !lines[k].trim()) k++;
          block = [];
          while (k < lines.length && lines[k].trim()) block.push(lines[k++].trim());
        }
        if (looksLikeTitle(block)) {
          current.title = typewriter(block.join(" "));
          i = (same.length ? j : k) - 1;
        }
      }
      continue;
    }
    if (!current) continue;

    if (drop?.test(t)) {
      while (i + 1 < lines.length && lines[i + 1].trim()) i++;
      continue;
    }
    current.body.push(lines[i]);
  }

  // The contents list's last entry can look real when front matter follows
  // it. It repeats the book's last heading, so drop it.
  if (chapters.length > 1 && chapters[0].label === chapters.at(-1).label) chapters.shift();

  return chapters.map(({ label, title, body }) => ({ label, title, blocks: toBlocks(body) }));
}

function toBlocks(body) {
  const blocks = [];
  let inIllustration = false;
  for (const para of body.join("\n").split(/\n\s*\n/)) {
    const raw = para.split("\n").filter((l) => l.trim());
    if (!raw.length) continue;
    const joined = raw.map((l) => l.trim()).join(" ");

    // Illustration captions, even ones spread over several paragraphs.
    if (inIllustration) {
      if (joined.includes("]")) inIllustration = false;
      continue;
    }
    if (joined.startsWith("[Illustration")) {
      if (!joined.includes("]")) inIllustration = true;
      continue;
    }

    // "*   *   *" rows and lone section numerals mark a break.
    if (raw.every((l) => /^[\s*.]+$/.test(l)) || /^[IVXLC]+\.?$/.test(joined)) {
      if (blocks.length && blocks.at(-1).type !== "break") blocks.push({ type: "break" });
      continue;
    }
    if (/^THE END\.?$/i.test(joined)) continue;
    // A footnote's own paragraph.
    if (/^(\[\d+\]|\[Footnote|\*[A-Z])/.test(joined)) continue;

    // Verse keeps its line breaks: lines indented unevenly, a block of only
    // short lines, or 3+ lines that each start with a capital (prose wraps
    // mid-sentence, so its lines rarely all do). Prose is joined.
    const indents = raw.map((l) => l.match(/^ */)[0].length);
    const longest = Math.max(...raw.map((l) => l.trim().length));
    const capitals =
      raw.length >= 3 && raw.every((l) => /^\s*["'‘’“(]*[A-Z]/.test(l));
    const verse = new Set(indents).size > 1 || (raw.length > 1 && longest < 45) || capitals;
    if (verse) {
      const base = Math.min(...indents);
      const lines = raw
        .map((l, i) => ({ indent: Math.min(8, indents[i] - base), text: typewriter(l) }))
        .filter((l) => l.text);
      if (lines.length) blocks.push({ type: "verse", lines });
    } else {
      const text = typewriter(joined);
      if (text) blocks.push({ type: "p", text });
    }
  }
  while (blocks.at(-1)?.type === "break") blocks.pop();
  return blocks;
}

const countWords = (chapters) =>
  chapters
    .flatMap((c) => c.blocks)
    .map((b) => (b.type === "p" ? b.text : b.type === "verse" ? b.lines.map((l) => l.text).join(" ") : ""))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

const catalog = [];
let failed = false;
for (const book of config.books) {
  if (only && book.id !== only) continue;
  unknown.clear();
  const text = readFileSync(new URL(`sources/${book.id}.txt`, dir), "utf8");
  const chapters = parse(text, book);
  const words = countWords(chapters);
  const ok = !book.expect || chapters.length === book.expect;
  if (!ok) failed = true;
  const odd = [...unknown].map(([ch, n]) => `${ch}x${n}`).join(" ");
  console.log(
    `${ok ? "  " : "!!"} ${book.id.padEnd(24)} ${String(chapters.length).padStart(3)} chapters` +
      `${ok ? "" : ` (expected ${book.expect})`}  ${words.toLocaleString().padStart(7)} words` +
      `${odd ? `  dropped: ${odd}` : ""}`,
  );
  writeFileSync(
    new URL(`books/${book.id}.json`, root),
    JSON.stringify({ id: book.id, title: book.title, author: book.author, year: book.year, words, chapters }),
  );
  const { id, title, spine, author, translator, year, cloth, gilt, emblem } = book;
  catalog.push({ id, title, spine, author, translator, year, cloth, gilt, emblem, words, chapters: chapters.length });
}

if (!only) {
  writeFileSync(
    new URL("books/index.json", root),
    JSON.stringify({ shelves: config.shelves, books: catalog }, null, 1),
  );
}
if (failed) process.exitCode = 1;
