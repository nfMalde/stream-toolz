# Countdown

Timers for the stream, shown in OBS. The streamer types what they mean, "in 15 Minuten", "bis 20:30 Pause", "1h30 Giveaway", "until 8:30 pm – back soon", and the countdown runs right away. The model is Snaz, but ours understands a phrase instead of a form and goes further in what a timer can do and show (the user, 2026-10-30). Its own module, with no announcement in the chat (the user, 2026-10-30: "Keine Chat Ansage"). Off by default; `modules/countdown/`.

## What it does

- **A phrase starts a timer** (`src/parse.ts`). Understood on this PC with a small grammar for German and English, no service, no model. Durations: "in 15 Minuten", "15 min", "15m", "15 Min.", "in einer Stunde", "in anderthalb Stunden", "eine halbe Stunde", "in 2 Stunden 15 Minuten", "1h 30m", "1h30", "90 Sekunden", "in 10 minutes", "in an hour", "half an hour", "one and a half hours", "a quarter of an hour", numbers as words up to twenty ("in fünf Minuten", "in five minutes"). Times of day: "bis 20:30", "um 20:30", "20:30", "bis 20 Uhr", "um 20.30 Uhr", "um halb 9", "viertel vor 9", "until 8:30 pm", "at 20:30", "at 8pm", "half past 8", "quarter to 9", "noon", "Mitternacht". Case and spacing do not matter; both grammars are always on, whatever the app language. The rest of the phrase is the label ("in 10 Minuten: Giveaway" → "Giveaway", "5 Minuten Pause" → "Pause"), at most 60 characters.
  - A time already passed today means tomorrow. Hours 1 to 11 without am/pm mean the evening when the morning is over ("bis 8" at 15:00 is 20:00, not tomorrow 08:00); am/pm and 24-hour values are taken as they are.
  - A bare number is not a time ("20" means nothing, "bis 20" is 20:00); the German dot form needs "Uhr" or a keyword ("20.30 Uhr"), so "1.5" stays a number. A duration wins over a time of day in the same phrase.
  - Not understood: nothing, zero, more than a week, an impossible clock ("25:00", "13 pm"). The UI shows "not understood" with examples.
- **At most ten timers**, kept in the module's settings (`timers`), so a countdown to 20:30 survives a restart. Each can be paused and resumed, given or taken a minute (never below zero; a timer at zero starts again from zero with the added minute), removed; "Clear all" removes every one.
- **At zero** the timer shows "0:00" (in the chosen format). With "Text at zero" switched on (`showDoneText`, off by default: the user, 2026-11-14) the done text shows instead (`doneText`, e.g. "Los!"), in the overlay and in the files. By default it stays until the user removes it (`doneSeconds` 0, the user, 2026-11-22: "dauerhaft da bleiben (default)"); with "Disappears after zero" switched on it is removed after `doneSeconds` (5..600, the switch starts at 30 s) and its files are emptied.
- **Two outputs** (`output`: overlay, file, both; default overlay):
  - **Overlay**: a transparent page on the shell's local server, `http://127.0.0.1:<port>/countdown/<key>/`, for an OBS browser source. The key is the same as ReadMyChat's OBS address ("New address" there changes this one too); streamer mode hides the address. The page stacks the timers, newest on top, the label above the time when `showLabel`; font (four system font stacks, nothing downloaded), size, colour, alignment, shadow and label size come from the settings and change live. In a normal browser (no `window.obsstudio`) the page gets a dark background so the white text can be seen; in OBS it is transparent.
  - **Text file**: the texts are written to files in `folder` ('' = the module's data folder, `%APPDATA%\Stream Toolz[-dev]\modules\countdown`), for an OBS text source with "Read from file", so OBS controls the font. `countdown.txt` holds the newest timer; `countdown-<n>.txt` the n-th timer in the order they were started (oldest = 1, so a second timer never moves the first one's file); a labelled timer also gets `countdown-<label slug>.txt` (ASCII, umlauts transcribed; the newest timer with that label when two share it; a purely numeric label gets no file of its own, it would clash with the numbered ones). A removed or finished timer's files are **emptied, not deleted**: OBS keeps pointing at them. Files are written only when their content changed, atomically (a `.tmp` in the same folder, then renamed), so OBS never reads half a text. The folder is created if missing; when that fails the module keeps running, logs it (once a minute at most) and the UI shows a banner.
- **The UI** (`/countdown/timers`): one page. A big input (Enter starts), the timers as cards with the remaining time (counted down by the page itself, once a second, from `endsAt`/`pausedRemainingMs`; no tick event from the main process), chips for paused/done, pause/resume, −1 min, +1 min, remove. The "Output" card: the output choice; for the overlay the address with copy and open, a connected/waiting chip and the OBS steps; for the file the folder with choose/open and the file names. The "Look" card: time format, done text, done seconds; and for the overlay size, font, colour, alignment, shadow, label.

## Settings (`src/settings.ts`)

