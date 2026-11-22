# Release check

The three checks from [02-desktop-app.md](02-desktop-app.md) "Before a release", run before the first release. Each run gets a dated section; the newest is first.

## 2026-10-30, findings taken over from GT Toolz

GT Toolz went through the same check and its alphas 0.0.3 to 0.0.5 after 2026-10-28; its developer listed what applies here. Fixed the same day:

| Where | Finding | Fix |
| --- | --- | --- |
| `speech.ts` | **Seen on the user's PC (GT Toolz 0.0.5):** a scanner held a fresh part file ("EPERM"); the read failed, or an error from the `rm` in `finally` replaced the clip already read, so the message was not read aloud. | The read is tried again on EPERM, EBUSY and EACCES (6 tries, a growing wait); the part file is removed with retries and never at the clip's cost. |
| `atomic-file.ts` | Saving `config.json` or `secrets.bin` failed while a scanner held the file (the rename ran once). | The rename is tried again for a moment on EPERM, EBUSY and EACCES. |
| `voice-packages.ts` | Redirects were followed to any host; a download that stopped sending data waited until the user cancelled; the `.part` file was removed while the stream still held it (leftovers on Windows); a package was deleted in place (a held file left it half gone and still counted as installed); a catalogue file without a target would have deleted the whole voices folder. | `allowedDownloadUrl` (https, GitHub and Hugging Face hosts, at most 5 hops); 60 s idle timeout; the stream's `close` is awaited first and leftovers are cleared at the next run; a package is renamed out of the way first, then deleted; every catalogue path must lie inside the voices folder (`insideDir`), an archive is staged and moved into place in one rename. |
| `audio.ts` | The hidden player window was started again at once after every crash: a loop. | After 3 crashes within a minute it restarts only after 10 s. |
| `main.ts` | Quitting waited without a limit for the local server, holding the single-instance lock. | At most 3 s. |
| `ipc.ts`, `api.ts` | `info()` sent the data folder's path (with the Windows user name) to the page, which never read it. | Removed from the contract. |
| `security.ts` | Chromium could still resolve host names (prefetching and the like), although the windows show only `app://stz`. | `host-resolver-rules` maps every host to NOTFOUND except `localhost` (the dev server), as in GT Toolz. Twitch, downloads and the local server run in Node and are not affected. **To confirm in the live test:** the login, the OBS source and the device list. |
| `package.json` | A test that fell back to a real output could hang `npm test` (seen in GT Toolz). | `--test-timeout=60000`. |

Also taken over: Kokoro stays out for its training data, not only for the ANSI code page ([03-security.md](03-security.md) "Voices"); a Kokoro folder from the trial is removed at start. The README, the package description and the texts named Kokoro and CSS10 still; corrected. Checked and fine here: the dialogs (setup assistant, the streamer-mode question) scroll their content inside the dialog, so the backdrop never covers the window's scrollbar; no class extending `EventEmitter` has a member called `listeners`. Noted for later, not done: Piper's own macOS build is broken (GT Toolz runs Piper voices through sherpa-onnx there), Gatekeeper and an unsigned download on the Mac, building a deb through WSL, an own voice model from a file ([06-release.md](06-release.md) "Later").

## 2026-10-28, before 0.0.1

### Security scan

