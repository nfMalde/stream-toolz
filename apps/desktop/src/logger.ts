// A technical log per day (logs/2026-10-22.log) for finding problems. Chat messages, names and tokens are
// never written: only what happened ("reading chat of …", "connection closed") and errors with their stack
// (mapped to the TypeScript files, see stack-map.ts). Anything that looks like a credential is masked.

import fs from 'node:fs';
import path from 'node:path';

/** Days of logs kept. */
const KEEP_DAYS = 14;

export type Log = (line: string) => void;

export function createLogger(dir: string, echo: boolean): Log {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const old = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f))
      .sort()
      .reverse()
      .slice(KEEP_DAYS);
    for (const file of old) fs.rmSync(path.join(dir, file), { force: true });
  } catch {
    // No log folder: logging goes to the console only.
  }
  return (line) => {
    const now = new Date();
    const stamp = now.toISOString();
    // Stack traces: further lines indented under the first.
    const text = scrub(line).replace(/\r?\n/g, '\n                         ');
    if (echo) console.log(`[${stamp.slice(11, 19)}] ${text}`);
    try {
      fs.appendFileSync(path.join(dir, `${stamp.slice(0, 10)}.log`), `${stamp} ${text}\n`);
    } catch {
      // A full disk must not stop the app.
    }
  };
}

/**
 * Masks what must never be in a log, should an error message carry it: OAuth tokens in headers, token,
 * code and secret parameters, and the OBS key in an address.
 */
export function scrub(text: string): string {
  return text
    .replace(/\b(Bearer|OAuth)\s+[\w.~+/-]+=*/gi, '$1 ***')
    .replace(/\b(access_token|refresh_token|client_secret|device_code|code|token|state)=[^&\s"']+/gi, '$1=***')
    .replace(/("(?:access_token|refresh_token|client_secret|clientSecret|accessToken|refreshToken|device_code|deviceCode)"\s*:\s*")[^"]*"/gi, '$1***"')
    .replace(/\/obs\/[\w-]{8,}/g, '/obs/***');
}

/** An error (or anything thrown) as text: its stack if it has one. */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}
