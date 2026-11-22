# Modules

Stream Toolz is a shell with modules. The shell owns what all modules share; a module is one folder with its logic, its main-process part and its UI. Modules are built in and switched on or off on the Modules page; there are no downloadable or third-party modules (decided 2026-10-28). ReadMyChat is the first module.

## Layout

| Folder | What |
| --- | --- |
| `packages/core` | The shell's contract: the app API without the modules (`api.ts`), the module contract (`module.ts`), the app settings, checks for settings and IPC arguments. No Electron. |
| `packages/twitch` | Login, EventSub, Helix, chat messages and channel events, and the features modules read (`features.ts`). |
| `packages/speech` | Piper, Windows voices, the optional voice packages (the sherpa-onnx engine code is kept, no package uses it today). |
| `modules/<id>/src` | The module's logic, without Electron. `api.ts` is its part of the UI contract (types only). |
| `modules/<id>/main` | The module in the main process (`module.ts`, its `ModuleDefinition`) and its part of the preload (`preload.ts`). |
| `modules/<id>/ui` | Its Angular pages, stores and texts; `module.ts` is its `ModuleUi`. It imports the shell's parts as `@shell/…`. |
| `apps/desktop` | The shell's main process: windows, security, logs, secrets, config, the Twitch connection, the local server, the audio outputs, shortcuts, and the module host (`modules.ts`). |
| `apps/ui` | The shell's UI: title bar, navigation, the Modules page, Twitch, app settings, setup assistant, About. |

## What a module gets

A module's main part never imports Electron. `start(host)` gets everything it uses from its host (`packages/core/src/module.ts`):

- its settings (`settings()`, `updateSettings()`), checked by the module's own `normalize`, and the app settings to read;
- the events of the one Twitch connection (`host.twitch.on(…)`);
- the audio outputs: an audio device bound to the module's own device setting, and the OBS browser source; one clip plays at a time on each;
- where voice packages are installed;
- system-wide shortcuts (`host.hotkeys.set(…)`);
- its own browser source on the shell's local server (`host.server.handle(…)`, `host.server.url()`: `/<id>/<key>/…`, the key shared with the OBS audio source);
- the desktop through the shell (`host.desktop`: clipboard, a local page in the browser, open or pick a folder, pick files), since a module never imports Electron;
- its own folder in the user's profile (`host.dataDir`: `%APPDATA%\Stream Toolz[-dev]\modules\<id>`) for files it writes or copies in (text files for OBS, sounds);
- `host.twitch.customRewards()` and `host.twitch.sendMessage()` for modules that declare the features `redemptions` or `chatWrite`;
- its IPC namespace: `bridge.handle(name)` answers `stz:<id>:<name>`, `bridge.send(event)` sends `stz:<id>:<event>`. Its preload part (`main/preload.ts`) builds `window.stz.<id>` from the same names, so the UI still gets a fixed set of calls.

The shell tells a running module when its settings changed, when the app's settings changed (`appChanged`: language, port), when OBS sources connect or the port is taken, and when voice packages are about to be removed or were changed. When a module stops (switched off, app closing), it stops playing and closes its engines in `stop()`; the host removes its IPC handlers, Twitch listeners and shortcuts. A module that throws while starting stays off; the app keeps running.

## Settings and config.json

`config.json` has version 2: `{ version, app, modules: { <id>: { enabled, settings } }, guideDone }`. The shell keeps every module's settings and answers `stz.<id>.settings()`, `setSettings()` and `onSettings()`, also while the module is off.

A file from before the modules (version 1, one flat `settings` object) moves over once at start: the app's keys (language, streamer mode, channel, port) become `app`, the rest ReadMyChat's. The old file stays as `config.v1.json`. Modules this version does not know are kept in the file.

## Twitch permissions

A module names the features it reads (ReadMyChat: `twitch: ['chat', 'follows']`, see `packages/twitch/src/features.ts`). The login asks only for the permissions of the features of the modules that are on, and the Twitch page lists them. Switching a module on or off reconnects with the matching subscriptions.

A feature whose permission the login lacks is `needs-login`: its module shows a "log in again" banner, while the login and the other features keep running. Only an invalid or revoked login drops the stored tokens (a missing permission once did, on 2026-10-22).

## The UI

A module's `ModuleUi` (`apps/ui/src/app/core/module-ui.ts`) gives:

