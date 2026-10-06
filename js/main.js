import { LINES_PER_PAGE, indexLines, layout, toUnits, typable } from "./book.js";
import * as sound from "./sound.js";

// The shelf. Each book is a public-domain text in books/, made with
// scripts/prepare-book.mjs, and a cloth color for its spine and cover.
const BOOKS = [
  {
    id: "alice",
    file: "books/alice.json",
    title: "Alice's Adventures in Wonderland",
    spine: ["Alice's Adventures", "in Wonderland"],
    author: "Lewis Carroll",
    surname: "Carroll",
    year: 1865,
    cloth: "#8b2a22",
    gilt: "#d9b464",
    emblem: "watch",
  },
];

// The paper: side margins and the blank lines above and below the text,
// in characters and lines.
const MARGIN = 5;
const TOP = 3;
const BOTTOM = 3;
const BELL_AT = 8; // the bell rings this many characters before the margin

const $ = (sel) => document.querySelector(sel);
const els = {
  shelf: $("#shelf"),
  books: $("#books"),
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
  guide: $(".guide"),
  feed: $("#feed"),
  paper: $("#paper"),
  keys: $("#keys"),
  tap: $("#tap"),
  input: $("#input"),
  reading: $("#now-reading"),
  done: $("#done"),
  doneText: $("#done-text"),
  doneShelf: $("#done-shelf"),
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

// ---- State ----

const loaded = new Map();
let meta = null; // the BOOKS entry that's open
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

// ---- Loading a book ----

async function load(id) {
  if (loaded.has(id)) return loaded.get(id);
  const entry = BOOKS.find((b) => b.id === id);
  const res = await fetch(entry.file);
  const book = await res.json();
  loaded.set(id, book);
  return book;
}

function open(entry, book) {
  meta = entry;
  units = toUnits(book);
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

function save() {
  if (!meta) return;
  const prev = store.get(saveKey(meta.id), {});
  store.set(saveKey(meta.id), { ...prev, u: pos.u, c: pos.c, finished });
}

// ---- The shelf and the cover ----

function spine(entry) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "spine";
  btn.style.setProperty("--cloth", entry.cloth);
  btn.style.setProperty("--gilt", entry.gilt);
  btn.setAttribute("aria-label", `${entry.title} by ${entry.author}`);
  btn.innerHTML = `
    <span class="band top"></span>
    <span class="spine-title">${entry.spine.map((l) => `<span>${l}</span>`).join("")}</span>
    <span class="spine-author">${entry.surname}</span>
    <span class="band bottom"></span>`;
  btn.addEventListener("click", () => showCover(entry));
  return btn;
}

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

const EMBLEMS = { watch: WATCH };

function coverArt(entry) {
  return `
    <div class="cloth" style="--cloth:${entry.cloth};--gilt:${entry.gilt}">
      <div class="frame">
        <p class="cover-small">${entry.spine[0]}</p>
        <p class="cover-big">${entry.spine[1]}</p>
        ${EMBLEMS[entry.emblem] ?? ""}
        <p class="cover-author">${entry.author}</p>
      </div>
    </div>`;
}

let opener = null;

async function showCover(entry) {
  opener = document.activeElement;
  const book = await load(entry.id);
  els.coverArt.innerHTML = coverArt(entry);
  els.coverTitle.textContent = entry.title;
  els.coverByline.textContent = `${entry.author}, ${entry.year}`;
  els.coverFacts.textContent = `${book.chapters.length} chapters, ${book.words.toLocaleString()} words`;
  const saved = store.get(saveKey(entry.id), null);
  open(entry, book);
  const started = saved && (saved.u !== first().u || saved.c > 0);
  if (saved?.finished) {
    els.coverProgress.textContent = "You've typed the whole book.";
  } else if (started) {
    const ch = book.chapters[units[pos.u].ch];
    els.coverProgress.textContent = percent()
      ? `You're ${percent()}% in, on Chapter ${ch.number}.`
      : `You've started Chapter ${ch.number}.`;
  } else {
    els.coverProgress.textContent = "";
  }
  els.start.textContent = started && !saved?.finished ? "Keep typing" : "Start typing";
  els.restart.hidden = !started;
  els.restart.textContent = "Start over";
  els.restart.dataset.armed = "";
  els.cover.hidden = false;
  els.start.focus();
}

function hideCover() {
  els.cover.hidden = true;
  opener?.focus?.();
}

els.closeCover.addEventListener("click", hideCover);
els.cover.addEventListener("click", (e) => {
  if (e.target === els.cover) hideCover();
});
els.start.addEventListener("click", () => {
  els.cover.hidden = true;
  if (finished || store.get(saveKey(meta.id), {}).finished) {
    pos = first();
    finished = false;
  }
  toDesk();
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
  els.cover.hidden = true;
  toDesk();
});

// ---- The desk ----

function toDesk() {
  els.shelf.hidden = true;
  els.desk.hidden = false;
  session = { right: 0, wrong: 0, ms: 0, last: 0 };
  bellRung = false;
  measure();
  render();
  updateBar();
  focusInput();
}

function toShelf() {
  save();
  els.desk.hidden = true;
  els.done.hidden = true;
  els.shelf.hidden = false;
  els.books.querySelector(".spine")?.focus();
}

els.back.addEventListener("click", toShelf);
els.doneShelf.addEventListener("click", toShelf);

const coarse = window.matchMedia("(pointer: coarse)");
function focusInput() {
  els.input.focus({ preventScroll: true });
  els.tap.hidden = !coarse.matches || document.activeElement === els.input;
}
els.stage.addEventListener("pointerdown", () => setTimeout(focusInput));
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

// A finished sheet lifts out and a fresh one rolls in.
function turnPage() {
  const old = els.paper.cloneNode(true);
  old.removeAttribute("id");
  els.feed.prepend(old);
  requestAnimationFrame(() => old.classList.add("leaving"));
  setTimeout(() => old.remove(), 900);
  render();
  els.paper.classList.add("arriving");
  requestAnimationFrame(() => requestAnimationFrame(() => els.paper.classList.remove("arriving")));
  sound.paper();
}

// For screen readers: the line you're on.
function describe() {
  const line = lines[at];
  els.reading.textContent = units[line.u].text.slice(line.start, line.end);
}

function updateBar() {
  const unit = units[pos.u];
  const book = loaded.get(meta.id);
  const ch = book.chapters[unit.ch];
  els.chapter.textContent = `Chapter ${ch.number}  ·  ${ch.title}`;
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

// ---- The keyboard you see ----

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

function buildKeys() {
  els.keys.innerHTML = ROWS.map(
    (row, r) =>
      `<div class="row r${r}">${row
        .map((k) => `<span class="key k-${k.length > 1 ? k : "char"}" data-k="${k}">${k.length > 1 ? k : k.toUpperCase()}</span>`)
        .join("")}</div>`,
  ).join("");
}

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
}

// ---- Typing ----

function type(ch) {
  if (finished || els.desk.hidden || !units.length) return;
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

  const from = at;
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
    }
  } else {
    bellRung = false;
    if (ch === " ") sound.space();
    sound.carriage();
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
  cell.classList.remove("missed");
  void cell.offsetWidth;
  cell.classList.add("missed");
}

function finish() {
  finished = true;
  save();
  sound.bell();
  const minutes = session.ms / 60000;
  const wpm = minutes > 0 ? Math.round(session.right / 5 / minutes) : 0;
  els.doneText.textContent = `You typed ${meta.title} by ${meta.author}.${wpm ? ` Your last stretch ran at ${wpm} words a minute.` : ""}`;
  els.done.hidden = false;
  els.doneShelf.focus();
}

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
  if (els.desk.hidden || !els.done.hidden) {
    if (e.key === "Escape" && !els.cover.hidden) hideCover();
    return;
  }
  if (e.key === "Escape") return toShelf();
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
  for (const c of plain(value)) type(c);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});

// ---- Start ----

for (const entry of BOOKS) els.books.append(spine(entry));
buildKeys();