**Packages** (`npm audit`): 7 advisories, 1 in what ships (Electron 43.7.7: Chromium's mitigation for compromised eMudhra intermediate certificates, fixed in 43.8.1+), 6 in build tools only (`@angular/cli` 22.2.1 pulls `@modelcontextprotocol/server` and `zod`; `@angular/build` pulls `vite` and `fast-uri`; none of them runs in the app). The app's runtime dependencies are the workspace packages only. The fixed versions (Electron 43.8.1 from 2026-10-20, `@angular/cli` 22.2.3 from 2026-10-15, `@angular/build` 22.2.5 from 2026-10-28) were younger than the 14 days the dependency rule asks for; the user overrode the rule for this run (2026-10-28), and Electron 43.8.4, `@angular/cli` and `@angular/build` 22.2.5 went in: `npm audit` reports 0. `electron-builder` 26.17.0 was added for the installer (build-only, the version GT Toolz vetted).

**Secrets in the repository**: none. A search over all tracked files for Client IDs, tokens, keys and passwords found only SHA-256 sums and Git revisions in `voice-packages.json`. `secrets.bin`, `config.json` and logs live in the profile folder; `.gitignore` lists `secrets.bin`.

**Code**, four read-only reviews (Electron shell and IPC; local server and OBS source; Twitch login, secrets and logs; speech engines and downloads). Fixed the same day:

| Where | Finding | Fix |
| --- | --- | --- |
| `windows-voice.ts` | The voice id was put into the PowerShell script with `String.replace`, which expands `$'` and `` $` ``: a crafted id (from a hand-edited config or a compromised renderer) became code in `powershell.exe`. | Replacer functions, control characters removed; `openSpeech` names only voices Windows listed. |
| `connection.ts` | A token refresh in flight finished after Logout and stored the fresh tokens again; two refreshes side by side (hourly check next to a reconnect) used the one-time refresh token twice and logged the streamer out; any 4xx on refresh (also 429) counted as "login gone". | One refresh at a time; nothing stored once the tokens are gone (the fresh token is revoked); only 400/401 mean the login is gone; `connect()` clears the previous hourly check; a pending login ends on logout or a different app. |
| `ipc.ts`, `obs.ts` | "New address" rotated the key but left connected sources on the old address, and the newest of them kept receiving every clip. | The sources are dropped; they reconnect, fail under the old key and are gone. |
| `obs.ts` | The OBS page could be embedded by a web page (no `frame-ancestors`); connected sources were unbounded; a broken WAV header could make a clip wait for hours. | `frame-ancestors 'none'`; at most 8 sources; the wait is bounded to 10 minutes. |
| `local-server.ts` | Two quick port changes could leave a server bound on the old port. | `listen()`/`close()` run one after another. |
| `eventsub.ts` | A reconnect request was followed to any `wss://` host; frames of any size were parsed; non-string fields reached the handlers. | Only Twitch's EventSub hosts; frames above 256 KiB dropped; fields checked. |
| `message.ts` | Fragments, badges and names from Twitch were unbounded; bits could be negative. | Capped. |
| `secrets.ts`, `config.ts` | Files were written over a fixed temporary name (a planted link would be followed), with the default mode and without flushing. | `atomic-file.ts`: fresh exclusive temporary name, mode 0600, fsync, rename. |
| `text.ts`, `reader.ts`, `ipc.ts`, `config.ts` | Chat words like `constructor` hit `Object.prototype` in nicknames and pronunciations (read aloud as "function Object…"); UI-supplied ids indexed plain objects; a `__proto__` key in config.json set a prototype. | Own-property lookups; module ids checked. |
| `security.ts` | A malformed `%` sequence in an `app://` path threw; a device name (`CON`) passed the file check. | 400 on bad encoding; only plain files are served. |
| `logger.ts` | `scrub()` had no pattern for a bare token. | Any 30+ lower-case alphanumerics are masked. |
| `piper.ts`, `sherpa.ts`, `main.ts` | **Verified bug:** both engines read paths in the Windows ANSI code page; with a profile like `C:\Users\Jörg` Piper crashed on every message and sherpa found no model, with no fallback. | The app hands the engines the folders' 8.3 short names (`ascii-path.ts`, tested with "Jörg Ł"). |
| `voice-packages.ts` | A write error during a download (disk full) hung the installer for good; downloads had no size bound; a failed unpack left files behind. | `once(out, 'drain')` rejects on error; more bytes than the catalogue says abort; cleanup on failure. |
| `speech.ts`, `piper.ts`, `sherpa.ts` | A hung engine blocked the queue forever; part files of different voices shared names; a text cut inside a surrogate pair crashed Piper's JSON parser. | 60 s per render, then the engine is closed (Piper killed); unique part names; lone surrogates removed. |
| `voice-packages.test.ts` | The catalogue test let `a\..\b` through as a target. | Targets are resolved and must stay below the voices folder. |

Checked and clean: `app://` path traversal, IPC from other frames, `shell.openExternal`/`openPath` targets, window `webPreferences`, navigation and `window.open`, the content security policies, the permission handler, tokens reaching the renderer or the logs, the loopback-only server with Host check and constant-time key comparison, TLS defaults, the hosts the app talks to, the scopes requested versus used, the device-code flow.

Known and accepted: a leaked OBS key lets a local page become the "newest source" and mute the stream until the streamer presses "New address"; a process squatting the port before the app starts sees the key (press "New address" after changing the port); in dev the voices live in the repository's `.cache`, which other accounts on the machine can write. (A running engine holding files while its package is removed was accepted here and fixed on 2026-10-30, see above.)

**Verified and decided:** sherpa-onnx (Kokoro, CSS10 German) gets the chat text as an argument, which Windows converts to the ANSI code page: on a German Windows umlauts survive, elsewhere they are dropped ("ber Kln"), Cyrillic becomes "???", and a fullwidth quote (U+FF02) splits the argument so the clip fails. A fix needs another channel into sherpa-onnx (its C API or a UTF-8 argument re-encoding per code page). The user decided (2026-10-28) to take the sherpa packages out of the catalogue for the first release; the engine code stays for a later return. A stored sherpa voice id now counts as "not allowed" and the reader falls back to the language's default voice.

Electron fuses and code signing are part of the installer since this run ([06-release.md](06-release.md)); the signature itself needs a certificate or an Azure Trusted Signing account, which the project does not have yet. Until then a build is only possible with `--unsigned`.

### Test coverage

`node --test --experimental-test-coverage`: about 86 % of the lines of everything the tests load, 100 tests. Added for this check: the local server with the OBS source end to end, the logger and `scrub()`, atomic file writes, WAV handling, speech splitting and the `Speech` queue, voice choice, the EventSub reconnect address, the ASCII path for the engines. Not covered: the Electron-only files (`main.ts`, `security.ts`, `ipc.ts`, `modules.ts`, `hotkeys.ts`, `audio.ts`, `secrets.ts`, the preloads), `connection.ts` beyond the login tests, and the Angular UI; those are checked by running the app with a test profile and the screenshot steps (02-desktop-app.md).

### Licenses

Everything that ships or is downloaded is on the About page with its license text: Electron (MIT; Chromium's notices; FFmpeg LGPL-2.1), Angular, NgRx Signals, RxJS, tslib; Piper (MIT) with espeak-ng (GPL-3.0, a separate program, downloaded on demand), onnxruntime, piper-phonemize and the libtashkeel model (MIT), the Piper voices (MIT, M-AILABS BSD-style, CC BY 4.0 with attribution). The sherpa-onnx, Kokoro and CSS10 entries left with their packages. All 340 installed npm packages (after the updates and electron-builder; 262 of them build-only) are MIT, ISC, BSD, Apache-2.0, 0BSD, BlueOak-1.0.0 or Python-2.0; the workspace packages are UNLICENSED (proprietary, see LICENSE).