- `pages` and `routes`: under `/<id>/…`, only while the module is on (a route guard waits for the config);
- `railControl`: a component at the bottom of the navigation (ReadMyChat: reading on or off);
- `guide`: its steps in the setup assistant, its lines and a test button on the last step, and what it does with the language picked on the first step (ReadMyChat: the chat's main language).

Each module has its own texts (`ui/i18n/en.ts` and `de.ts`). Their keys start with the module's id (`readmychat.live.title`); the types check that German has the same keys. `apps/ui/src/app/i18n/i18n.ts` merges them with the shell's.

## Planned modules

Decided 2026-10-28, Countdown added 2026-10-30. No order yet.

| Module | What | Notes |
| --- | --- | --- |
| ReadMyChat | Reads the chat aloud. | Done, the first module. |
| OBS chat overlay | The chat as a browser source in the stream. | Served by the local server like the OBS audio source. |
| Alerts | Follows, subs, raids as an overlay with a sound. | Needs mixing: today one clip plays at a time per output. |
| Chat commands / bot | Answers in the chat. | Needs `user:write:chat`, the first write permission; still the streamer's own Public app. |
| Channel points sounds | A sound per redeemed reward. | Shares the speech floor question with Alerts (next section). |
| Countdown | Timers for the stream: a countdown to a time or for a duration, shown in OBS. The model is Snaz; ours goes further in what a timer can do and show, and is smarter about it (the user, 2026-10-30): the streamer types what they mean, "in 15 Minuten", "bis 20:30", "15 min", "in einer Stunde", and the countdown runs as an OBS overlay right away. | The phrase is understood locally (a small parser for German and English, no service, no model). Its own module, with no announcement in the chat (the user, 2026-10-30). Two outputs, the streamer picks: a browser source from the local server (like the OBS audio source), or a text file the streamer points an OBS text source at, so OBS controls the font. Open: what happens at zero. |

**Built 2026-10-30** (the user: "entwickel die module"): the five modules above, all off by default, each with its own page: [Countdown](modules/countdown.md), [Chat Overlay](modules/chatoverlay.md), [Alerts](modules/alerts.md), [Channel Points](modules/channelpoints.md), [Chat Bot](modules/bot.md); and ReadMyChat's [language packs](modules/readmychat-language-packs.md) (a new chat language is one JSON file plus a voice). Not yet tested live: the user tests after their stream.

## Adding a module

1. Create `modules/<id>/` with a `package.json` (`@stream-toolz/<id>`, exports `.`, `./api`, `./main`, `./preload`) and the folders `src`, `main`, `ui`, `test`.
2. In `main/module.ts`, write a `ModuleDefinition`: `id`, `enabledByDefault`, the settings defaults and `normalize`, its Twitch features, and `start(host)`.
3. In `src/api.ts`, write its API type (it extends `ModuleSettingsApi<Settings>`). `main/preload.ts` builds that API from a `BridgeScope`.
4. Register the module in these places:
   - `MODULES` in `apps/desktop/src/modules.ts`;
   - its namespace in `apps/desktop/src/preload.ts` and `bridge-api.ts`;
   - `MODULE_UIS` in `apps/ui/src/app/modules.ts`;
   - its texts in `apps/ui/src/app/i18n/i18n.ts`;
   - its paths in `apps/ui/tsconfig.json`;
   - the dependency in `apps/desktop/package.json`.
5. Add its tests to `modules/<id>/test`; `npm test` runs them.

## When a second module speaks

Taken from GT Toolz's refactor (its `docs/13-modules.md`, steps 5 and 7), to apply when the next module with a voice (alerts, channel points sounds) comes:

- **One speech floor in the shell**, so that two modules never talk over each other. The outputs already play one clip at a time each; a shared queue with a priority (an alert before a chat message) belongs in the shell, not in a module.
- **What other modules may use goes on a shell service**, never into another module's settings. GT Toolz puts the voice currently on air on a shell service with an event; a module reads it there.
- **A module that needs the shell's runtime objects gets them through a factory** in `main.ts` (GT Toolz: `crewModule(shell)`), not through globals.
- **Moving settings keys later** between the shell and a module, or between modules, needs an upgrade for version 2 files too, not only the move from version 1: copy the old keys to the new owner when it does not have them yet (GT Toolz: `upgradeConfig()`).
