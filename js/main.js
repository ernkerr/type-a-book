import { LINES_PER_PAGE, indexLines, layout, toUnits, typable } from "./book.js";
import * as sound from "./sound.js";

// The shelves come from books/index.json, made by scripts/build-books.mjs:
// each book is a public-domain text in books/<id>.json with a cloth color
// for its spine and cover.
let catalog = { shelves: [], books: [] };

// The paper: side margins and the blank lines above and below the text,
// in characters and lines.
const MARGIN = 5;
const TOP = 3;
const BOTTOM = 3;
const BELL_AT = 8; // the bell rings this many characters before the margin
const HINT_UNTIL = 40; // the how-to card leaves after this many right keys
const BARS = 34; // typebars in the basket

const $ = (sel) => document.querySelector(sel);
const els = {
  shelf: $("#shelf"),
  shelves: $("#shelves"),
  resume: $("#resume"),
  cover: $("#cover"),
  coverArt: $("#cover-art"),
  coverTitle: $("#cover-title"),
  coverByline: $("#cover-byline"),
  coverFacts: $("#cover-facts"),
  coverProgress: $("#cover-progress"),
  start: $("#start"),
  restart: $("#restart"),
  closeCover: $("#close-cover"),
  desk: $("#desk"),
  back: $("#back"),
  chapter: $("#chapter"),
  stats: $("#stats"),
  soundBtn: $("#sound"),
  stage: $("#stage"),
  carriage: $("#carriage"),
  lever: $("#lever"),
  guide: $(".guide"),
  feed: $("#feed"),
  paper: $("#paper"),
  basket: $("#basket"),
  bell: $("#bell"),
  keys: $("#keys"),
  stack: $("#stack"),
  stackSheets: $("#stack-sheets"),
  stackLabel: $("#stack-label"),
  hint: $("#hint"),
  hintClose: $("#hint-close"),
  tap: $("#tap"),
  input: $("#input"),
  reading: $("#now-reading"),
  card: $("#card"),
  cardKicker: $("#card-kicker"),
  cardTitle: $("#card-title"),
  cardStamp: $("#card-stamp"),
  cardWords: $("#card-words"),
  cardTime: $("#card-time"),
  cardWpm: $("#card-wpm"),
  cardNext: $("#card-next"),
  cardShelf: $("#card-shelf"),
  cardTip: $("#card-tip"),
  shareCover: $("#share-cover"),
  cardShare: $("#card-share"),
};

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or storage off: progress just won't be kept.
    }
  },
};
const saveKey = (id) => `type-a-book:${id}`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- State ----

const loaded = new Map();
let meta = null; // the catalog entry that's open
let units = [];
let lines = [];
let findLine = () => -1;
let before = []; // characters to type before each unit, for the progress %
let total = 0;

let pos = { u: 0, c: 0 };
let at = 0; // index of the current line
let size = { cols: 60, fs: 18, cw: 10.8, lh: 31, fixed: false };
let bellRung = false;
let finished = false;
let session = { right: 0, wrong: 0, ms: 0, last: 0 };
// This sitting's stretch of the current chapter, for its index card.
let run = { ms: 0, right: 0, words: 0 };
let cardMode = null; // "chapter" or "end" while an index card is up
let hinted = store.get("type-a-book:hinted", false);

// ---- Loading a book ----

async function load(id) {
  if (loaded.has(id)) return loaded.get(id);
  const res = await fetch(`books/${id}.json`);
  const book = await res.json();
  loaded.set(id, book);
  return book;
}

function open(entry, book) {
  meta = entry;
  units = toUnits(book);
  lines = [];
  before = [];
  total = 0;
  units.forEach((unit, u) => {
    before[u] = total;
    if (typable(unit)) total += unit.text.length + 1;
  });
  const saved = store.get(saveKey(entry.id), null);
  pos = saved && units[saved.u] && typable(units[saved.u]) ? { u: saved.u, c: saved.c } : first();
  finished = false;
}

const first = () => ({ u: units.findIndex(typable), c: 0 });

function nextTypable(u) {
  for (let i = u + 1; i < units.length; i++) if (typable(units[i])) return i;
  return -1;
}

const percent = () => Math.floor(((before[pos.u] + pos.c) / total) * 100);
const chapterOf = (u) => loaded.get(meta.id).chapters[units[u].ch];

