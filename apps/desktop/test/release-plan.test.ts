import assert from 'node:assert/strict';
import { test } from 'node:test';
// The plan is an ES module (top-level await); this test folder is CommonJS, so it is loaded with import() at run time.
type Plan = {
  planVersion: (input: { current: string; version?: string; bump?: string; channel: string }) => { version: string; prerelease: boolean };
  changelogSection: (text: string, version: string) => string | undefined;
  releaseChangelog: (text: string, version: string, date: string) => string;
  downloads: (version: string, prerelease: boolean, repo?: string) => string;
};
const plan = (): Promise<Plan> => import('../../../scripts/release/plan.mjs' as string) as Promise<Plan>;

test('planVersion fits the version to the channel and the bump', async () => {
  const { planVersion } = await plan();
  assert.deepEqual(planVersion({ current: '0.0.1-alpha', channel: 'alpha' }), { version: '0.0.1-alpha', prerelease: true });
  assert.deepEqual(planVersion({ current: '0.0.1-alpha', channel: 'alpha', bump: 'pre' }), { version: '0.0.1-alpha.2', prerelease: true });
  assert.deepEqual(planVersion({ current: '0.0.1-alpha.2', channel: 'alpha', bump: 'pre' }), { version: '0.0.1-alpha.3', prerelease: true });
  assert.deepEqual(planVersion({ current: '0.0.1-alpha', channel: 'beta' }), { version: '0.0.1-beta', prerelease: true });
  assert.deepEqual(planVersion({ current: '0.0.1-alpha', channel: 'full' }), { version: '0.0.1', prerelease: false });
  assert.deepEqual(planVersion({ current: '0.0.1', channel: 'alpha', bump: 'minor' }), { version: '0.1.0-alpha', prerelease: true });
  assert.deepEqual(planVersion({ current: '0.1.0', channel: 'full', bump: 'patch' }), { version: '0.1.1', prerelease: false });
  assert.deepEqual(planVersion({ current: '0.1.0', channel: 'full', bump: 'major' }), { version: '1.0.0', prerelease: false });
  assert.deepEqual(planVersion({ current: '0.0.1-alpha', channel: 'beta', version: 'v0.2.0-beta' }), { version: '0.2.0-beta', prerelease: true });
  assert.throws(() => planVersion({ current: '0.0.1-alpha', channel: 'full', version: '0.2.0-beta' }), /no pre-release part/);
  assert.throws(() => planVersion({ current: '0.0.1-alpha', channel: 'alpha', version: '0.2.0' }), /must be <version>-alpha/);
  assert.throws(() => planVersion({ current: '0.0.1-alpha', channel: 'nightly' }), /channel must be/);
  assert.throws(() => planVersion({ current: 'x', channel: 'alpha' }), /no semver/);
});

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- A thing.

## [0.0.1-alpha] - 2026-10-28

### Fixed

- An older thing.

[0.0.1-alpha]: https://example.invalid/compare
`;

test('the changelog section of a version is found and "Unreleased" becomes the version once', async () => {
  const { changelogSection, releaseChangelog } = await plan();
  assert.equal(changelogSection(CHANGELOG, 'Unreleased'), '### Added\n\n- A thing.');
  assert.equal(changelogSection(CHANGELOG, '0.0.1-alpha'), '### Fixed\n\n- An older thing.');
  assert.equal(changelogSection(CHANGELOG, '9.9.9'), undefined);

  const released = releaseChangelog(CHANGELOG, '0.0.2-alpha', '2026-11-22');
  assert.match(released, /^## \[Unreleased\]\n\n## \[0\.0\.2-alpha\] - 2026-11-22\n\n### Added/m);
  assert.equal(changelogSection(released, 'Unreleased'), '');
  assert.equal(changelogSection(released, '0.0.2-alpha'), '### Added\n\n- A thing.');
  // Already released: nothing changes (the plan runs again after a failed try).
  assert.equal(releaseChangelog(released, '0.0.2-alpha', '2026-11-23'), released);
  assert.throws(() => releaseChangelog(released, '0.0.3-alpha', '2026-11-23'), /nothing under "Unreleased"/);
});

test('the release notes name the Windows installer and how to check it', async () => {
  const { downloads } = await plan();
  const text = downloads('0.0.2-alpha', true, 'nfMalde/stream-toolz');
  assert.match(text, /Stream-Toolz-Setup-0\.0\.2-alpha-x64\.exe/);
  assert.match(text, /gh attestation verify <file> --repo nfMalde\/stream-toolz/);
  assert.match(text, /Pre-release/);
  assert.doesNotMatch(downloads('0.1.0', false), /Pre-release/);
});
