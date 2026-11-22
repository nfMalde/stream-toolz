// Which text files hold which timer (the user, 2026-10-30: "schreiben in Textdatei damit OBS den Font steuert").
// countdown.txt is the newest timer; countdown-<n>.txt the n-th started (oldest = 1, so a second timer never moves
// the first one's file); countdown-<label>.txt the newest timer with that label. Pure: main/files.ts writes them.

import type { Timer } from './timer';

export const MAIN_FILE = 'countdown.txt';
/** The slug keeps the file name plain ASCII, so OBS and every file system take it. */
const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

export function labelSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** File name → content, for timers in their stored order (oldest first) and the text each shows now. */
export function planFiles(timers: readonly Timer[], texts: Record<string, string>): Record<string, string> {
  const files: Record<string, string> = {};
  const newest = timers.reduce<Timer | undefined>((best, t) => (!best || t.createdAt >= best.createdAt ? t : best), undefined);
  if (newest) files[MAIN_FILE] = texts[newest.id] ?? '';
  timers.forEach((timer, index) => {
    files[`countdown-${index + 1}.txt`] = texts[timer.id] ?? '';
  });
  // Newest first, so the first timer with a label wins when two share it.
  for (const timer of [...timers].sort((a, b) => b.createdAt - a.createdAt)) {
    const slug = labelSlug(timer.label);
    if (!slug || /^\d+$/.test(slug)) continue;
    const name = `countdown-${slug}.txt`;
    if (!(name in files)) files[name] = texts[timer.id] ?? '';
  }
  return files;
}
