# Changelog

All notable changes to Stream Toolz. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the versions follow [Semantic Versioning](https://semver.org/). Each release on GitHub shows its section of this file
(`scripts/release/plan.mjs` moves "Unreleased" to the version at release time).

## [Unreleased]

The first release, 0.1.0-beta: Stream Toolz leaves the alpha (2026-11-22).

### Added

- **Modules.** Stream Toolz is a shell with modules, each switched on or off on the Modules page. ReadMyChat is the
  first; new since 2026-10-30, all off by default: **Countdown** (type "in 15 Minuten" or "bis 20:30", shown as an OBS
  overlay or through text files so OBS controls the font; a text at zero and a time after which a finished countdown
  disappears, both optional), **Chat Overlay** (the chat as a browser source, styled in the app), **Alerts** (follows,
  subs, gifted subs and raids as an overlay with your own sounds), **Channel Points** (a sound per redeemed reward) and
  **Chat Bot** (commands like `!discord` and timed messages, answered as your own account).
- **Language packs** for ReadMyChat: German and English are built in; a new chat language is one JSON file in the
  profile folder plus a voice for it.
- **Release scripts and installer** with Electron's fuses and code signing (when a certificate is set up).

### Changed

- **License:** GPL-3.0-only, as GT Toolz (2026-11-22); contributions under the CLA.
- Renamed from ReadMyChat to Stream Toolz by Maldö (2026-10-28); the data folder moves over once.
- The login asks only for the permissions of the modules that are on. New permissions: channel points redemptions
  (Channel Points) and writing chat messages (Chat Bot, the only module that writes).

### Removed

- The sherpa-onnx voices (Kokoro, CSS10 German) left the voice catalogue; Piper and the Windows voices stay.

### Fixed

- Everything from the release check of 2026-10-28 and the findings taken over from GT Toolz on 2026-10-30
  (docs/05-release-check.md).
