# Security

## Reporting a vulnerability

Please **do not** report security issues in public issues. Use GitHub's private reporting instead:
**[Report a vulnerability](https://github.com/nfMalde/stream-toolz/security/advisories/new)**.

Describe what you found, how to reproduce it, which version and system, and what an attacker could do with it. Stream
Toolz is a hobby project, so it can take a few days to answer; you will get a reply, and the fix is credited to you if
you want.

## Supported versions

Stream Toolz is free software under the GPL-3.0 ([LICENSE](LICENSE)).

Only the newest release (and the newest pre-release) gets security fixes.

## What Stream Toolz is built to do

- Everything runs on the streamer's own PC. The only servers it talks to are Twitch (login, chat, events) and, on a
  click under Voice, GitHub and Hugging Face for voice downloads that are pinned and checked against a SHA-256.
- The windows show only the app's own page, with a strict Content Security Policy and no remote content; the main
  process alone talks to Twitch.
- The login uses the streamer's own Twitch app of type "Public": no client secret exists. Tokens and the OBS key are
  stored encrypted with the system's key store (Windows: DPAPI) in the user profile.
- The local server listens on the loopback interface only, checks the Host header, and needs a random key in every
  browser-source address; another web page cannot read the streams.
- The installed app runs with Electron's fuses set (no `--inspect`, no `NODE_OPTIONS`, only the integrity-checked
  `app.asar`), and release installers carry build provenance.
- Logs hold no chat messages, viewer names, tokens or keys.

The details, the known limits and the release checks are in [docs/03-security.md](docs/03-security.md) and
[docs/05-release-check.md](docs/05-release-check.md).