// Your place, plus how far along you are for the shelf to show.
function save() {
  if (!meta || !units.length) return;
  const prev = store.get(saveKey(meta.id), {});
  store.set(saveKey(meta.id), {
    ...prev,
    u: pos.u,
    c: pos.c,
    finished,
    percent: finished ? 100 : percent(),
    chapter: pretty(chapterOf(pos.u).label),
    at: Date.now(),
  });
}

// "14%", or the chapter while it still rounds down to 0%.
const where = (saved) =>
  saved.percent > 0 ? `${saved.percent}%` : saved.chapter ?? "Started";

const progressOf = (id) => {
  const saved = store.get(saveKey(id), null);
  return saved && (saved.finished || saved.percent > 0 || saved.c > 0) ? saved : null;
};

// ---- The shelf ----

// Thicker books get thicker spines, and heights vary a little, the way a
// real shelf does. Hovering a book you've started shows how far you are.
function spine(entry) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spine";
  const width = Math.round(32 + Math.sqrt(entry.words) / 11);
  let h = 0;
  for (const ch of entry.id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const height = 236 + (h % 6) * 9;
  // The title runs down the spine, a column per line, sized to fit between
  // the gilt bands; the surname across the bottom, sized to fit the width.
  const longest = Math.max(...entry.spine.map((l) => l.length));
  const fs = Math.max(
    10,
    Math.min(17, (height - 124) / (longest * 0.53), (width - 10) / (entry.spine.length * 1.3)),
  );
  const surname = entry.author.split(" ").at(-1);
  const ns = Math.max(7, Math.min(10, (width - 8) / (surname.length * 0.68)));
  btn.style.cssText = [
    `--cloth:${entry.cloth}`,
    `--gilt:${entry.gilt}`,
    `width:${width}px`,
    `height:${height}px`,
    `--spine-fs:${fs.toFixed(1)}px`,
    `--name-fs:${ns.toFixed(1)}px`,
  ].join(";");
  btn.dataset.id = entry.id;

  const saved = progressOf(entry.id);
  const state = saved ? (saved.finished ? "typed" : `${where(saved)} typed so far`) : "";
  btn.setAttribute("aria-label", `${entry.title} by ${entry.author}${state ? `, ${state}` : ""}`);
  const tip = saved
    ? saved.finished
      ? "Typed"
      : saved.percent > 0 && saved.chapter
        ? `${saved.percent}% · ${saved.chapter}`
        : where(saved)
    : "";
  btn.innerHTML = `
    ${saved ? `<span class="tip" aria-hidden="true">${tip}</span>` : ""}
    <span class="band top"></span>
    <span class="spine-title">${entry.spine.map((l) => `<span>${l}</span>`).join("")}</span>
    <span class="spine-author">${surname}</span>
    <span class="band bottom"></span>`;
  btn.addEventListener("click", () => pick(entry));
  return btn;
}

function buildShelves() {
  els.shelves.innerHTML = "";
  for (const shelf of catalog.shelves) {
    const section = document.createElement("section");
    section.className = "shelf";
    section.setAttribute("aria-label", shelf.name);
    section.innerHTML = `
      <div class="shelf-scroll"><div class="shelf-inner">
        <div class="books"></div>
        <div class="board"><span class="plaque">${shelf.name}</span></div>
      </div></div>`;
    const row = section.querySelector(".books");
    for (const id of shelf.books) {
      const entry = catalog.books.find((b) => b.id === id);
      if (entry) row.append(spine(entry));
    }
    els.shelves.append(section);
  }
  buildResume();
}

// The book you typed in most recently, one click from the top of the page.
function buildResume() {
  let latest = null;
  for (const entry of catalog.books) {
    const saved = progressOf(entry.id);
    if (saved && !saved.finished && (!latest || (saved.at ?? 0) > (latest.saved.at ?? 0))) {
      latest = { entry, saved };
    }
  }
  els.resume.hidden = !latest;
  if (!latest) return;
  els.resume.innerHTML = `<span class="resume-label">Keep typing</span> <em>${latest.entry.title}</em> <span class="resume-pct">${where(latest.saved)}</span>`;
  els.resume.onclick = () => pick(latest.entry);
}

