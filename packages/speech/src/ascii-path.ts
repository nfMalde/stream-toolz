// Piper and sherpa-onnx read their command line and file names in the Windows ANSI code page: a path with
// a character outside it ("C:\Users\Jörg") never reaches them intact, and they crash or find no model. The
// 8.3 short name of such a folder ("C:\Users\JRG~1") is ASCII and names the same folder.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const cache = new Map<string, string>();

/**
 * The folder as a path the engines can read: itself when it is ASCII (or not on Windows), else its short
 * name. The folder is created first (a short name needs an existing folder). Stays as it is when the volume
 * has short names switched off; the engines then fail for a non-ASCII profile, which the log shows.
 */
export function asciiPath(dir: string, log?: (line: string) => void): string {
  const absolute = path.resolve(dir);
  if (process.platform !== 'win32' || isAscii(absolute)) return absolute;
  const known = cache.get(absolute);
  if (known) return known;
  fs.mkdirSync(absolute, { recursive: true });
  let short = absolute;
  try {
    short = shortPath(absolute);
    if (!isAscii(short) || !fs.existsSync(short)) throw new Error(`no ASCII short name (${short})`);
  } catch (err) {
    log?.(`SPEECH    ${absolute}: ${(err as Error).message}; voices may not work in this folder`);
    short = absolute;
  }
  cache.set(absolute, short);
  return short;
}

function isAscii(text: string): boolean {
  return !/[^\x20-\x7e]/.test(text);
}

/**
 * Windows' short name through the file system object. The path travels in an environment variable (Unicode,
 * like the script itself), never inside the script text.
 */
function shortPath(dir: string): string {
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:STZ_SHORT_PATH_OF).ShortPath';
  const out = execFileSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: { ...process.env, STZ_SHORT_PATH_OF: dir },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  return out.trim();
}
