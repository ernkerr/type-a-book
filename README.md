# Type a Book

Pick a book off the shelf and type it on an old typewriter. You read it as you go.

Play it at **[ernkerr.github.io/type-a-book](https://ernkerr.github.io/type-a-book/)**.

## How it plays

- The book's words show faintly on the paper, and you type over them in ink.
- The carriage moves with every letter, the bell rings near the end of a line, and the carriage returns when you type the space at the end of it. Press Return at the end of a paragraph.
- A wrong key strikes in red and you try again. There's no backspace, like a real typewriter.
- Each chapter starts a new sheet. A full sheet comes out of the machine and lands on the stack of pages beside it.
- Finishing a chapter gets you an index card, stamped with the date: the words you typed, how long it took, and your speed.
- Your place is saved in your browser. Hover a book you've started to see how far you are, and the top of the shelf takes you back to the last one.
- On a phone, tap the paper to bring up the keyboard.

No build step and no framework: an HTML page, a stylesheet and three JavaScript files. The typewriter sounds are made in the browser with the Web Audio API, so there are no recordings.

## Books

Twenty books on three shelves: adventure and science fiction (The Time Machine, The War of the Worlds, Twenty Thousand Leagues Under the Sea, Around the World in Eighty Days, Treasure Island, Frankenstein, Dracula, The Adventures of Sherlock Holmes), books everyone should read (Pride and Prejudice, The Great Gatsby, Jane Eyre, Great Expectations, The Picture of Dorian Gray, Moby-Dick, The Odyssey, Meditations), and a shelf of wonderlands (Alice's Adventures in Wonderland, Through the Looking-Glass, The Wonderful Wizard of Oz, The Secret Garden).

Every book is in the public domain. Newer books can't go on the shelf until their copyright runs out.

To add one:

1. Save its plain text as `scripts/sources/<id>.txt` (not committed).
2. Add it to `scripts/books.json`: its title, author, year, cloth color, which shelf it's on, a regular expression for its chapter headings, and how many chapters it should have.
3. Run `node scripts/build-books.mjs` (or `node scripts/build-books.mjs <id>` for one book).

The build keeps only the book itself: no front matter, contents, prefaces, footnotes, illustrations, publisher's ads, or a distributor's header and license. It converts the text to what a typewriter has: straight quotes, `--` for dashes, no italics, Greek spelled out in Latin letters. Verse keeps its line breaks. It checks each book's chapter count against `books.json` and stops if one is off.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Fonts from Google Fonts: Special Elite (Astigmatic, Apache 2.0), Courier Prime (Alan Dague-Greene, OFL) and IM Fell English (Igino Marini, OFL).

The code is MIT licensed. The book texts are in the public domain.
