# Release

How an installer is made. Windows first (the app's platform today); the scripts are laid out so a Linux or macOS step can be added later, as in GT Toolz.

```
npm run release                      # build, tests, the Windows installer (signed)
npm run release -- --unsigned        # a test build without code signing
npm run release -- --steps=build     # one step; also: node scripts/release/1-build.mjs
```

Output: `release/<version>/Stream-Toolz-Setup-<version>-x64.exe` and `SHA256SUMS.txt`. The `release/` folder is ignored by git.

## Steps (`scripts/release/`)

1. **Build** (`1-build.mjs`): the UI (Angular, production) and the main process (esbuild), then the stage in `release/stage`: `app/` holds a small `package.json` and `dist/` (the bundled main process, its source map, the preloads, `licenses.json`); `ui/` the built UI. The app has no `node_modules`: everything it needs is bundled. Every workspace must carry the root's version.
2. **Tests** (`2-test.mjs`): the type check, `npm test`, `npm audit signatures` and `npm audit`. A critical advisory, or any advisory against Electron (the one package that ships), stops the release.
3. **Windows installer** (`3-installer-windows.mjs`, `builder.mjs`): electron-builder 26.17.0 makes a per-user NSIS installer (no admin rights; `%LOCALAPPDATA%\Programs\Stream Toolz`, Start menu and desktop shortcut). Settings, login and voices in `%APPDATA%\Stream Toolz` stay after an uninstall. Electron is downloaded by electron-builder and checked against the `checksums.json` of the npm package.

## What the installed app is made of

- `resources/app.asar`: the staged app. Electron's fuses are set on the executable: `RunAsNode` off (the binary never runs as plain Node), `NODE_OPTIONS` off, `--inspect` off, `OnlyLoadAppFromAsar` on and the ASAR integrity check on (a changed `app.asar` does not start). See [03-security.md](03-security.md).
- `resources/ui`: the UI, served by the main process under `app://stz/`.
- The voices are not part of the installer; the app downloads them on request ([03-security.md](03-security.md) "Voices").

## Code signing

Without a signature Windows SmartScreen warns on the first start ("unknown publisher"); with an OV certificate the warning goes away once the certificate has gained reputation, with an EV certificate or Azure Trusted Signing at once. The release step refuses to build without a signing setup unless `--unsigned` is given. Two setups, both read from the environment of the shell that runs the release, never from a file in the repository:

| Setup | Environment |
| --- | --- |
| A certificate file (`.pfx`) | `CSC_LINK` (path or base64 content), `CSC_KEY_PASSWORD` |
| Azure Trusted Signing | `STZ_SIGN_AZURE_ENDPOINT`, `STZ_SIGN_AZURE_ACCOUNT`, `STZ_SIGN_AZURE_PROFILE`, and the Azure login `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |

The certificate and its password are secrets like the Twitch login: they live outside the repository ([03-security.md](03-security.md)).

## Before a release

The three checks in [02-desktop-app.md](02-desktop-app.md) "Before a release", recorded in [05-release-check.md](05-release-check.md). Then: the changes users notice stand under `## [Unreleased]` in `CHANGELOG.md`; the release workflow (below) sets the version in every `package.json` and the lockfile and moves "Unreleased" to the version. For a local build: `node scripts/release/plan.mjs --channel=beta --bump=pre --apply`, then `npm run release`, install the result on a clean Windows user, and run through the setup assistant once.

## Versions and changelog

- **The version** is set in the root `package.json` (now `0.1.0-beta`: the first release leaves the alpha, the user, 2026-11-22); every workspace's `package.json` carries the same version, and step 1 refuses a mismatch. The app shows `app.getVersion()` from the staged `package.json`.
- Versions follow semver; a pre-release has a suffix (`0.1.0-beta`, `0.1.0-beta.2`); `alpha` stays available as a channel.
- **Changelog:** `CHANGELOG.md` (Keep a Changelog). Each release on GitHub shows its section.
- **The release plan** (`scripts/release/plan.mjs`, from GT Toolz without its news files) works out the next version and, with `--apply`, prepares the tree for it: the version in every `package.json` and the lockfile, `CHANGELOG.md`'s "Unreleased" section as the version's (with the date). It writes the version's changelog section plus the download notes to `release/notes.md`.

  ```bash
  node scripts/release/plan.mjs --channel=beta --bump=pre           # 0.1.0-beta → 0.1.0-beta.2 (only shows the plan)
  node scripts/release/plan.mjs --channel=full                      # 0.1.0-beta → 0.1.0
  node scripts/release/plan.mjs --channel=beta --version=0.2.0-beta --apply
  ```

  Channels: `alpha` and `beta` (pre-releases, `<version>-alpha[.n]`, `<version>-beta[.n]`) and `full`. Bumps: `none`, `pre`, `patch`, `minor`, `major`; an explicit `--version` wins. Tested in `apps/desktop/test/release-plan.test.ts`.

## CI

GitHub Actions workflows in `.github/workflows`, taken from GT Toolz on 2026-11-22 without its Discord announcement and its update signature (Stream Toolz has no update check); `cla.yml` came with the GPL-3.0 license the same day. All use Node 22.23.2 and `npm ci` (`.npmrc`: no install scripts, exact versions from the lockfile), run with read-only permissions unless a job needs more, and pin every action to an exact version at least 14 days old when pinned (Dependabot proposes newer ones with a 14-day cooldown, `.github/dependabot.yml`; npm packages are updated by hand).

| Workflow | When | What |
| --- | --- | --- |
| `pr.yml` | every pull request to `main` | On Windows and Linux: `npm ci`, `npm audit signatures`, `npm run typecheck`, `npm test`, `npm run build:app`. Must be green before a merge. macOS comes with its installer ("Later"). |
| `build.yml` | every push to `main` (and by hand) | The same checks. No installers and no uploads: installers are made only by the release, after the approval. |
| `release.yml` | by hand only (Actions → Release → Run workflow) | A release, below. |
| `cla.yml` | pull requests and their comments | The CLA bot: every contributor signs `CLA.md` once with a comment on their pull request; signatures are kept on the branch `cla-signatures`. It runs on `pull_request_target` without checking out the pull request's code. |

**`release.yml`**, with the inputs `channel` (`alpha`, `beta`, `full`), `bump` (`none`, `pre`, `patch`, `minor`, `major`) and `version` (an exact version instead of the bump). Two approvals: before the first nothing is built or uploaded (only the plan, the checks and a preview); before the second nothing is published.

1. **plan** (only on `main`): stops unless both environments, `approval` and `release`, have required reviewers. Then `plan.mjs --apply` with the inputs; the tag `v<version>` must be new; `npm audit signatures`, the type check and the tests. When the plan changed files, a release commit goes to the branch `release/v<version>`. A preview (version, commit, notes) goes into the run's summary.
2. **approve:** the first approval (environment `approval`). Read the preview, then approve or reject.
3. **build:** the Windows installer from exactly the planned commit with `scripts/release/release.mjs` (build, tests, audit, the installer with the fuses). Signed when the repository secrets `CSC_LINK`/`CSC_KEY_PASSWORD` or `STZ_SIGN_AZURE_*` with the Azure login are set, else `--unsigned` and the summary says so. The installer and its `SHA256SUMS.txt` go to the next jobs as an artifact kept for one day.
4. **attest:** build provenance for the installer (`actions/attest-build-provenance`), in a job that runs no npm code. Anyone can check a download with `gh attestation verify <file> --repo <owner>/<repo>`.
5. **publish:** the second approval (environment `release`). The installer is checked against the build's checksums and its provenance, a `SHA256SUMS.txt` is written, and the release `v<version>` is created as a draft with every file and then published at once (a published release cannot change). When the release commit is not on `main`, the summary gives the `gh pr create` line for the pull request from `release/v<version>`.

**Repository settings this relies on:** the environments `approval` and `release`, both with required reviewers and the deployment branch `main`; immutable releases; rulesets for `main` (changes by pull request only, the PR build required) and for tags `v*` (created by the workflow only). The issue templates and `config.yml` name the repository as `nfMalde/stream-toolz`: adjust once the repository exists under another name.

## Later: Linux and macOS

What GT Toolz learned on its Mac and Linux builds, for when those platforms come:

- **Piper's own Mac build is broken** (rhasspy/piper#404). GT Toolz runs Piper voices through sherpa-onnx on the Mac (`piper-for-sherpa.ts` writes `tokens.txt` and the ONNX metadata); the ANSI code page problem does not exist there, and sherpa-onnx clips need a peak normalisation next to Piper's.
- **An unsigned `.command` that was downloaded** gets "is damaged and can't be opened" from Gatekeeper on a double click. GT Toolz: the first start goes through Terminal, and the script removes `com.apple.quarantine` from its own folder; the start script fetches Electron's darwin zip and checks it against the SHA-256 from `node_modules/electron/checksums.json` (`scripts/release/7-mac-package.mjs` there).
- **Building the deb on Windows through WSL:** `wsl.exe` expands `$PATH` in inline commands; pipe the script in instead (`wsl -d Ubuntu -- bash -s < script.sh`).
- **Own voice model from a file** (planned in GT Toolz): the user picks a Piper model (`.onnx` and `.onnx.json`) in the app, the app checks and copies it into the voices folder and shows it as "own model", with the user responsible for the rights. No free URL field, so downloads stay pinned with a SHA-256.
