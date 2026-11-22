# Contributing to Stream Toolz

Thanks for wanting to help! Stream Toolz is a hobby project, so replies can take a few days. Bug reports, fixes,
tests, translations, docs and ideas for modules are all welcome.

## Before you start

- **Bugs:** open a [bug report](https://github.com/nfMalde/stream-toolz/issues/new?template=bug_report.yml) with the
  log (see the README, "Reporting a bug"). If you want to fix it yourself, say so in the issue.
- **Bigger changes and new modules:** open an [issue](https://github.com/nfMalde/stream-toolz/issues/new/choose) first
  and describe the idea, so we can agree on the approach before you put time into it. The list of planned modules is in
  [docs/04-modules.md](docs/04-modules.md).
- **Security issues:** never in a public issue; see [SECURITY.md](SECURITY.md).

## Setting up

Node.js 22.23.2 (the version the CI uses), npm and git, on Windows 10 or 11:

```sh
git clone https://github.com/<you>/stream-toolz.git
cd stream-toolz
npm ci
node node_modules/electron/install.js   # Electron's binary, once: install scripts are off (.npmrc)
npm run dev
```

`npm run dev` starts the Angular dev server and Electron with live reload against a **dev profile**
(`%APPDATA%\Stream Toolz-dev`), so your installed app's login and settings stay untouched. You need your own Twitch app
of type "Public" to log in (the setup assistant explains it); for the pages alone no login is needed.
How the code fits together: [docs/02-desktop-app.md](docs/02-desktop-app.md) and [docs/04-modules.md](docs/04-modules.md).

## Making a change

1. Create a branch from `main`: `fix/<what>` or `feat/<what>`.
2. Write the code in the style of the code around it: the same naming, the same density of comments. Comments say
   why, not what. Code, comments and docs are in English.
3. **UI texts** go into the English and the German file (`apps/ui/src/app/i18n` for the shell, `modules/<id>/ui/i18n`
   for a module; the types check that both have every key). **Spoken texts** of ReadMyChat go into its language packs,
   see [docs/modules/readmychat-language-packs.md](docs/modules/readmychat-language-packs.md).
4. **Tests:** new or changed behaviour gets a test (`packages/*/test`, `modules/<id>/test`, `apps/desktop/test`,
   node:test). Bugs get a test that fails without the fix. Inject every output: a test that falls back to a real voice
   or sound device hangs the suite.
5. **Check everything:**
   ```sh
   npm run typecheck
   npm test
   npm run build:app
   ```
6. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything users notice.
7. Update `docs/` where users or developers need to know (a module's page is `docs/modules/<id>.md`).

## What must stay so

Stream Toolz runs on the streamer's own PC and keeps their data there. A pull request that crosses one of these lines is
not merged, also not as an optional setting or module ([docs/03-security.md](docs/03-security.md)):

- **Nothing leaves the PC** but what the docs list: Twitch for the login and the chat, GitHub and Hugging Face for the
  voice downloads (pinned, checked against a SHA-256). No analytics, no update servers of ours, no cloud. Links to
  web pages open only on a click.
- **Every streamer uses their own Twitch app** of type "Public": only its Client ID, no secret, the login by code on
  twitch.tv. No shared app, no other login flows.
- **The login asks only for what the modules that are on need.** A new feature that needs another permission adds it
  to `packages/twitch/src/features.ts`, so the user sees why.
- **Logs stay anonymous:** no chat messages, no viewer names, no tokens or keys. Write log lines only through
  `host.log` (a module) or the app's logger; `scrub()` masks what slips through, and `apps/desktop/test/logger.test.ts`
  checks it.
- **Secrets live in the user profile only**, encrypted with the system's key store. Nothing of that kind goes into the
  repository, not even for development.
- **The windows show only the app's own page**, with a strict Content Security Policy, and the overlay pages load
  nothing from the internet.
- **A module never imports Electron** and gets everything from its host (`packages/core/src/module.ts`).

Words matter too: say what the app does and what it does not do, and do not name or judge other tools.

## Pull requests

- One topic per pull request, to `main`. Describe what changes and why, and how you tested it (with a Twitch login,
  with OBS, which Windows). "Fixes #123" closes the issue when it is merged.
- The **PR build** runs the type check, the tests and the app build on Windows and Linux. It must be green.
- A maintainer reviews it. Small changes may be asked for; that is normal and no judgement.
- The source is public, the license is proprietary for now ([LICENSE](LICENSE)): by opening a pull request you agree
  that your change may be used under it and under a later license of the project. You keep the copyright in what you
  write. A contributor license agreement, as [GT Toolz](https://github.com/nfMalde/gt-toolz) has, may follow.

## Dependencies

Stream Toolz keeps its dependencies few, because every one of them ships to every user:

- Ask in an issue before adding one. Often a few lines of our own code are the better choice.
- Versions are exact (`save-exact`), install scripts stay off (`ignore-scripts`), and a version is used only when it is
  at least **14 days** old.
- Run `npm audit` and `npm audit signatures`. Every dependency that ships with the app goes on the in-app licenses page
  (`apps/desktop/src/licenses.ts`).
- Voices only under standard open licenses with clean training data, checked at the source
  ([docs/03-security.md](docs/03-security.md) "Voices").
- No copied code without checking its license; icons are drawn by ourselves.

## Writing a module

[docs/04-modules.md](docs/04-modules.md) "Adding a module" lists the steps; the existing modules under `modules/` are
the examples, Countdown being the smallest complete one.

## Code of conduct

Be kind and constructive: to the people here, to the viewers in the chat, and to the makers of other tools. See
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
