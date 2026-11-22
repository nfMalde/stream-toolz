# Third-party notices

Stream Toolz is built on the open-source components and optional downloads listed here. The app shows the same list
with the **full license texts** under About. The texts of bundled packages are collected from their own license files
at build time (`apps/desktop/scripts/build.mjs`); the list itself lives in `apps/desktop/src/licenses.ts`. Keep this
file in sync with that list.

## 1. Included in the app

| Component | Version | Used for | License | Notice |
|---|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 43.8.4 | app framework (contains Chromium and Node.js) | MIT | Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc. Chromium's and Node.js' licenses are in `LICENSES.chromium.html` next to the app's executable (linked on the app's About page). |
| FFmpeg (part of Electron) | as in Electron 43.8.4 | media library of Chromium | LGPL-2.1-or-later | Ships as a separate, unmodified library (`ffmpeg.dll`) that can be replaced. Source: Chromium's `third_party/ffmpeg` for this Electron version. The license is in `LICENSES.chromium.html`. |
| [Angular](https://github.com/angular/angular) (`core`, `common`, `platform-browser`, `router`) | 22.2.1 | user interface | MIT | Copyright (c) 2010-2026 Google LLC. |
| [NgRx Signals](https://github.com/ngrx/platform) | 22.0.1 | UI state | MIT | Copyright (c) 2017-2023 Brandon Roberts, Mike Ryan, Victor Savkin, Rob Wormald. |
| [RxJS](https://github.com/ReactiveX/rxjs) | 7.8.2 | used by Angular | Apache-2.0 | Copyright (c) 2015-2018 Google, Inc., Netflix, Inc., Microsoft Corp. and contributors. |
| [tslib](https://github.com/microsoft/tslib) | 2.8.1 | TypeScript runtime helpers | 0BSD | Copyright (c) Microsoft Corporation. |

Nothing else ships with the app: the main process and the UI are bundled from this repository's own code, and the
installed app has no `node_modules`. Build tools (TypeScript, esbuild, the Angular CLI, electron-builder, tsx) do not
ship; their licenses are in the lockfile's packages.

## 2. Optional downloads (voices)

Nothing below is part of the installer. The app downloads a package only when the user clicks Install under Voice,
from the original source, pinned to a fixed file and checked against its SHA-256 (`packages/speech/voice-packages.json`).
The engines run as separate programs; nothing of them is linked into the app.

| Component | Used for | License | Notice |
|---|---|---|---|
| [Piper](https://github.com/rhasspy/piper) 2023.11.14-2 | speech engine | MIT | Copyright (c) 2022 Michael Hansen. |
| [onnxruntime](https://github.com/microsoft/onnxruntime) (part of the Piper download) | runs the voice models | MIT | Copyright (c) Microsoft Corporation. |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) (part of the Piper download) | phonemes for Piper | GPL-3.0-or-later | Downloaded from the original source and run as a separate program, never inside the app's process. |
| [piper-phonemize](https://github.com/rhasspy/piper-phonemize) (part of the Piper download) | phonemes for Piper | MIT | Copyright (c) 2023 Michael Hansen. |
| [libtashkeel model](https://github.com/mush42/libtashkeel) (part of the Piper download) | Arabic diacritics for piper-phonemize | MIT | Copyright (c) 2023 Musharraf. |
| [Piper voices](https://huggingface.co/rhasspy/piper-voices) `de_DE-ramona-low`, `de_DE-eva_k-x_low` | German voices | M-AILABS (BSD-style) | Copyright (c) 2017-2019 by the original creators @ M-AILABS; trained on the M-AILABS dataset, whose notice is kept as required. |
| [Piper voice](https://huggingface.co/rhasspy/piper-voices) `de_DE-mls-medium` (Jan) | German voice | CC BY 4.0 | Trained on [Multilingual LibriSpeech](https://www.openslr.org/94/) (OpenSLR 94). |
| [Piper voices](https://huggingface.co/rhasspy/piper-voices) `en_GB-cori-high`, `en_US-ljspeech-high`, `en_US-kristin-medium`, `en_US-norman-medium`, `en_US-john-medium` | English voices | MIT | Trained from scratch on public-domain recordings (LibriVox, LJ Speech); the repository states MIT as its license. |

The Windows voices (OneCore and SAPI) are part of Windows and are neither downloaded nor shipped.

## 3. Other

- The logo and the colours are Maldö's own stream assets (`apps/ui/public/maldoe-*.png`).
- The icons are drawn for this project.
- The sherpa-onnx engine and its models (Kokoro, CSS10 German) are no longer offered (docs/05-release-check.md); the
  engine code stays in `packages/speech/src/sherpa.ts` without a download.
