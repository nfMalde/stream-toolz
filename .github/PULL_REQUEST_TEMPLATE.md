## What and why

<!-- What does this change, and which issue does it fix? "Fixes #123" closes the issue on merge. -->

## How it was tested

<!-- npm test, npm run typecheck, npm run build:app; with a real Twitch login and OBS? Which Windows? -->

## Checklist

- [ ] `npm run typecheck`, `npm test` and `npm run build:app` pass.
- [ ] New or changed behaviour has a test (`packages/*/test`, `modules/*/test`, `apps/desktop/test`).
- [ ] UI texts in English and German (`ui/i18n/en.ts` and `de.ts` of the shell or the module); spoken texts in ReadMyChat's language packs.
- [ ] Docs updated where users or developers need to know (`docs/`, `docs/modules/`, `CHANGELOG.md` under "Unreleased").
- [ ] No new dependency, or it is at least 14 days old and discussed first (docs/03-security.md).
- [ ] Nothing new leaves the PC, and the logs stay free of chat messages, names, tokens and keys (docs/03-security.md).
- [ ] No secret in the repository: Client IDs, tokens and certificates live in the user profile or in CI secrets only.
