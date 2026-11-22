# Chat Overlay

The Twitch chat as a browser source in OBS, styled in the app. Module id `chatoverlay`, folder `modules/chatoverlay/`, off by default. Built 2026-10-30.

## What it does

The module listens to the shell's one Twitch connection (`message`, `deleted`, `userCleared`, `chatCleared`, `event`) and keeps the last few lines: chat messages with the chatter's name, colour, roles and the message split into text, emotes and mentions, plus one-line notices for follows, subs, gifted subs and raids. It serves one page on the shell's local server; OBS shows it as a browser source. Moderation reaches the stream: a deleted message, a timed-out or banned user and a cleared chat take the lines off the overlay too.

Twitch features: `chat` (the messages and notices) and `follows` (follow notices, only when the login has that permission; the chat runs without).

## Settings

| Key | Values | Default | What |
| --- | --- | --- | --- |
| `maxMessages` | 1..50 | 12 | Lines shown at most; older ones leave. |
| `fadeSeconds` | 0..600 | 0 | A line fades out after this many seconds; 0 = it stays until pushed out. |
| `fontSize` | 12..64 px | 22 | |
| `fontFamily` | `sans`, `mono`, `serif`, `rounded` | `sans` | Font stacks of system fonts (`src/style.ts`); nothing is downloaded. |
| `textColor` | colour | `#ffffff` | |
| `background` | colour | `transparent` | Behind the whole chat column. |
| `nameColors` | `twitch`, `single` | `twitch` | Each chatter's Twitch colour, or one colour for all. |
| `nameColor` | colour | `#ff730f` | The one colour, and the fallback for chatters without a Twitch colour. |
| `showBadges` | boolean | true | Small coloured tags STREAMER / MOD / VIP / SUB, drawn in CSS (no badge images). |
| `emotes` | `text`, `images` | `text` | See "What leaves the PC". |
| `direction` | `up`, `down` | `up` | `up`: newest at the bottom, older lines move up; `down`: newest at the top. |
| `align` | `left`, `right` | `left` | |
| `width` | 200..1920 px | 600 | The chat column; the browser source should be at least as wide. |
| `hideCommands` | boolean | true | Messages starting with `!`. |
| `hideBots` | login names | ReadMyChat's bot list | Copied, not imported: a module does not reach into another module's settings. |
| `showEvents` | boolean | true | Follows, subs and raids as notices. |

A colour is `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `rgba(…)` or `transparent` (`COLOR` in `src/settings.ts`); anything else keeps the previous value, so a settings value can never carry more than a colour into the page's styles. The UI shows a colour picker and, for the background, an opacity slider (`src/color.ts` converts).

`normalizeSettings` checks every key (`test/settings.test.ts`).

## The page on the local server

Under `http://127.0.0.1:<port>/chatoverlay/<key>/` (the shell checks the key and the Host header; "New address" on ReadMyChat's Output page replaces the key for every module):

| Path | What |
| --- | --- |
| `` (the page) | Transparent HTML, no inline script. In a plain browser a note shows while the list is empty. |
| `page.js` | The page's script (`main/page.ts`, a plain string). Builds DOM nodes with `textContent`, never HTML. |
| `style.css` | The stylesheet (`src/page-css.ts`), the same one the preview in the app uses. |
| `events` | Server-sent events. |

Events to the page: `hello` (the script's version; an older page reloads), `style` (the CSS values from the settings), `texts` (the browser note, in the app language), `backlog` (every current line, on connect), `message` (one line), `remove` (ids), `clear`, `reload` (the emote setting changed: the page needs a new CSP, see below). The page keeps the lines, stacks them by `direction`, fades them after `fadeSeconds` (a backlog line already older than that is not shown), redraws on `style`.

Client bookkeeping (`main/server.ts`, after GT Toolz's overlay server): at most 16 streams (a 503 beyond that), a keep-alive comment every 15 s, a client with more than 64 KB unsent for 10 s is dropped (OBS reconnects on its own). `stop()` ends every stream.

Security headers are those of the shell's OBS page (`apps/desktop/src/obs.ts`), copied into `send()`: `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src <see below>; frame-ancestors 'none'`.

## Calls from the UI (window.stz.chatoverlay)

`settings()`, `setSettings()`, `onSettings()` (the shell's three), `status()` → `{ url, items, clients }`, `copyUrl()`, `openUrl()` (through the shell: the UI has no clipboard and opens no pages itself), `testMessages()` (four sample messages with emotes, a mention and every role, plus a follow, all marked as tests; on the overlay too). Events: `item`, `removed`, `cleared`, `clients`.

## The UI

One page, `/chatoverlay/overlay`: the preview (the last lines in an element with the chosen width and background, drawn with the page's own stylesheet, injected as a `<style>` element so it is one stylesheet, not a copy), the address for OBS (hidden by `<stz-secret>` in streamer mode) with the OBS steps, the look settings and the filters. Banners as on ReadMyChat's Live page when Twitch is not connected, the chat permission is missing, Twitch has an error, or the port is taken.

The preview shows emotes as text, always: the app loads nothing from the internet.

## What leaves the PC

Nothing, with one exception the streamer chooses: with `emotes: 'images'` the page in OBS's browser loads each emote's picture from Twitch's CDN (`https://static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/2.0`). That is why the default is `text`, why the UI hint says so, and why the page's CSP allows that one host only when the setting is on (the page is served with `img-src https://static-cdn.jtvnw.net` then, `img-src 'none'` otherwise; when the setting changes, the module sends `reload` so the open pages get the matching CSP). The app's own window never loads emote pictures.

Chat text and viewer names never go to the technical log.

## What was decided and why

- **The Twitch message carries the colour and the emote id** (`packages/twitch/src/message.ts`, additive, optional): `color` only when it looks like `#RRGGBB`, `emoteId` only when it matches `[A-Za-z0-9_-]{1,64}`. ReadMyChat's messages without them stay valid.
- **The item is cleaned once, in the main process** (`src/overlay-item.ts`): text bounded at 500 characters across fragments, control and invisible characters and Zalgo marks removed, emotes and mentions kept whole or left out (a cut one would show a broken name), names bounded at 64, ids reduced to `[\w.:-]`. The page and the preview only place strings.
- **The page and the preview share one stylesheet** (`src/page-css.ts`): the look in the app is the look in OBS.
- **One module, two listeners of the same events**: ReadMyChat and Chat Overlay both hear `message`; neither knows the other (docs/04 "When a second module speaks").
- **Event lines are short** ("{name} folgt jetzt"), in `src/texts.ts` for de and en, not the spoken sentences of ReadMyChat: on screen a line, not a speech.

## Open

- The page keeps the lines in the language they arrived in: a language change re-sends only the browser note, not past notices.
- No per-line animation choices, no custom CSS field (OBS's own "Custom CSS" on the browser source works as usual).
- Badge pictures (Twitch's real badges) would need the badge list from Helix and image loads; left out on purpose, the tags are CSS.
