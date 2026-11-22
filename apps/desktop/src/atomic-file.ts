// Settings and secrets are written whole or not at all.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Windows: a virus scanner or the search indexer may hold the file for a moment. */
const RENAME_ATTEMPTS = 5;
const RENAME_WAIT_MS = 50;

/**
 * Writes to a new temporary file next to the target (a fresh name, created exclusively: a planted link at a
 * known name is never followed; readable by the user only where modes apply), flushes it to disk and renames
 * it over the file. A crash leaves the old file; a failure leaves no temporary file behind.
 */
export function writeFileAtomically(file: string, data: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

/** The rename again after a short wait while another program holds the target (seen on Windows in GT Toolz). */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_ATTEMPTS || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}
