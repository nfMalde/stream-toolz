// Countdown in the main process: the timers live in the settings (so they survive a restart), a tick every half
// second works out their texts and hands them to the overlay page (server-sent events) and the text files, each
// only when something changed. No chat announcement (the user, 2026-10-30). Everything it uses comes from its host
// (packages/core/src/module.ts); the shell takes handlers and the server mount back when it stops.

import crypto from 'node:crypto';
import { asString, asText, clamp, type ModuleDefinition, type ModuleHost, type ModuleInstance } from '@stream-toolz/core';
import { COUNTDOWN, type CountdownStatus, type StartResult } from '../src/api';
import { planFiles } from '../src/files';
import { timerText } from '../src/format';
import { parseCountdown } from '../src/parse';
import { defaultSettings, MAX_TIMERS, normalizeSettings, type Settings } from '../src/settings';
import { adjust, isDone, isExpired, MINUTE_MS, pause, resume, type Timer } from '../src/timer';
import { TextFiles } from './files';
import { OverlayPage, type OverlayTimer } from './page';

const TICK_MS = 500;
/** +1/−1 minute from the UI; more than an hour at once is a mistake. */
const MAX_ADJUST_MS = 60 * MINUTE_MS;
/** The overlay restyles when one of these changes. */
const STYLE_KEYS: (keyof Settings)[] = ['fontSize', 'fontFamily', 'color', 'align', 'shadow', 'showLabel', 'labelSize'];

/** The clock and whether the module ticks by itself: tests hand in their own and tick by hand. */
export interface CountdownClock {
  now: () => number;
  autoTick: boolean;
}

export interface CountdownInstance extends ModuleInstance<Settings> {
  /** One round: expired timers go, the texts are worked out and handed on where they changed. */
  tick(): void;
}

export function startCountdown(host: ModuleHost<Settings>, clock: CountdownClock = { now: Date.now, autoTick: true }): CountdownInstance {
  const settings = () => host.settings();
  const folderOf = () => settings().folder || host.dataDir;
  const files = new TextFiles(host.log, clock.now);
  /** What each timer shows now, by id (worked out by the tick). */
  let texts: Record<string, string> = {};
  let folderError: string | undefined;
  /** The outputs are touched only when this changes. */
  let lastRound = '';

  const overlayTimers = (): OverlayTimer[] =>
    [...settings().timers].reverse().map((timer) => ({ id: timer.id, label: timer.label, text: texts[timer.id] ?? '', done: isDone(timer, clock.now()) }));
  const page = new OverlayPage({
    style: () => settings(),
    timers: overlayTimers,
    language: () => host.app().language,
    onClients: () => sendStatus(),
    log: host.log,
  });
  host.server.handle((req, res, rest) => page.handle(req, res, rest));

  const { handle, send } = host.bridge;
  const status = (): CountdownStatus => ({
    timers: settings().timers,
    texts,
    url: host.server.url(),
    folder: folderOf(),
    ...(folderError ? { folderError } : {}),
    clients: page.clientCount,
  });
  const sendStatus = () => send('status', status());

  function tick(): void {
    const now = clock.now();
    const s = settings();
    const live = s.timers.filter((timer) => !isExpired(timer, now, s.doneSeconds));
    if (live.length !== s.timers.length) return void save(live);
    texts = Object.fromEntries(s.timers.map((timer) => [timer.id, timerText(timer, now, s.format, s.doneText, s.showDoneText)]));
    const overlay = overlayTimers();
    const round = JSON.stringify([overlay, s.output, folderOf()]);
    if (round === lastRound) return;
    lastRound = round;
    page.refreshTimers();
    const error = files.apply(folderOf(), s.output === 'overlay' ? {} : planFiles(s.timers, texts));
    if (error !== folderError) {
      folderError = error;
      sendStatus();
    }
  }

  /** The timers changed: saved (the settings are their one home), the outputs refreshed, the UI told. */
  async function save(timers: Timer[]): Promise<void> {
    await host.updateSettings({ timers });
    lastRound = '';
    tick();
    sendStatus();
  }

  async function change(id: unknown, step: (timer: Timer, now: number) => Timer): Promise<void> {
    const key = asString(id);
    const now = clock.now();
    const before = settings().timers;
    const after = before.map((timer) => (timer.id === key ? step(timer, now) : timer));
    if (after.some((timer, i) => timer !== before[i])) await save(after);
  }

  handle('start', async (phrase): Promise<StartResult> => {
    const text = asText(phrase);
    const before = settings().timers;
    if (before.length >= MAX_TIMERS) return { error: 'too-many' };
    const now = clock.now();
    const parsed = parseCountdown(text, new Date(now), host.app().language.startsWith('de') ? 'de' : 'en');
    if (!parsed) return { error: 'not-understood' };
    const timer: Timer = { id: crypto.randomBytes(8).toString('hex'), label: parsed.label, endsAt: parsed.endsAt, createdAt: now };
    await save([...before, timer]);
    host.log(`COUNTDOWN started, ${Math.max(0, Math.round((parsed.endsAt - now) / 1000))} s`);
    return timer;
  });
  handle('pause', (id) => change(id, pause));
  handle('resume', (id) => change(id, resume));
  handle('adjust', (id, deltaMs) => {
    const delta = clamp(deltaMs, -MAX_ADJUST_MS, MAX_ADJUST_MS, 0, 1000);
    return delta ? change(id, (timer, now) => adjust(timer, delta, now)) : Promise.resolve();
  });
  handle('remove', async (id) => {
    const key = asString(id);
    const before = settings().timers;
    const after = before.filter((timer) => timer.id !== key);
    if (after.length !== before.length) await save(after);
  });
  handle('clear', async () => {
    if (settings().timers.length) await save([]);
  });
  handle('status', () => status());
  handle('copyUrl', () => host.desktop.copyText(host.server.url()));
  handle('openUrl', () => host.desktop.openLocalPage(host.server.url()));
  handle('pickFolder', async () => {
    const folder = await host.desktop.pickFolder();
    if (folder) await host.updateSettings({ folder });
    return folder;
  });
  handle('openFolder', () => host.desktop.openFolder(folderOf()));

  const interval = clock.autoTick ? setInterval(tick, TICK_MS) : undefined;
  tick();
  host.log(`COUNTDOWN started with ${settings().timers.length} timer(s)`);

  return {
    tick,
    settingsChanged(next, before) {
      if (STYLE_KEYS.some((key) => next[key] !== before[key])) page.refreshStyle();
      // Timers, output, folder, format, done text: the next round sees them; the UI gets the state as it is now.
      lastRound = '';
      tick();
      sendStatus();
    },
    // The port changed: the overlay address is read fresh from the host.
    appChanged: () => sendStatus(),
    stop() {
      clearInterval(interval);
      page.close();
      files.clear();
    },
  };
}

export const countdownModule: ModuleDefinition<Settings> = {
  id: COUNTDOWN,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },
  start: (host) => startCountdown(host),
};
