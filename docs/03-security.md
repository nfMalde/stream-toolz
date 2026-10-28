# Security and privacy

## What leaves the PC

| Where to | When | What |
| --- | --- | --- |
| `id.twitch.tv` | Saving the app (a code is requested to check the Client ID), login by code, every hour, token refresh, logout | Client ID, device code, tokens (there is no secret) |
| `api.twitch.tv` | On connect | Who is logged in, the channel's id, the EventSub subscriptions |
| `eventsub.wss.twitch.tv` | While connected | Nothing but the WebSocket; Twitch sends the chat |
| GitHub / Hugging Face | Only when the user clicks Install under Voice | Downloads of pinned files, checked against SHA-256 |

Nothing else: no analytics, no update checks, no server of ours.

Links (Twitch developer console, OBS, Maldö's donation page and channels) come from a fixed list in `apps/desktop/src/ipc.ts`. They open in the user's browser only on a click (`https` only); the app itself never contacts these sites. Maldö's logo ships as image files with the app and is not loaded from anywhere. The windows cannot load remote content (`security.ts` cancels every request that is not the app itself); only the main process talks to Twitch.

## Login data

- The streamer's app is of type "Public": there is no client secret to store or leak. Client ID, access and refresh token and the OBS key are stored in `secrets.bin`, encrypted with Electron `safeStorage` (Windows: DPAPI, bound to the user account). Without system encryption (Linux without a keyring) nothing is written; the data stays in memory until the app closes.
- `secrets.bin` (and `config.json`, logs) live in the user profile only (`%APPDATA%\Stream Toolz`, in dev `%APPDATA%\Stream Toolz-dev`), never in the repository, so nothing secret can end up in a commit. `RMC_DATA_DIR` pointing into the repository is refused; `.gitignore` also lists `secrets.bin` as a second guard.
- Streamer mode hides the Client ID, the OBS address with its key and file paths. A file from an earlier version that still holds a client secret is rewritten without it.
- Limits, said openly in the app: DPAPI protects against copied files and other users, not against malware running in the same account.
- Logs never contain chat messages, names, tokens or keys. Error stacks are logged; every log line is passed through `scrub()` (Bearer/OAuth headers, `access_token`, `refresh_token`, `client_secret`, `device_code`, `code`, `state` parameters, token fields in JSON, the OBS key in addresses are masked).
- No obfuscation: it would not protect anything (no secret is in the code), it slows code down and makes it larger, and obfuscated code tends to trigger virus scanner heuristics.

## Local server

- Listens on `127.0.0.1` (and `::1`) only, never on the network.
- Host header check against DNS rebinding.
- The OBS source needs a random 144-bit key in the path, compared in constant time; "New address" replaces it.
- The login needs no local page (it runs by code on twitch.tv/activate); the app opens only Twitch addresses from Twitch's answer.
- Every streamer uses their own app: a misused Client ID can only affect that streamer, never other users or Maldö. Stream Toolz asks only for `user:read:chat` and `moderator:read:followers` (read-only: the chat and the follower list), and the app tells the streamer so ("if a code asks for more, it is not ReadMyChat").

## Dependencies

Same rules as GT Toolz: exact pins, `ignore-scripts=true`, versions at least 14 days old, `npm audit` before updates. Runtime dependencies are the Electron, Angular, NgRx Signals, RxJS and tslib versions GT Toolz vetted on 2026-10-18. Twitch is reached with Node's own `fetch` and `WebSocket`: no Twitch library.

**Audit 2026-10-22**: `npm audit --omit=dev` finds nothing. `npm audit` reports 4 findings in development tools only:
- `@modelcontextprotocol/server` via `@angular/cli` 22.2.1 (the CLI's MCP server, not used here). Fixed in `@angular/cli` 22.2.3, which is still under 14 days old: update once it is old enough.
- `vite` 8.3.0–8.3.2 via `@angular/build` (the dev server, bound to localhost). Update together with the Angular tooling.

Neither ships with the app.

## Voices

Taken over from GT Toolz: only voices whose license clearly allows use; espeak-ng (GPL) inside Piper and sherpa-onnx is never shipped or loaded into the app's process, the engines run as separate programs and are downloaded from the original source.

- **Licenses (2026-10-22, the user: only voices free for open-source use):** standard licenses only: MIT, BSD, Apache, CC0 or public domain, CC BY with attribution. Unclear training data, non-commercial or research-only terms, and custom terms ("for any legal and ethical purpose") count as no. Each new voice was checked at the source: model card, repository license, training config.
- **Downloads:** every file has a fixed URL (Hugging Face pinned to a commit, GitHub release assets) and a SHA-256; a file that does not match is deleted. `test/voice-packages.test.ts` fails on an unpinned URL, a missing checksum or a target outside the voices folder. Archives are unpacked with Windows' own `tar.exe` (no `..` or absolute paths); a package can name the only files to keep (CSS10 keeps `model.onnx` and `tokens.txt`, not the conversion scripts in its archive).
- **Chat text into the engines:** Piper gets it as a JSON line on stdin, the Windows voices as one line with `|` and line breaks removed, sherpa-onnx as the last argument after a lone `--`. Without the `--`, sherpa-onnx took a message starting with `--` as an option (checked 2026-10-22 with 1.13.8: `--output-filename=…` as text was parsed as an option, so the clip failed); with it, the text is only spoken.

## Later

- Electron fuses (RunAsNode off, NodeOptions off, CLI inspect off, OnlyLoadAppFromAsar and ASAR integrity on) and code signing, with the installer.
