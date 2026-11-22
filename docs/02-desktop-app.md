# Desktop app

## Starting and debugging

```bash
npm run dev                  # ng serve on :4200, esbuild watch, Electron restarts when the main process changes
npm run dev -- --no-inspect  # without the Node inspector
```

- Main process: VS Code "Attach: main process" (port 9229, see `.vscode/launch.json`).
- UI: F12 in the window, or "Attach: UI" (port 9222).
- The audio preload (`audio-preload.ts`) is only built at start; restart `npm run dev` after changing it.

### Screenshot script (checking the layout without looking)

```bash
STZ_SCREENSHOTS=path/to/steps.json STZ_SCREENSHOTS_QUIT=1 ./node_modules/electron/dist/electron.exe apps/desktop
```

Steps: `{"route": "/settings"}`, `{"click": "css selector"}`, `{"eval": "statement"}`, `{"wait": 1500}`, `{"shot": "name"}`, `{"log": "expression"}`. Screenshots are saved next to the JSON file. In this mode the window keeps painting while other windows cover it (Chromium's `CalculateNativeWinOcclusion` is off); otherwise Windows pauses it and the shots show an old frame. Remove `ELECTRON_RUN_AS_NODE` from the environment when starting from a VS Code terminal.

## Data

Critical data (Client ID, tokens) never lives in the repository, in dev neither: settings, secrets and logs are always in the user profile. Dev uses its own folder, so testing never touches the installed app's login.

| What | Dev | Installed |
| --- | --- | --- |
| Settings (version 2: the app's and each module's, [04-modules.md](04-modules.md)) | `%APPDATA%\Stream Toolz-dev\config.json` | `%APPDATA%\Stream Toolz\config.json` |
| Client ID, tokens, OBS key (encrypted) | `%APPDATA%\Stream Toolz-dev\secrets.bin` | `%APPDATA%\Stream Toolz\secrets.bin` |
| Technical logs (14 days, no chat content) | `%APPDATA%\Stream Toolz-dev\logs` | `%APPDATA%\Stream Toolz\logs` |
| Voice packages (no secrets) | `.cache/tts` in the repository | `%APPDATA%\Stream Toolz\voices` |

`STZ_DATA_DIR` moves the data folder (voices go below it too), but a folder inside the repository is refused: the app falls back to the profile folder. `STZ_DEVTOOLS=1` allows DevTools in a packaged build. The `RMC_*` names from before the rename still work (`env.ts`).

## Logs and errors

- No obfuscation, and the main process is not minified: measured on 2026-10-22, minifying saved 48 KB and 0.6 ms of compile time per start, while Electron itself is 361 MB. The UI is minified by Angular's production build.
- **Stack traces point to TypeScript.** `dist/main.cjs` is a two-line bootstrap (written by `scripts/build.mjs`) that switches Node's source maps on before the bundle `dist/app.cjs` loads, so errors of the main process show e.g. `connection.ts:123`. The UI's production build writes hidden source maps (not referenced from the bundles); `stack-map.ts` maps UI frames like `chunk-C3_VOEE3.js:4:120453` to `src/app/core/stz.ts:24:94` when they are logged.
- Into the daily log go: uncaught errors and unhandled rejections of the main process (the app keeps running instead of showing Electron's error dialog), crashed window or helper processes, and UI errors (Angular's ErrorHandler → `reportError`, at most 20 per minute).
- `logger.ts` masks tokens, device codes, OAuth codes and the OBS key in every line, in case an error message carries one. Chat messages are never logged.

## Shortcuts

`hotkeys.ts` registers the shortcuts of every module that is on with Electron's `globalShortcut` (system-wide, also while a game has the focus). ReadMyChat's defaults: pause/resume `Ctrl+Shift+F9`, skip `Ctrl+Shift+F10`, clear off. A key another program (or an earlier module) holds shows as "taken". While a new key is being recorded in the UI the shortcuts are suspended, so the old key does not fire. Allowed: a key with Ctrl/Alt/Shift/Win, or a function key (F1–F24) or number pad key alone (`isValidHotkey` in `packages/core/src/hotkeys.ts`, shared by UI and main process). Tested on 2026-10-22 by sending `Ctrl+Shift+F9` from another program: the reader paused.

## Processes and windows

- **Main window**: the Angular UI, sandboxed, context isolation, only the fixed `window.stz` API (`preload.ts`, contract in `bridge-api.ts`): the shell's calls (`packages/core/src/api.ts`) and one namespace per module, `window.stz.<id>` ([04-modules.md](04-modules.md)).
- **Audio window** (hidden): `app://stz/audio.html`, an empty page; the player is its preload. It plays on the chosen device (`setSinkId`) and lists the devices from the same origin, so ids and names match.
- **Windows and the player**: the hidden audio window is started again when its renderer crashes; after three crashes within a minute only every 10 s. Quitting waits at most 3 s for the local server. Chromium resolves no host names at all (`host-resolver-rules`; `localhost` stays for the dev server): the windows show only `app://stz`, and Twitch, downloads and the local server run in Node.
- **Local server** (`local-server.ts`), loopback only, default port 47391:
  - `/obs/<key>/`: the OBS browser source page, `player.js`, `events` (server-sent events), `clip/<id>`, `done/<id>`.
  - `/<module id>/<key>/…`: a module's own browser source (`host.server.handle`, since 2026-10-30), with the same key; "New address" replaces it for every module. The modules' pages are described in `docs/modules/`.
  - On connect the events start with `hello` (the player's version: a page from an older app version reloads itself) and `active` (the newest source plays). The player reconnects by itself, also after an error answer.
  - Requests must name `localhost`, `127.0.0.1` or `[::1]` with the port as host.
- **Engines**: Piper runs as one long-lived process per voice; sherpa-onnx (no package in the catalogue today) once per clip; Windows voices through a Windows PowerShell process. A part file the engine just wrote may be held by a scanner for a moment: it is read again after a short wait, and a part file that cannot be removed stays in the work folder rather than costing the message. `voice.ts` keeps one voice per chat language (German, English) and reuses it until the voice, tempo or a pause changes.

## Settings

The app's defaults are in `DEFAULT_APP_SETTINGS` (`packages/core/src/settings.ts`), each module's in its own (ReadMyChat: `DEFAULT_SETTINGS` in `modules/readmychat/src/settings.ts`). Each is checked by its normalize function for every change from the UI and every start (old or hand-edited config). New behaviour gets a setting there, a control on the settings page and texts in `de.ts` and `en.ts` (the shell's in `apps/ui/src/app/i18n`, a module's in `modules/<id>/ui/i18n`).

## Before a release

Decided 2026-10-28; every release checks all three and records the run in [05-release-check.md](05-release-check.md):

- **Security scan, complete**: the packages (`npm audit`, every dependency and its license at its source), the repository for secrets (nothing from the user profile, no Client ID, no tokens or keys), and the code for weaknesses (the IPC guards, the local server, the content security policy, file paths).
- **Full test coverage**: `npm test` passes and covers every package and module.
- **Licenses**: every dependency, voice package and engine has a license that allows the use, and the About page lists it.