// Picking a book: it slides up off the shelf, then its cover comes forward.
async function pick(entry) {
  const el = els.shelves.querySelector(`.spine[data-id="${entry.id}"]`);
  el?.classList.add("pulled");
  await Promise.all([load(entry.id), wait(reduced() ? 0 : 280)]);
  showCover(entry, el);
}

// ---- The cover ----

const WATCH = `
  <svg class="watch" viewBox="0 0 80 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <circle cx="40" cy="10" r="6" />
    <rect x="34" y="16" width="12" height="8" rx="2" />
    <circle cx="40" cy="60" r="32" />
    <circle cx="40" cy="60" r="26" stroke-width="1.2" />
    <path d="M40 36v5M40 79v5M16 60h5M59 60h5" />
    <path d="M40 60V42M40 60l10 6" />
    <circle cx="40" cy="60" r="2.4" fill="currentColor" stroke="none" />
  </svg>`;

// A gilt rule with a diamond, for books without their own emblem.
const RULE = `
  <svg class="rule" viewBox="0 0 120 20" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M4 10h42M74 10h42" />
    <path d="M60 3l7 7-7 7-7-7z" fill="currentColor" stroke="none" />
  </svg>`;

const EMBLEMS = { watch: WATCH };

// The front cover, and the title page under it that shows when it opens.
function coverArt(entry) {
  return `
    <div class="title-page">
      <p class="tp-title">${entry.title}</p>
      <p class="tp-by">by</p>
      <p class="tp-author">${entry.author}</p>
      ${RULE}
    </div>
    <div class="cloth" style="--cloth:${entry.cloth};--gilt:${entry.gilt}">
      <div class="frame">
        ${entry.spine.length > 1 ? `<p class="cover-small">${entry.spine[0]}</p>` : ""}
        <p class="cover-big">${entry.spine.at(-1)}</p>
        ${EMBLEMS[entry.emblem] ?? RULE}
        <p class="cover-author">${entry.author}</p>
      </div>
    </div>`;
}

let pulledSpine = null;

function showCover(entry, spineEl) {
  pulledSpine = spineEl;
  const book = loaded.get(entry.id);
  els.coverArt.innerHTML = coverArt(entry);
  els.coverTitle.textContent = entry.title;
  els.coverByline.textContent = entry.translator
    ? `${entry.author}, translated by ${entry.translator}`
    : `${entry.author}, ${entry.year}`;
  els.coverFacts.textContent = `${book.chapters.length} chapters, ${book.words.toLocaleString()} words`;
  const saved = store.get(saveKey(entry.id), null);
  open(entry, book);
  const started = saved && (saved.u !== first().u || saved.c > 0);
  if (saved?.finished) {
    els.coverProgress.textContent = "You've typed the whole book.";
  } else if (started) {
    const ch = pretty(book.chapters[units[pos.u].ch].label);
    els.coverProgress.textContent = percent()
      ? `You're ${percent()}% in, on ${ch}.`
      : `You've started ${ch}.`;
  } else {
    els.coverProgress.textContent = "";
  }
  if (linkNote) {
    els.coverProgress.textContent += ` ${linkNote}`;
    linkNote = "";
  }
  els.shareCover.hidden = !started || saved?.finished;
  els.start.textContent = started && !saved?.finished ? "Keep typing" : "Start typing";
  els.restart.hidden = !started;
  els.restart.textContent = "Start over";
  els.restart.dataset.armed = "";
  els.cover.hidden = false;
  els.start.focus();
}

function hideCover() {
  els.cover.hidden = true;
  pulledSpine?.classList.remove("pulled");
  pulledSpine?.focus();
}

// The cover swings open to the title page, and the desk takes over.
async function openBook() {
  sound.wake();
  if (!reduced()) {
    els.coverArt.classList.add("opening");
    await wait(720);
    els.cover.classList.add("closing");
    await wait(220);
  }
  els.cover.hidden = true;
  els.cover.classList.remove("closing");
  els.coverArt.classList.remove("opening");
  pulledSpine?.classList.remove("pulled");
  toDesk(true);
}

