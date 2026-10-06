# Type a Book

Pick a book off the shelf and type it on an old typewriter. You read it as you go.

Play it at **[ernkerr.github.io/type-a-book](https://ernkerr.github.io/type-a-book/)**.

## How it plays

- The book's words show faintly on the paper, and you type over them in ink.
- The carriage moves with every letter, the bell rings near the end of a line, and the carriage returns when you type the space at the end of it. Press Return at the end of a paragraph.
- A wrong key strikes in red and you try again. There's no backspace, like a real typewriter.
- Each chapter starts a new sheet, and a full sheet rolls out for a fresh one.
- Your place is saved in your browser, so you can come back and keep reading.
- On a phone, tap the paper to bring up the keyboard.

No build step and no framework: an HTML page, a stylesheet and three JavaScript files. The typewriter sounds are made in the browser with the Web Audio API, so there are no recordings.

## Books

Every book on the shelf is in the public domain. The first is *Alice's Adventures in Wonderland* by Lewis Carroll (1865).

`scripts/prepare-book.mjs` turns a plain-text book into `books/<id>.json`. It keeps only the book itself and converts it to what a typewriter has: straight quotes, `--` for dashes, and no italics. Verse keeps its line breaks.

```sh
node scripts/prepare-book.mjs book.txt books/alice.json \
  --id alice --title "Alice's Adventures in Wonderland" \
  --author "Lewis Carroll" --year 1865
```

Then add the book to `BOOKS` in `js/main.js` with a cloth color for its spine.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Fonts from Google Fonts: Special Elite (Astigmatic, Apache 2.0), Courier Prime (Alan Dague-Greene, OFL) and IM Fell English (Igino Marini, OFL).

The code is MIT licensed. The book texts are in the public domain.
