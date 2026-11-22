// Step 3: the Windows installer (Windows 10 and 11, x64): Stream-Toolz-Setup-<version>-x64.exe, per user, no admin.
// Runs on Windows. Signed through the setup in builder.mjs; --unsigned allows a test build without it.
// Usage: node scripts/release/3-installer-windows.mjs [--unsigned]

import { buildInstaller } from './builder.mjs';
import { heading, requireHost, runIfMain } from './lib.mjs';

export default async function installerWindows(args = {}) {
  heading('Create installer: Windows');
  requireHost('windows', 'the Windows installer is built on Windows');
  await buildInstaller({ unsigned: args.unsigned === true });
}

await runIfMain(import.meta.url, installerWindows);