els.closeCover.addEventListener("click", hideCover);
els.cover.addEventListener("click", (e) => {
  if (e.target === els.cover) hideCover();
});
els.start.addEventListener("click", () => {
  if (finished || store.get(saveKey(meta.id), {}).finished) {
    pos = first();
    finished = false;
  }
  openBook();
});
// Starting over takes two clicks, so a stray one doesn't lose your place.
els.restart.addEventListener("click", () => {
  if (!els.restart.dataset.armed) {
    els.restart.dataset.armed = "yes";
    els.restart.textContent = "Sure? Start over";
    return;
  }
  pos = first();
  finished = false;
  save();
  openBook();
});

// ---- The desk ----

function toDesk(roll = false) {
  els.shelf.hidden = true;
  els.desk.hidden = false;
  session = { right: 0, wrong: 0, ms: 0, last: 0 };
  run = { ms: 0, right: 0, words: 0 };
  cardMode = null;
  bellRung = false;
  measure();
  render();
  updateBar();
  updateStack();
  els.hint.hidden = hinted;
  if (roll) rollIn();
  focusInput();
}

function toShelf() {
  save();
  els.desk.hidden = true;
  els.card.hidden = true;
  cardMode = null;
  els.shelf.hidden = false;
  buildShelves();
  els.shelves.querySelector(`.spine[data-id="${meta?.id}"]`)?.focus();
}

els.back.addEventListener("click", toShelf);
els.cardShelf.addEventListener("click", toShelf);

const coarse = window.matchMedia("(pointer: coarse)");
function focusInput() {
  els.input.focus({ preventScroll: true });
  els.tap.hidden = !coarse.matches || document.activeElement === els.input;
}
els.stage.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("button")) setTimeout(focusInput);
});
els.tap.addEventListener("click", focusInput);
els.input.addEventListener("blur", () => {
  if (!els.desk.hidden) els.tap.hidden = !coarse.matches;
});

let soundOn = store.get("type-a-book:sound", true);
function setSound(value) {
  soundOn = value;
  sound.setOn(value);
  store.set("type-a-book:sound", value);
  els.soundBtn.textContent = value ? "Sound on" : "Sound off";
  els.soundBtn.setAttribute("aria-pressed", String(value));
}
setSound(soundOn);
els.soundBtn.addEventListener("click", () => {
  setSound(!soundOn);
  focusInput();
});

// The first time at the typewriter, an index card explains the rules. It
// goes once you've got the hang of it, or when you close it.
function hideHint() {
  if (els.hint.hidden) return;
  hinted = true;
  store.set("type-a-book:hinted", true);
  els.hint.classList.add("leaving");
  setTimeout(() => {
    els.hint.hidden = true;
    els.hint.classList.remove("leaving");
  }, 320);
}
els.hintClose.addEventListener("click", () => {
  hideHint();
  focusInput();
});

// Sizes the type to the window and wraps the book to fit the paper.
function measure() {
  const width = els.stage.clientWidth;
  const fs = Math.round(Math.min(19, Math.max(13, width * 0.0125 + 4)));
  const cw = fs * 0.6;
  const lh = Math.round(fs * 1.75);
  const cols = Math.max(26, Math.min(60, Math.floor((width - 32) / cw) - MARGIN * 2));
  const changed = cols !== size.cols || !lines.length;
  // Small screens can't fit a sliding carriage, so the paper stays put and
  // the type guide moves along the line instead.
  const fixed = coarse.matches || width < 720;
  size = { cols, fs, cw, lh, fixed };
  const style = els.stage.style;
  style.setProperty("--fs", `${fs}px`);
  style.setProperty("--cw", `${cw}px`);
  style.setProperty("--lh", `${lh}px`);
  style.setProperty("--paper-w", `${(cols + MARGIN * 2) * cw}px`);
  style.setProperty("--paper-h", `${(TOP + LINES_PER_PAGE + BOTTOM) * lh}px`);
  if (changed) {
    lines = layout(units, cols);
    findLine = indexLines(lines);
  }
  at = findLine(pos.u, pos.c);
}

// When a phone's keyboard opens, the desk shrinks to the space above it so
// the line you're typing stays in view.
const viewport = window.visualViewport;
viewport?.addEventListener("resize", () => {
  if (els.desk.hidden) return;
  els.desk.style.height = `${viewport.height}px`;
  window.scrollTo(0, 0);
});

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (els.desk.hidden) return;
    measure();
    render();
    updateStack();
  }, 150);
});

// ---- Drawing the paper ----

