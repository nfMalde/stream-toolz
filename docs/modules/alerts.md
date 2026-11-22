# Alerts

Follows, subs (Prime told apart), resubs with their message, gifted subs (single and community) and raids as an
OBS overlay with a sound. Built 2026-10-30 as a module (`modules/alerts/`); off by default.

## What it does

- Listens to the shell's Twitch connection (`host.twitch.on('event', …)`, the `ChannelEvent` of
  `packages/twitch/src/events.ts`). It declares the features `chat` (subs, gifts, raids come as chat notices) and
  `follows`; a missing permission shows as a banner on the Alerts page, like ReadMyChat's.
- Puts each event into a queue (`src/queue.ts`, pure): one alert on screen at a time, for its duration; the others
  wait, at most 50 (the oldest go first). Follows beyond the limit per minute are collapsed into the last follow
  still waiting ("Anna folgt jetzt! … und 3 weitere"); raids with fewer viewers than the minimum and events the
  user switched off are dropped; an event id seen before is dropped (Twitch may deliver one twice).
- Serves the overlay page on the shell's local server under `http://127.0.0.1:<port>/alerts/<key>/` and pushes
  the alerts to it as server-sent events. **The page plays the sound itself** through an `<audio>` element at the
  event's volume, so in OBS the sound goes through the browser source ("Control audio via OBS": its own fader,
  only into the stream). If "Also play on an audio device" is on, the same file also plays on the shell's device
  player (`host.audio.device`), for the streamer's own ears; the player decodes WAV, MP3 and OGG.
- Sounds the user picks (`host.desktop.pickFiles(['wav','mp3','ogg'])`) are **copied into the profile**
  (`%APPDATA%\Stream Toolz[-dev]\modules\alerts\sounds`), never referenced where they were picked: the overlay and
  the device player must find them later, also from a drive that is gone. Names are cleaned to `[\w.-]`, files
  over 10 MB are refused, a different file with the same name gets a suffix (`beep-2.wav`), the same file again is
  not copied twice. The settings keep only the file name, never a path.

## Settings (`src/settings.ts`)

| Key | What |
| --- | --- |
| `events.<kind>` | Per kind (`follow`, `sub`, `prime`, `resub`, `gift`, `communityGift`, `raid`): `enabled`, `text` ('' = the default of the app language, placeholders `{name}`, `{count}`, `{months}`, `{recipient}`, `{tier}`), `sound` (a file name in the sounds folder, '' = none), `durationSeconds` 2..60 (default 8), `volume` 0..100 (default 80). |
| `followLimitPerMinute` | 0..60, default 5; 0 = no limit (every follow its own alert). |
| `minRaidViewers` | 0..10000, default 0. |
| `style` | `fontSize` 16..120, `fontFamily` sans/mono/serif/rounded, `textColor`, `accentColor`, `background` (hex with optional alpha, or `transparent`), `position` top/center/bottom, `animation` fade/slide/pop, `showMessage` (the resub message below the alert). |
| `deviceOutput`, `deviceId` | The sound also on an audio device ('' = the system's default). |

`normalizeSettings` checks everything; a sound name must match `/^[\w.-]{1,120}$/` and is never `.` or `..`.
The default texts live in `src/texts.ts` (German and English, with forms for a count of one as in ReadMyChat's
`eventsOne`); the UI shows them as the placeholder of each text field.

## The page and its events

Under `/alerts/<key>/` (the key is the shell's, the same as ReadMyChat's OBS source; "New address" there replaces
it for every module):

| Path | What |
| --- | --- |
| `` (the page) | Transparent HTML; in a normal browser a note (and a click to allow sound). No inline script (CSP `script-src 'self'`), styles from `style.css` plus the CSS variables the script sets. |
| `page.js`, `style.css` | The script and the style. |
| `events` | Server-sent events: `hello` (the page's version; an older page reloads), `style` (the style and the kind labels in the app language; sent again when they change), `alert` (`{ id, kind, title, message?, soundUrl, durationMs, volume, test? }`; a page that connects mid-alert gets the rest of it, without the sound), `clear`. A comment every 15 s keeps the connection open; at most 8 pages, the oldest is dropped. |
| `sound/<name>` | A sound of the folder, by its plain name; anything else (a path, `..`, an unknown or odd name) is 404. |

The headers are those of the shell's OBS page (`apps/desktop/src/obs.ts` `send()`), plus `media-src 'self'` for
the `<audio>` element. The page builds its DOM with `textContent`: an event text or a resub message is never HTML.

## Calls from the UI (`window.stz.alerts`)

`settings()`, `setSettings()`, `onSettings()` (the shell's), `status()` / `onStatus` (`{ url, sounds, queued,
current?, pages }`), `test(kind)` (a sample event with the name "Maldö", marked as a test: it skips every filter,
also a switched-off event), `clear()`, `pickSounds()`, `removeSound(name)`, `preview(name)` (on the audio device,
never on the stream), `copyUrl()`, `openUrl()`.

## The UI

- **Alerts** (`/alerts/alerts`): banners for the Twitch states (not connected, chat or follows need a new login,
  follows unavailable, port taken); the address with copy and open (hidden in streamer mode by `<stz-secret>`), the
  OBS steps, what is on screen and how many wait; one card per event kind (on/off, text, sound with a preview
  and "Add sounds", duration, volume, Test); the follow limit and the raid minimum; the audio device; the list of
  sounds (remove); the placeholders.
- **Look** (`/alerts/look`): a preview box in the app, font size and family, the three colours (the background's
  opacity as a slider; stored as `#rrggbbaa`), position, animation, the resub message, and "Test in OBS".

## What leaves the PC

Nothing. The page loads nothing from the internet (no fonts, no CDN). The technical log gets counts and file
counts, never viewer names or chat text.

## Decisions

- **The page plays the sound, not the shell's OBS audio source** (brief, 2026-10-30): the shell's source plays one
  clip at a time and only on the newest connected page; the alert's picture and sound belong together, in the
  same browser source, with one fader in the OBS mixer.
- **Follow waves collapse, rather than being dropped** (ReadMyChat drops them): the screen shows "… und 3 weitere",
  so a wave is visible once, briefly. `0` means no limit, as ReadMyChat's `userLimit` does.
- **One alert at a time, in the module** for now. When a second module with a voice or sound comes, the shared
  floor belongs in the shell (docs/04, "When a second module speaks").
- **Test alerts go through the queue** like real ones, so the user sees the actual timing.
- Sounds are small (10 MB) and copied, never referenced in place (same rule as ReadMyChat's voices).

## Open

- Mixing with ReadMyChat: the device player plays one clip at a time, so an alert sound on the device cuts a
  running chat message there (and vice versa). The OBS page is separate from ReadMyChat's source, so in OBS both
  play. A shared floor with priorities (an alert before a chat message) is a shell task.
- Pictures or GIFs per alert, and a sound library to pick from: not built; the user brings their own files.
- An alert that is on screen is not updated when more follows join it later (only a waiting one is).
