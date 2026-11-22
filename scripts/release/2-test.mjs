// Step 2: tests. The type check of the whole project, the test suite (Node's own test runner) and the supply-chain
// checks: registry signatures must verify; known vulnerabilities are listed, a critical or high one in what ships
// stops the release (docs/03-security.md, docs/05-release-check.md).
// Usage: node scripts/release/2-test.mjs

import { fail, heading, info, run, runIfMain } from './lib.mjs';

export default async function test() {
  heading('Tests: type check');
  await run('npm', ['run', 'typecheck']);

  heading('Tests: test suite');
  await run('npm', ['test']);

  heading('Tests: packages');
  await run('npm', ['audit', 'signatures']);
  const { stdout } = await run('npm', ['audit', '--json'], { capture: true, allowFail: true });
  const audit = JSON.parse(stdout);
  const counts = audit.metadata?.vulnerabilities ?? {};
  for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) info(`${v.severity.padEnd(8)} ${name} ${v.range}${v.isDirect ? ' (direct)' : ''}`);
  info(`npm audit: ${counts.total ?? 0} known (${['critical', 'high', 'moderate', 'low'].map((s) => `${counts[s] ?? 0} ${s}`).join(', ')})`);
  if (counts.critical) fail('a critical vulnerability: no release until it is fixed');
  // Electron is the only package that ships; a high advisory there is a release blocker.
  if (audit.vulnerabilities?.electron) fail('an advisory against Electron: no release until it is updated (docs/05-release-check.md)');
}

await runIfMain(import.meta.url, test);