// Typed letters sit a little unevenly, the way a real typebar strikes.
function jitter(u, i) {
  let h = (u * 7919 + i * 104729) % 2147483647;
  const r = () => ((h = (h * 48271) % 2147483647) / 2147483647) * 2 - 1;
  return `--dy:${(r() * 0.05).toFixed(3)}em;--rot:${(r() * 1.4).toFixed(2)}deg;--o:${(0.8 + r() * 0.18).toFixed(2)}`;
}

const esc = (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch);
const empty = (n) => '<span class="c"></span>'.repeat(n);

function lineHTML(i) {
  const line = lines[i];
  if (line.auto) {
    const pad = line.center ? Math.max(0, Math.floor((size.cols - line.text.length) / 2)) : 0;
    let html = empty(pad);
    for (let k = 0; k < line.text.length; k++) {
      const ch = line.text[k];
      html += ch === " " ? empty(1) : `<span class="c ink" style="${jitter(line.u, k + 900000)}">${esc(ch)}</span>`;
    }
    return html;
  }

  const { text } = units[line.u];
  const current = i === at;
  const upTo = i < at ? Infinity : pos.c;
  let html = empty(line.indent);
  for (let k = line.start; k < line.end; k++) {
    const ch = text[k];
    if (k < upTo) {
      const fresh = current && k === pos.c - 1 ? " fresh" : "";
      html += ch === " " ? empty(1) : `<span class="c ink${fresh}" style="${jitter(line.u, k)}">${esc(ch)}</span>`;
    } else {
      const now = current && k === pos.c ? " now" : "";
      html += `<span class="c ghost${now}">${ch === " " ? "" : esc(ch)}</span>`;
    }
  }
  if (current && line.ends === "enter" && pos.c === line.end) {
    html += '<span class="c ghost now ret">&para;</span>';
  }
  return html;
}

function render() {
  const page = lines[at].page;
  let html = "";
  for (let i = 0; i <= at; i++) {
    if (lines[i].page !== page || lines[i].row < 0) continue;
    html += `<div class="line" data-i="${i}">${lineHTML(i)}</div>`;
  }
  els.paper.innerHTML = html;
  place(false);
  describe();
}

function redrawLine(i) {
  const el = els.paper.querySelector(`[data-i="${i}"]`);
  if (el) el.innerHTML = lineHTML(i);
}

// The carriage carries the paper left one character per key, so the next
// letter is always under the type guide in the middle. The paper rolls up a
// line on each return.
function place(returning) {
  const line = lines[at];
  const col = line.indent + (pos.c - line.start);
  const spot = (MARGIN + col) * size.cw + size.cw / 2;
  const y = -(TOP + line.row + 1) * size.lh;
  els.carriage.classList.toggle("returning", returning);
  els.guide.classList.toggle("returning", returning);
  if (size.fixed) {
    const half = ((size.cols + MARGIN * 2) * size.cw) / 2;
    els.carriage.style.transform = `translateX(${-half}px)`;
    els.guide.style.transform = `translateX(${spot - half}px)`;
  } else {
    els.carriage.style.transform = `translateX(${-spot}px)`;
    els.guide.style.transform = "";
  }
  els.paper.style.transform = `translateY(${y}px)`;
}

// A fresh sheet rolls up out of the machine.
function rollIn() {
  sound.paper();
  if (reduced()) return;
  els.paper.classList.add("arriving");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      els.paper.classList.remove("arriving");
      els.paper.classList.add("rolling");
      setTimeout(() => els.paper.classList.remove("rolling"), 900);
    }),
  );
}

