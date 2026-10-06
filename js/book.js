// Turns a book into what the typewriter needs: the things you type, in
// order ("units"), wrapped into lines for the paper's width, and grouped
// into pages.

export const LINES_PER_PAGE = 22;
const PARA_INDENT = 4;
const VERSE_INDENT = 6;

export const typable = (unit) => unit.kind === "para" || unit.kind === "verse";

export function toUnits(book) {
  const units = [];
  book.chapters.forEach((chapter, ch) => {
    units.push({
      kind: "heading",
      ch,
      text: `CHAPTER ${chapter.number}.`,
      sub: chapter.title,
    });
    for (const block of chapter.blocks) {
      if (block.type === "p") {
        units.push({ kind: "para", ch, text: block.text });
      } else if (block.type === "verse") {
        block.lines.forEach((line, i) =>
          units.push({
            kind: "verse",
            ch,
            text: line.text,
            indent: line.indent,
            first: i === 0,
            last: i === block.lines.length - 1,
          }),
        );
      } else {
        units.push({ kind: "break", ch });
      }
    }
  });
  return units;
}

// Every line on the paper. Typed lines cover text[start, end) of their unit
// and end one of three ways: "wrap" (the space at the end returns the
// carriage), "enter" (you press Return), or "hard" (a word too long for the
// line). Lines the machine prints for you (chapter headings, breaks, blank
// lines) have `auto: true`.
export function layout(units, cols) {
  const lines = [];
  const blank = (u) => lines.push({ u, auto: true, text: "" });

  units.forEach((unit, u) => {
    if (unit.kind === "heading") {
      lines.push({ u, auto: true, text: unit.text, center: true, newPage: true });
      lines.push({ u, auto: true, text: unit.sub, center: true });
      blank(u);
      blank(u);
      return;
    }
    if (unit.kind === "break") {
      blank(u);
      lines.push({ u, auto: true, text: "*     *     *", center: true });
      blank(u);
      return;
    }

    if (unit.kind === "verse" && unit.first) blank(u);
    const first = unit.kind === "para" ? PARA_INDENT : VERSE_INDENT + unit.indent;
    const rest = unit.kind === "para" ? 0 : first;
    const { text } = unit;
    let pos = 0;
    let indent = first;
    for (;;) {
      const room = Math.max(8, cols - indent);
      if (text.length - pos <= room) {
        lines.push({ u, start: pos, end: text.length, indent, ends: "enter" });
        break;
      }
      const cut = text.lastIndexOf(" ", pos + room);
      if (cut <= pos) {
        lines.push({ u, start: pos, end: pos + room, indent, ends: "hard" });
        pos += room;
      } else {
        lines.push({ u, start: pos, end: cut + 1, indent, ends: "wrap" });
        pos = cut + 1;
      }
      indent = rest;
    }
    if (unit.kind === "verse" && unit.last) blank(u);
  });

  // Pages: every chapter starts a new sheet, and a sheet holds
  // LINES_PER_PAGE lines. A blank line never starts a sheet.
  let page = -1;
  let row = 0;
  for (const line of lines) {
    const full = row >= LINES_PER_PAGE;
    if (full && line.auto && !line.text && !line.newPage) {
      line.page = page;
      line.row = -1;
      continue;
    }
    if (page < 0 || line.newPage || full) {
      page += 1;
      row = 0;
    }
    line.page = page;
    line.row = row++;
  }
  return lines;
}

// Which line a position is on. A position is a unit and a character in it;
// c === text.length means the Return at the end of the unit.
export function indexLines(lines) {
  const byUnit = new Map();
  lines.forEach((line, i) => {
    if (line.auto) return;
    if (!byUnit.has(line.u)) byUnit.set(line.u, []);
    byUnit.get(line.u).push(i);
  });
  return (u, c) => {
    for (const i of byUnit.get(u) ?? []) {
      const line = lines[i];
      if (c >= line.start && (c < line.end || (line.ends === "enter" && c === line.end))) {
        return i;
      }
    }
    return -1;
  };
}
