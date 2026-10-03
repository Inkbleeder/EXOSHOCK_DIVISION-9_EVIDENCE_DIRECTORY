# DIVISION 9 // EVIDENCE ARCHIVE

A DOS/CRT-style terminal archive for evidence files (images, GIFs, video,
audio, documents, external links). Static site - no backend, no build step,
no dependencies. Deployable as-is on GitHub Pages.

The main Division 9 site can link here with a plain redirect (or use the
deep link `?open=EV-001` to land on a specific record). Use the `MAIN`
command inside the terminal to send visitors back.

---

## Deploy (GitHub Pages)

1. Create a repo (e.g. `division9-archive`).
2. Push the contents of this folder to it.
3. Repo Settings -> Pages -> Deploy from branch -> main / (root).
4. Done. The site works under a project subpath because everything is
   relative.

Optional: set `config.mainSite` in `data/evidence.json` (see below) so the
`MAIN` command has somewhere to send people.

## Local testing

Do NOT double-click index.html - browsers block `fetch()` on `file://`.
Run a tiny local server instead:

    cd division9-archive
    python3 -m http.server 8000

then open http://localhost:8000

## Adding evidence

You never touch the HTML. Everything lives in `data/evidence.json`.

1. Drop the file into `media/`.
2. Add an entry to the `evidence` array:

```json
{
  "id": "EV-012",
  "filename": "new_photo.jpg",
  "title": "Whatever The Player Sees In Lists",
  "type": "image",
  "category": "photographs",
  "date": "1994-04-02",
  "size": "120 KB",
  "description": "Shown by the INFO command.",
  "tags": ["searchable", "keywords"],
  "file": "media/new_photo.jpg",
  "related": ["EV-001"]
}
```

3. Reload the page. That's it.

### Entry fields

| Field         | Required | Notes                                             |
|---------------|----------|---------------------------------------------------|
| id            | yes      | `EV-###` style recommended; must be unique         |
| filename       | yes      | Name used by DOWNLOAD                             |
| title         | yes      | Shown in LIST / windows                           |
| type          | yes      | `image` `gif` `video` `audio` `document` `link`    |
| category      | no       | Filterable: `LIST <category>`                    |
| date / size   | no       | Free text, sortable with `/SORT:DATE`             |
| description   | no       | INFO text                                         |
| tags          | no       | Searchable keywords                               |
| file          | yes*     | Relative path, e.g. `media/xyz.jpg` (*except `link`) |
| related       | no       | Array of other IDs; INFO + `RELATED` show them    |
| hidden        | no       | `true` = not in LIST/SEARCH/TAB, but `OPEN EV-099` still works. For puzzles. |
| locked        | no       | `true` = window refuses to open: "ACCESS RESTRICTED" |
| downloadable  | no       | `false` = hide SAVE button and refuse DOWNLOAD    |
| forceDownload | no       | `true` = opening the record also triggers a download. For puzzle-forced downloads. |
| externalUrl   | no       | For `type: "link"` (e.g. a YouTube puzzle video). Opens in a new tab. |

### Config block (top of evidence.json)

```json
"config": {
  "mainSite": "https://your-main-site/",
  "prompt": "D9>"
}
```

- `mainSite` - where the `MAIN` command sends people.
- The whole green palette is two CSS variables at the top of
  `css/style.css` (`--crt-green` and friends) - tweak to match the main
  Division 9 site.

## Commands

| Command                  | Aliases        | Does                                  |
|---------------------------|----------------|----------------------------------------|
| `HELP [cmd]`              | `MAN`, `?`     | Short help / detailed help for one cmd |
| `LIST [type|cat] [/SORT:x] [/DESC]` | `DIR`, `LS` | Browse. Clickable results |
| `SEARCH <q> [in:FIELD]`   | `FIND`, `GREP` | Search all fields or one (`in:title` etc.) |
| `OPEN <id>`               | `PLAY`, `VIEW` | Open in a viewer window                |
| `INFO <id>`               |                | Full metadata + related records        |
| `DOWNLOAD <id>`           | `GET`, `SAVE`  | Verify + download the raw file         |
| `NEXT` / `PREV`           | `PREVIOUS`     | Walk the archive in ID order          |
| `RELATED <id>`            | `LINKS`        | List linked evidence                  |
| `CLEAR`                   | `CLS`          | Clear screen                           |
| `MAIN`                    | `HOME`, `EXIT` | Link back to the main site             |
| `SOUND ON\|OFF`           |                | Terminal beeps                         |
| `STATUS`                  |                | Diagnostics screen                     |
| `REBOOT`                  |                | Replay the boot sequence               |

Extras: command history (arrows), TAB autocomplete (commands, IDs, fields),
result navigation with arrows + ENTER, ESC closes the focused window,
click-drag windows, taskbar with minimized windows, deep links
(`?open=EV-001`), working sample media including one deliberately broken
record (EV-010) to demonstrate failure handling, and one hidden record
(try `OPEN EV-099`).

## Keyboard cheat sheet

- `UP/DOWN` - command history (or move through results when input is empty)
- `TAB` - autocomplete; shows options when ambiguous
- `ENTER` - run command (or open the highlighted result)
- `ESC` - close the focused window / clear result selection

## Structure

    index.html            page shell (rarely needs edits)
    css/style.css         CRT look + window styling
    js/archive.js         loads evidence.json, search/sort/filter
    js/windows.js         draggable window manager + taskbar
    js/media.js           viewers: image/GIF/video/audio/doc/link
    js/terminal.js        terminal, commands, history, autocomplete
    js/main.js            boot sequence, sound, status clock
    data/evidence.json    THE archive index - edit this
    media/                the actual files

## Design rule (from the brief)

Functional first, atmospheric second. The archive, terminal, media playback
and windows are rock-solid; the CRT effects are subtle CSS and can be toned
down or disabled by editing `css/style.css` (`#scanlines`, `#crt-overlay`).