// A finished sheet comes out of the machine and lands on the stack of
// typed pages beside it (or lifts away when there's no room for a stack).
function turnPage() {
  if (!reduced()) {
    const stage = els.stage.getBoundingClientRect();
    const sheet = els.paper.getBoundingClientRect();
    const feed = els.feed.getBoundingClientRect();
    const old = els.paper.cloneNode(true);
    old.removeAttribute("id");
    old.classList.add("flying");
    old.style.left = `${sheet.left - stage.left}px`;
    old.style.top = `${sheet.top - stage.top}px`;
    old.style.transform = "none";
    old.style.clipPath = `inset(0 0 ${Math.max(0, sheet.bottom - feed.bottom)}px 0)`;
    els.stage.append(old);
    const toStack = getComputedStyle(els.stack).display !== "none";
    const target = els.stack.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (toStack) {
        const dx = target.left + target.width / 2 - (sheet.left + sheet.width / 2);
        const dy = target.top + target.height / 2 - (sheet.top + sheet.height / 2);
        old.style.transform = `translate(${dx}px, ${dy}px) scale(${target.width / sheet.width}) rotate(-5deg)`;
      } else {
        old.style.transform = "translateY(-120vh) rotate(-3deg)";
      }
      old.style.opacity = "0";
    });
    setTimeout(() => old.remove(), 850);
  }
  render();
  rollIn();
  setTimeout(updateStack, reduced() ? 0 : 700);
}

// The stack of sheets you've typed in this book, on the desk to the left.
function updateStack() {
  const pages = lines[at]?.page ?? 0;
  els.stack.classList.toggle("empty", pages === 0);
  els.stackSheets.innerHTML = Array.from(
    { length: Math.min(pages, 7) },
    (_, i) => `<span class="sheet" style="--i:${i};--r:${((i * 37) % 9) - 4}deg"></span>`,
  ).join("");
  els.stackLabel.textContent = `${pages} ${pages === 1 ? "page" : "pages"}`;
}

// For screen readers: the line you're on.
function describe() {
  const line = lines[at];
  els.reading.textContent = units[line.u].text.slice(line.start, line.end);
}

// Headings as the book prints them can shout ("THE FIRST BOOK") or be a bare
// numeral ("IX"). The bar says them in sentence case: "The First Book",
// "Chapter IX".
const roman = /^[IVXLC]+\.?$/;
function pretty(text) {
  const plain = text.replace(/\.$/, "");
  if (roman.test(plain)) return `Chapter ${plain}`;
  if (plain !== plain.toUpperCase()) return plain;
  return plain
    .split(/(\s+|--)/)
    .map((w) => (roman.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join("");
}

function updateBar() {
  const ch = chapterOf(pos.u);
  els.chapter.textContent = ch.title ? `${pretty(ch.label)}  ·  ${pretty(ch.title)}` : pretty(ch.label);
  const minutes = session.ms / 60000;
  const wpm = session.right >= 10 && minutes > 0 ? Math.round(session.right / 5 / minutes) : null;
  const tries = session.right + session.wrong;
  const accuracy = tries ? Math.floor((session.right / tries) * 100) : null;
  els.stats.textContent = [
    wpm === null ? "-- wpm" : `${wpm} wpm`,
    accuracy === null ? "--% right" : `${accuracy}% right`,
    `${percent()}% of the book`,
  ].join("  ·  ");
}

// ---- The machine ----

const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"],
  ["shift", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "return"],
  ["space"],
];
const SHIFTED = {
  "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8",
  "(": "9", ")": "0", _: "-", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/",
};

function buildMachine() {
  els.keys.innerHTML = ROWS.map(
    (row, r) =>
      `<div class="row r${r}">${row
        .map((k) => `<span class="key k-${k.length > 1 ? k : "char"}" data-k="${k}">${k.length > 1 ? k : k.toUpperCase()}</span>`)
        .join("")}</div>`,
  ).join("");
  // The typebars fan out in a half circle under the type guide.
  els.basket.innerHTML = Array.from(
    { length: BARS },
    (_, i) => `<span class="bar" style="--a:${(-82 + (164 * i) / (BARS - 1)).toFixed(1)}deg"></span>`,
  ).join("");
}

const replay = (el, cls) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
};

function press(ch) {
  let k;
  let shift = false;
  if (ch === " ") k = "space";
  else if (ch === "\n") k = "return";
  else if (SHIFTED[ch]) [k, shift] = [SHIFTED[ch], true];
  else if (/[A-Z]/.test(ch)) [k, shift] = [ch.toLowerCase(), true];
  else k = ch;
  const keys = [els.keys.querySelector(`[data-k="${CSS.escape(k)}"]`)];
  if (shift) keys.push(els.keys.querySelector('[data-k="shift"]'));
  for (const key of keys) {
    if (!key) continue;
    key.classList.add("down");
    setTimeout(() => key.classList.remove("down"), 110);
  }
  // Each letter has its own typebar, which swings up to strike the paper.
  if (ch !== " " && ch !== "\n") {
    replay(els.basket.children[(ch.toLowerCase().charCodeAt(0) * 7) % BARS], "strike");
  }
}

