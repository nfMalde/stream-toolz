# Channel Points

A sound for each channel points reward that is redeemed. Built 2026-10-30 as the module `channelpoints` (`modules/channelpoints/`), off by default.

## What it does

The streamer loads the channel's custom rewards from Twitch once (a button, not on every visit), gives each one a sound from the module's own sounds folder, a volume and a cooldown, and switches single rewards on or off. When a viewer redeems a reward, its sound plays on the chosen output: ReadMyChat's OBS browser source (only in the stream, with its own fader in the OBS mixer) or an audio device. Sounds play one after another; a "Last redemptions" card shows what came in and what happened to it.

## Twitch

- Feature `redemptions`: the permission `channel:read:redemptions`. **Broadcaster only**: Twitch delivers redemptions and the reward list only for the logged-in account's own channel, and only for affiliates and partners. When the app reads another channel (the Twitch page's "channel" setting), the feature is `unavailable` and the page says so; when the login is older than the module, it is `needs-login` and the page offers a new login (which then asks for this permission too).
- What is read from Twitch: the EventSub event `channel.channel_points_custom_reward_redemption.add` (the shell subscribes while the module is on) and, on "Load rewards", `GET /helix/channel_points/custom_rewards` (id, title, cost, enabled). Nothing else, and nothing is written.
- The reward's title is cached in the settings so the row has a name while Twitch is not reachable; a renamed reward keeps its sound (the title is refreshed on the next load).

## Settings (`config.json` → `modules.channelpoints.settings`)

| Key | What |
| --- | --- |
| `rewards` | By reward id (Twitch's UUID): `{ title, sound, volume 0..100, cooldownSeconds 0..3600, enabled }`. `sound` is a file name in the sounds folder (`''` = none). At most 200 rewards; ids must match `^[\w-]{1,64}$`, file names `^[\w-][\w.-]{0,119}$` (never `.` or `..`). |
| `output` | `'device'` or `'obs'` (ReadMyChat's OBS audio source, `host.audio.obs`). |
| `deviceId` | The audio device for `'device'` (`''` = system default). |
| `volume` | Master volume 0..100, multiplied with the reward's own. |
| `maxQueue` | 1..20 (default 5): with this many sounds waiting, new redemptions are skipped (`queue-full`). |

The log size is fixed (50 entries, `LOG_SIZE` in `src/settings.ts`), not a setting. The log lives in memory only.

## The sounds folder

`%APPDATA%\Stream Toolz[-dev]\modules\channelpoints\sounds`. "Add sounds" opens a file dialog (WAV, MP3, OGG); the picked files are **copied** into the folder, never referenced where they were. Names are cleaned to letters, digits, `_`, `-` and `.` (`Mein Sound (final).WAV` → `Mein-Sound-final.wav`); an existing name gets a suffix (`-2`, `-3`, …), nothing is overwritten. Files over 10 MB and other types are rejected (the page lists them). "Open folder" shows the folder, so files can also be dropped in by hand: the module watches the folder and the list follows. Buffers are cached per file and re-read when the file's size or modification time changed.

Every path the module touches is below that folder: the name is checked against the pattern and the joined path is verified to stay inside. Only files with a sound extension are listed and played.

**WAV plays best on the OBS output.** The OBS audio source reads a clip's length from its WAV header; for MP3 and OGG it cannot and waits 10 s before the next clip. The audio device output decodes all three with Web Audio. The page says so under the OBS output.

## How a redemption is handled (`src/player-queue.ts`, pure)

1. Dedupe by redemption id (EventSub may deliver twice).
2. Unknown reward or no sound → logged `no-sound`; switched off → `disabled`.
3. Cooldown per reward, counted from when a redemption was **accepted** (not when it played): a wave within the cooldown is one sound, however long the queue is → `cooldown`.
4. More than `maxQueue` waiting → `queue-full` (the new one is skipped; the waiting ones keep their place).
5. Otherwise it waits its turn and plays with `master × reward` volume → `played`.

"Test" on a reward plays its sound ahead of the queue, regardless of cooldown and switch, and is logged as `test`. The preview (headphones button) always plays on the audio device, never on the stream. Switching the output stops the old sink; `stop()` (module off, app closing) clears the queue and stops both.

## Bridge (`window.stz.channelpoints`)

`settings()/setSettings()/onSettings()` (the shell's three), `rewards()` → `{ rewards }` or `{ error: 'needs-login' | 'unavailable' | 'not-connected' | message }` (401 and 403 from Helix map to the first two), `status()`/`onStatus` → `{ sounds, log, queued }`, `test(rewardId)`, `preview(name)`, `pickSounds()` → `{ added, rejected }`, `removeSound(name)`, `openSoundsFolder()`. Every argument is checked (`asString`, the id and name patterns).

## What leaves the PC

Nothing but the two Twitch calls above (the login's own token to Twitch's API). No sound, no viewer name, no redemption text is written to disk or sent anywhere; the technical log counts sounds added and notes a failed reward load, never names or inputs.

## Decisions

- **The OBS output is ReadMyChat's source** (the shell's `host.audio.obs`), as the brief says: one browser source in OBS plays both the chat and the sounds; its address is set up under ReadMyChat → Output. One clip plays at a time on each output, so a sound and a chat message never overlap on the OBS source (the chat waits). A shared speech floor with priorities is the shell's job (docs/04, "When a second module speaks").
- **The new redemption is skipped when the queue is full**, not the oldest: a sound answers a specific redemption, and the person who waited keeps their turn.
- **Rewards are loaded on a click**, not when the page opens: the page should work without Twitch (the configured rewards show from the settings), and the module reads from Twitch only when asked.
- **Names in `@stz/api`**: every module's `api.ts` is merged into one namespace, so the module exports `ChannelpointsSettings` and `ChannelpointsOutputMode`, not `Settings`/`OutputMode`.

## Open

- No "what happens at zero/at once" mixing: a sound waits for the clip before it (per output). Mixing belongs to the shell (Alerts needs it too).
- Rewards of a channel the account moderates: Twitch allows redemptions for the broadcaster only; nothing to do here.
- The sounds list and status are polled on demand plus a folder watch; a very large folder (hundreds of files) is listed on every status call.