| Key | Values | Default |
| --- | --- | --- |
| `timers` | at most 10 `{ id, label, endsAt, pausedRemainingMs?, createdAt }`, checked one by one | `[]` |
| `output` | `overlay`, `file`, `both` | `overlay` |
| `folder` | an absolute path or '' (the data folder) | `''` |
| `format` | `auto` (14:59 / 1:14:59), `mm:ss` (74:59), `hh:mm:ss`, `minutes` (rounded up: "15 min", "1 h 05 min") | `auto` |
| `showDoneText` | boolean | `false` |
| `doneText` | one line, at most 100 characters | `''` |
| `doneSeconds` | 0 (stays) or 5..600 | 0 |
| `fontSize` | 24..400 px | 96 |
| `fontFamily` | `sans`, `mono`, `serif`, `rounded` | `sans` |
| `color` | `#rrggbb` | `#ffffff` |
| `align` | `left`, `center`, `right` | `center` |
| `shadow` | boolean | true |
| `showLabel` | boolean | true |
| `labelSize` | 12..200 px | 36 |

Seconds are rounded up for display, so 0:00 shows only when the timer is done and never while a moment is left.

## The page on the local server (`main/page.ts`)

Under `/countdown/<key>/` (the shell checks the key and the Host header), GET only:

| Path | What |
| --- | --- |
| `` (the page) | HTML: a `<div id="timers">`, `style.css`, `page.js`. No inline script (CSP `script-src 'self'`). |
| `page.js` | The script: connects to `events`, applies the look as CSS variables, keeps one element per timer and updates it in place (no flicker), reconnects by itself (ever slower after an error answer, like the OBS audio source). |
| `style.css` | The layout with the settings' values as `:root` variables (the `style` event overrides them live). |
| `events` | Server-sent events: `hello` (the script's version: an older page reloads), `style` (the CSS variables), `timers` (`[{ id, label, text, done }]`, newest first). Sent on connect, then only when something changed; a ping every 15 s; at most 8 pages (the oldest is dropped); a page with more than 64 KB unread is dropped as stalled. |

The headers are the same as the shell's OBS source (`apps/desktop/src/obs.ts`), copied into the module's own `send()`: a module cannot import from the shell.

## Calls from the UI (`src/api.ts`, `window.stz.countdown`)

`start(phrase)` → the timer or `{ error: 'not-understood' | 'too-many' }`; `pause(id)`, `resume(id)`, `adjust(id, deltaMs)` (±1 h at most), `remove(id)`, `clear()`; `status()` and the `status` event → `{ timers, texts, url, folder, folderError?, clients }` on every change of the timers, the address, the folder or the connected pages (not every second); `copyUrl()`, `openUrl()`, `pickFolder()` (saves the setting), `openFolder()`. Every argument is checked (`asText`, `asString`, `clamp`).

## What leaves the PC

Nothing. The phrase is understood locally; the page loads nothing from the internet (system fonts only); the files are written to a folder on this PC. The technical log holds the number of timers and the seconds of a started one, never a label.

## Decisions

- **Timers in the settings** (not a file of their own): the shell saves, validates and announces them; a restart continues a countdown to 20:30 at the right place. Every change goes through `host.updateSettings({ timers })`.
- **The outputs are touched only on a change**: the tick (every 500 ms) works out the texts and compares the round with the last one; the overlay gets an event and the files a write only when a text, the output or the folder changed. A file is also compared with what this process last wrote, so an unchanged text never rewrites it.
- **Numbered files follow the start order, not the overlay's order** (which is newest first): a streamer who points a text source at `countdown-1.txt` keeps the first timer there when a second one starts.
- **Emptied, not deleted**, and emptied on `stop()` too: no countdown runs while the module is off, and OBS keeps its file.
- **"Look" shows the format, done text and done seconds for every output**, the overlay rows only when the overlay is used: the format applies to the file too.
- **Hours 1..11 without am/pm guess the evening** when the morning is over; a streamer at 15:00 typing "bis 8" means 20:00.
- **Pausing a done timer does nothing** (it would show 0:00 for good); −1 min on a done timer does nothing, +1 min restarts it from zero.

## Tests (`test/`)

The parser (more than 100 phrases, German and English, labels, times of day with the day change and the evening guess, negatives), the timer arithmetic, the formats, `normalizeSettings`, the file plan and slugs, and the module with a fake host (settings in memory, a fake SSE connection collecting the events, a temp folder for the files: the contents, that an unchanged text is not rewritten, emptying on removal and on stop, the done text and the expiry, a folder that cannot be created, the desktop calls, only GET and known paths).

## Open

- **What happens at zero beyond the done text** is left open by the user (docs/04). A sound at zero (through `host.audio`) and a flash or animation of the overlay would be later additions; the `done` flag already reaches the page for a CSS class.
- A phrase in a form the grammar does not know ("in 1 min 30", "bis viertel 9", "tomorrow 20:00") answers "not understood"; more forms can be added in `src/parse.ts` with a test each.
- A hotkey for the most common actions (pause/resume the newest timer, +1 min) is easy through `host.hotkeys` once the user wants one.
- The language of the phrase is not used yet (both grammars are always on); the parameter is there for a later preference.