// ---- Typing ----

function type(ch) {
  if (finished || cardMode || els.desk.hidden || !units.length) return;
  sound.wake();
  press(ch);

  const now = performance.now();
  if (session.last && now - session.last < 4000) session.ms += now - session.last;
  session.last = now;

  const { text } = units[pos.u];
  const expected = pos.c < text.length ? text[pos.c] : "\n";
  if (ch !== expected) {
    session.wrong += 1;
    miss(ch);
    updateBar();
    return;
  }
  session.right += 1;
  if ((ch === " " || ch === "\n") && pos.c > 0 && text[pos.c - 1] !== " ") run.words += 1;
  if (!hinted && session.right >= HINT_UNTIL) hideHint();

  const from = at;
  const fromChapter = units[pos.u].ch;
  if (pos.c < text.length) {
    pos.c += 1;
  } else {
    const next = nextTypable(pos.u);
    if (next === -1) return finish();
    pos = { u: next, c: 0 };
  }
  at = findLine(pos.u, pos.c);

  if (at === from) {
    redrawLine(at);
    place(false);
    if (ch === " ") sound.space();
    else sound.key();
    const line = lines[at];
    const col = line.indent + (pos.c - line.start);
    if (!bellRung && col === size.cols - BELL_AT && line.end - line.start + line.indent > col) {
      bellRung = true;
      sound.bell();
      replay(els.bell, "ring");
    }
  } else {
    bellRung = false;
    if (ch === " ") sound.space();
    sound.carriage();
    replay(els.lever, "pull");
    if (lines[at].page !== lines[from].page) {
      turnPage();
    } else {
      redrawLine(from);
      let html = "";
      for (let i = from + 1; i <= at; i++) {
        if (lines[i].row >= 0) html += `<div class="line" data-i="${i}">${lineHTML(i)}</div>`;
      }
      els.paper.insertAdjacentHTML("beforeend", html);
      place(true);
      describe();
    }
    save();
    keepSaves();
    if (units[pos.u].ch !== fromChapter) chapterDone(fromChapter);
  }
  if (session.right % 25 === 0) save();
  updateBar();
}

// A wrong key strikes in the ribbon's red half, then fades.
function miss(ch) {
  sound.miss();
  const cell = els.paper.querySelector(".now");
  if (!cell) return;
  cell.dataset.miss = ch === "\n" ? "¶" : ch === " " ? "_" : ch;
  replay(cell, "missed");
}

// ---- Index cards: a finished chapter, and the end of the book ----

const today = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function fillCard() {
  const minutes = (session.ms - run.ms) / 60000;
  const right = session.right - run.right;
  els.cardWords.textContent = run.words.toLocaleString();
  els.cardTime.textContent = minutes < 1 ? "< 1 min" : `${Math.round(minutes)} min`;
  els.cardWpm.textContent = minutes >= 0.25 ? String(Math.round(right / 5 / minutes)) : "--";
  els.cardStamp.innerHTML = `Typed<small>${today()}</small>`;
}

function chapterDone(ch) {
  const chapter = loaded.get(meta.id).chapters[ch];
  cardMode = "chapter";
  fillCard();
  els.cardKicker.textContent = pretty(chapter.label);
  els.cardTitle.textContent = chapter.title ? pretty(chapter.title) : meta.title;
  els.cardNext.hidden = false;
  els.cardNext.textContent = "Next chapter";
  els.cardTip.hidden = false;
  setTimeout(() => {
    if (cardMode !== "chapter") return;
    els.card.hidden = false;
    els.cardNext.focus({ preventScroll: true });
  }, reduced() ? 0 : 750);
}

function closeCard() {
  if (cardMode !== "chapter") return;
  cardMode = null;
  els.card.hidden = true;
  run = { ms: session.ms, right: session.right, words: 0 };
  session.last = 0;
  focusInput();
}
els.cardNext.addEventListener("click", closeCard);

function finish() {
  finished = true;
  save();
  sound.bell();
  replay(els.bell, "ring");
  cardMode = "end";
  fillCard();
  els.cardKicker.textContent = "The End";
  els.cardTitle.textContent = meta.title;
  els.cardNext.hidden = true;
  els.cardTip.hidden = true;
  els.card.hidden = false;
  els.cardShelf.focus();
}

