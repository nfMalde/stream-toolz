// The whole release in one go (docs/06-release.md): build, test, the Windows installer. Each step is its own file
// and also runs alone.
//
//   node scripts/release/release.mjs                      all steps
//   node scripts/release/release.mjs --steps=build,test   only these
//   node scripts/release/release.mjs --skip=test          all but these
//   node scripts/release/release.mjs --unsigned           a test build without code signing
//
// Output: release/<version>/ (the installer, SHA256SUMS.txt).

import build from './1-build.mjs';
import test from './2-test.mjs';
import installerWindows from './3-installer-windows.mjs';
import { HOST, OUT, PRODUCT_NAME, SkipStep, StepError, VERSION, markFailed, parseArgs } from './lib.mjs';

const STEPS = [
  { id: 'build', name: 'Build (Prod)', run: build },
  { id: 'test', name: 'Tests', run: test },
  { id: 'windows', name: 'Create installer: Windows', run: installerWindows },
];

const args = parseArgs(process.argv.slice(2));
const only = typeof args.steps === 'string' ? args.steps.split(',') : undefined;
const skip = typeof args.skip === 'string' ? args.skip.split(',') : [];
for (const id of [...(only ?? []), ...skip]) {
  if (!STEPS.some((s) => s.id === id)) {
    console.error(`Unknown step "${id}". Steps: ${STEPS.map((s) => s.id).join(', ')}`);
    process.exit(2);
  }
}

console.log(`${PRODUCT_NAME} ${VERSION} release on ${HOST}`);
const results = [];
for (const step of STEPS) {
  if ((only && !only.includes(step.id)) || skip.includes(step.id)) {
    results.push({ step, state: 'left out' });
    continue;
  }
  const started = Date.now();
  try {
    await step.run(args);
    results.push({ step, state: 'done', seconds: (Date.now() - started) / 1000 });
  } catch (err) {
    if (err instanceof SkipStep) {
      results.push({ step, state: `skipped (${err.message})` });
      continue;
    }
    console.error(`\n✗ ${err instanceof StepError ? err.message : err.stack}`);
    results.push({ step, state: 'FAILED', seconds: (Date.now() - started) / 1000 });
    break;
  }
}

console.log('\nSummary');
for (const step of STEPS) {
  const r = results.find((x) => x.step === step);
  const mark = !r ? '·' : r.state === 'done' ? '✓' : r.state === 'FAILED' ? '✗' : '–';
  console.log(`  ${mark} ${step.name.padEnd(28)} ${r ? r.state : 'not run'}${r?.seconds ? ` (${Math.round(r.seconds)} s)` : ''}`);
}
if (results.some((r) => r.state === 'FAILED')) markFailed();
else console.log(`\nInstaller in ${OUT}`);
