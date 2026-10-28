// The UI ships minified (Angular production build) with hidden source maps next to its bundles. A stack
// trace from the UI points into the minified files (app://rmc/main-AB12.js:1:48211); this maps each frame
// back to the TypeScript file and line, so a log a streamer sends shows where the error really is.

import fs from 'node:fs';
import path from 'node:path';
import { SourceMap } from 'node:module';

const FRAME = /app:\/\/rmc\/([\w.-]+\.js):(\d+):(\d+)/g;

/** Source maps of the UI folder, loaded once each (null: none or unreadable). */
const maps = new Map<string, SourceMap | null>();

function sourceMap(uiDir: string, file: string): SourceMap | null {
  const key = path.join(uiDir, file);
  if (!maps.has(key)) {
    let map: SourceMap | null = null;
    try {
      map = new SourceMap(JSON.parse(fs.readFileSync(`${key}.map`, 'utf8')));
    } catch {
      // No map for this file (dev server, or a file without one): the frame stays as it is.
    }
    maps.set(key, map);
  }
  return maps.get(key) ?? null;
}

/** The stack with every frame of the UI's bundles replaced by its TypeScript position, where a map knows it. */
export function mapStack(stack: string, uiDir: string | undefined): string {
  if (!uiDir) return stack;
  return stack.replace(FRAME, (frame, file: string, line: string, column: string) => {
    if (file.includes('/') || file.includes('\\')) return frame;
    const entry = sourceMap(uiDir, file)?.findEntry(Number(line) - 1, Number(column) - 1);
    if (!entry || !('originalSource' in entry) || !entry.originalSource) return frame;
    const source = entry.originalSource.replace(/^webpack:\/\/\/|^\.\/|^(\.\.\/)+/, '');
    return `${source}:${entry.originalLine + 1}:${entry.originalColumn + 1}`;
  });
}