// ---- Your place, as a link ----

// Progress lives in this browser. To carry it to another device, or keep it
// somewhere safe, you can copy a link with your place in it: the book, the
// paragraph and the letter. Nothing is stored anywhere else.
const share = (button) => async () => {
  if (!meta) return;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("book", meta.id);
  url.searchParams.set("u", String(pos.u));
  url.searchParams.set("c", String(pos.c));
  const label = button.textContent;
  const done = (text) => {
    button.textContent = text;
    setTimeout(() => (button.textContent = label), 2200);
  };
  try {
    if (coarse.matches && navigator.share) {
      await navigator.share({ title: `${meta.title}, on Type a Book`, url: url.toString() });
      done("Sent");
    } else {
      await navigator.clipboard.writeText(url.toString());
      done("Link copied");
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    // No clipboard: show the link to copy by hand.
    const field = document.createElement("input");
    field.className = "share-field";
    field.readOnly = true;
    field.value = url.toString();
    field.setAttribute("aria-label", "Link to your place");
    button.replaceWith(field);
    field.select();
  }
};
els.shareCover.addEventListener("click", share(els.shareCover));
els.cardShare.addEventListener("click", share(els.cardShare));
if (coarse.matches && navigator.share) {
  els.shareCover.textContent = els.cardShare.textContent = "Send a link to your place";
}

// Opening one of those links: the furthest place wins, so an old link can't
// undo progress this browser has made since.
let linkNote = "";
async function openFromLink() {
  const params = new URLSearchParams(location.search);
  const id = params.get("book");
  if (!id) return;
  history.replaceState(null, "", location.pathname);
  const entry = catalog.books.find((b) => b.id === id);
  if (!entry) return;
  const book = await load(id);
  const linked = { u: Number(params.get("u")), c: Number(params.get("c")) };
  const unit = toUnits(book)[linked.u];
  if (unit && typable(unit) && Number.isInteger(linked.c) && linked.c >= 0 && linked.c <= unit.text.length) {
    const saved = store.get(saveKey(id), null);
    const ahead = !saved || saved.u < linked.u || (saved.u === linked.u && saved.c < linked.c);
    if (ahead) {
      store.set(saveKey(id), { ...saved, u: linked.u, c: linked.c, finished: false, at: Date.now() });
    } else if (saved.u !== linked.u || saved.c !== linked.c) {
      linkNote = "This browser was already further along than your link, so you'll pick up here.";
    }
  }
  pick(entry);
}

// Browsers can clear a site's saved data to free up space, and Safari can
// clear it after a week away. Asking for persistent storage makes that much
// less likely. It's asked once, after your first finished line.
let askedToKeep = false;
async function keepSaves() {
  if (askedToKeep || !navigator.storage?.persist) return;
  askedToKeep = true;
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not available here; saves just stay best-effort.
  }
}

// ---- Keys ----

// Phones type with smart punctuation, so curly quotes and long dashes are
// turned back into what the typewriter has.
const plain = (s) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, "--")
    .replace(/…/g, "...")
    .replace(/\r/g, "\n");

window.addEventListener("keydown", (e) => {
  if (!els.cover.hidden) {
    if (e.key === "Escape") hideCover();
    return;
  }
  if (els.desk.hidden) return;
  if (e.key === "Escape") return toShelf();
  if (cardMode) {
    if (cardMode === "chapter" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      closeCard();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  if (e.target instanceof HTMLButtonElement) return;
  let ch = null;
  if (e.key === "Enter") ch = "\n";
  else if (e.key.length === 1) ch = e.key;
  if (ch === null) return;
  e.preventDefault();
  for (const c of plain(ch)) type(c);
});

// Phone keyboards that don't report keys come through as input instead.
els.input.addEventListener("input", () => {
  const value = els.input.value;
  els.input.value = "";
  if (cardMode === "chapter") return closeCard();
  for (const c of plain(value)) type(c);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});

// ---- Start ----

buildMachine();
fetch("books/index.json")
  .then((res) => res.json())
  .then((data) => {
    catalog = data;
    buildShelves();
    openFromLink();
  });
