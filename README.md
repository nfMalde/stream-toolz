# Stream Toolz by Maldö

Tools for streamers, fully on your own PC. Free, no account with us, no tracking.

The first module is **ReadMyChat**: it reads your Twitch chat aloud.

- **Natural local voices**: Piper (German: Ramona, Eva K, Jan; English: Cori, LJSpeech, Kristin, Norman, John), Kokoro (English), CSS10 (German), or the voices built into Windows. Only voices under standard open licenses with clean training data. Optional voices are downloaded inside the app from their original sources and checked against a checksum.
- **Two outputs**: an **OBS browser source** (with "Control audio via OBS" the sound goes only to the stream and gets its own fader), or any **audio device** (headset, virtual cable).
- **German and English in one chat**: the language of each message is detected, and it is read by the voice for that language ("Anna sagt …", "Ben says …"). Messages without a clear language ("gg") use the main language.
- **Twitch events**: follows, subs (Prime told apart), resubs with their message, gifted subs and raids are read before the chat, each with its own words or the default ones. Follow bots are kept short: each person once, at most five follows a minute.
- **Pause between messages**, the name in front of every message (or only when the speaker changes, or never), long messages cut at a word, a queue that drops the oldest messages when the chat is too busy.
- **Moderation is followed**: a message a mod deletes is taken out of the queue, or stopped while it is read; timeouts and bans remove that person's messages.
- **Spam filters**, each one adjustable: bots, `!commands`, duplicates, a limit per person, links, emote-only messages, blocked words, repeated characters. Optional: only subs/VIPs/mods, or only a channel points reward.
- **No gap between messages**: the next message is rendered while the current one plays.
- **Nicknames and pronunciation**: "xx_dark_lord_xx = Lord", "gg = good game".
- **System-wide shortcuts** for pause, skip and clear, also while a game has the focus (F13–F24 work well with a Stream Deck).
- **Your own Twitch app**, registered as "Public": only its Client ID is entered (a step-by-step guide is in the app), there is no secret. The login runs by code on twitch.tv/activate and asks for two read-only permissions (chat, follower list); the login is stored encrypted (Electron `safeStorage`: DPAPI on Windows).

Status: **alpha**. Windows first; Linux and macOS later.

## Maldö

Stream Toolz is a project by Maldö and free for every streamer. If it helps you, a donation is welcome; it is voluntary and comes without perks, as every feature stays free for everyone.

- Donate: [PayPal](https://www.paypal.com/donate/?hosted_button_id=SVZHLRTQ6H4VL)
- [Twitch](https://www.twitch.tv/maldoe) · [YouTube](https://www.youtube.com/@dermaldoe) · [Instagram](https://www.instagram.com/maldoe_gaming/) · [Facebook](https://www.facebook.com/RealMaldoe) · [X](https://x.com/DerMaldoe)

The logo and colours come from Maldö's stream assets; logo files and links are the same as in GT Toolz (`apps/ui/public/maldoe-64/256/512.png`, the link bar at the bottom right and the About page).

## For developers

Requirements: Node.js ≥ 22.22.3 (npm 11), Windows 10/11.

```bash
npm ci                              # install scripts are off (.npmrc)
node node_modules/electron/install.js   # fetch the Electron binary once
npm run dev                         # Angular dev server + Electron with live reload
npm test                            # unit tests (runtime)
npm run typecheck
npm run app                         # production build of UI and main process, then start
```

End users never use npm or a terminal: everything (Twitch setup, voices, output) happens in the app.

## Layout

| Folder | What |
| --- | --- |
| `packages/runtime` | No Electron: Twitch (OAuth, EventSub, Helix), chat filters and queue, the reader, speech (Piper, Kokoro, Windows voices), settings |
| `apps/desktop` | Electron main process: windows, IPC, encrypted secrets, local server (OBS browser source), audio output |
| `apps/ui` | Angular (zoneless, signals, NgRx Signal Stores): Live, Events, Twitch, Voice, Output, Settings, About, setup assistant |
| `docs` | Plan, desktop app notes, security |

See [docs/01-research-and-plan.md](docs/01-research-and-plan.md), [docs/02-desktop-app.md](docs/02-desktop-app.md) and [docs/03-security.md](docs/03-security.md).

## License

Proprietary for now (see [LICENSE](LICENSE)). Third-party components are listed with their licenses in the app under About.
