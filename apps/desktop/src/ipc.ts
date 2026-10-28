// IPC between the UI (window.rmc, see preload.ts) and the main process. Every call is checked: it must
// come from the app's own page, and its arguments are validated here, not trusted.

import fs from 'node:fs';
import { app, clipboard, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import {
  CHANNEL_EVENT_KINDS,
  installPackages,
  isInstalled,
  packageSize,
  preselectedPackages,
  PRODUCT_NAME,
  readVoicePackages,
  removePackages,
  type AppConfig,
  type AppInfo,
  type ChannelEventKind,
  type ChatReader,
  type CopyId,
  type FolderId,
  type InstallState,
  type LinkId,
  type Settings,
  TwitchFailure,
  type TwitchConnection,
  type TwitchStatus,
  type VoicePackageInfo,
} from '@stream-toolz/runtime';
import type { DeviceAudio } from './audio';
import type { Hotkeys } from './hotkeys';
import { chromiumLicensesFile, licenseEntries } from './licenses';
import type { SecretFile } from './secrets';
import { fromApp } from './security';
import { mapStack } from './stack-map';
import type { VoiceHolder } from './voice';

export interface IpcContext {
  dataDir: string;
  dirs: { voices: string; logs: string };
  /** The built UI with its source maps; undefined with the dev server (its code is readable as it is). */
  uiDir: string | undefined;
  dev: boolean;
  secrets: SecretFile;
  twitch: TwitchConnection;
  reader: ChatReader;
  voice: VoiceHolder;
  audio: DeviceAudio;
  hotkeys: Hotkeys;
  getConfig: () => AppConfig;
  twitchStatus: () => TwitchStatus;
  /** Validates, applies and saves a settings change. */
  applySettings: (change: Record<string, unknown>) => Promise<Settings>;
  setGuideDone: (done: boolean) => void;
  obsUrl: () => string;
  testOutput: () => Promise<void>;
  previewVoice: (id: string) => Promise<void>;
  /** Voice packages were installed or removed. */
  voicesChanged: () => void;
  log: (line: string) => void;
  send: (channel: string, value: unknown) => void;
}

/**
 * Web pages the app may open in the browser, and only on the user's click (nothing is loaded from them). Stream Toolz
 * runs under Maldö (the user, 2026-10-22): the donation and Maldö's channels, as in GT Toolz. Patreon: once it exists.
 */
const LINKS: Partial<Record<LinkId, string>> = {
  twitchConsole: 'https://dev.twitch.tv/console/apps',
  twitchSecurity: 'https://www.twitch.tv/settings/security',
  obs: 'https://obsproject.com',
  paypal: 'https://www.paypal.com/donate/?hosted_button_id=SVZHLRTQ6H4VL',
  twitch: 'https://www.twitch.tv/maldoe',
  youtube: 'https://www.youtube.com/@dermaldoe',
  facebook: 'https://www.facebook.com/RealMaldoe',
  x: 'https://x.com/DerMaldoe',
  instagram: 'https://www.instagram.com/maldoe_gaming/',
};

const PROGRESS_INTERVAL_MS = 100;
/** UI errors logged per minute at most (an error in a loop must not fill the disk). */
const MAX_ERRORS_PER_WINDOW = 20;
const ERROR_WINDOW_MS = 60_000;

export function registerIpc(ctx: IpcContext): void {
  const { twitch, reader } = ctx;

  const handle = (name: string, handler: (...args: unknown[]) => unknown) => {
    ipcMain.handle(`rmc:${name}`, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!fromApp(event)) throw new Error('Not allowed');
      return handler(...args);
    });
  };

  // --- Events to the UI ---
  twitch.on('status', () => ctx.send('rmc:twitch-status', ctx.twitchStatus()));
  reader.on('status', (status) => ctx.send('rmc:reader-status', status));
  reader.on('log', (entry) => ctx.send('rmc:chat-log', entry));

  // --- App ---
  handle(
    'info',
    (): AppInfo => ({
      name: PRODUCT_NAME,
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      dataDir: ctx.dataDir,
      dev: ctx.dev,
      // Other Unix systems (FreeBSD …) get the Linux texts.
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
      encryption: ctx.secrets.persistent ? 'os' : 'none',
    }),
  );
  handle('getConfig', () => ctx.getConfig());
  handle('setSettings', (change) => ctx.applySettings(asObject(change)));
  handle('setGuideDone', (done) => ctx.setGuideDone(done === true));

  // --- Twitch ---
  handle('twitchStatus', () => ctx.twitchStatus());
  handle('saveTwitchApp', async (input) => {
    const value = asObject(input);
    try {
      await twitch.saveApp({ clientId: asString(value.clientId) });
    } catch (err) {
      // The UI shows a text per error code ("invalid-client", "network"), not Twitch's own message.
      throw new Error(err instanceof TwitchFailure ? err.code : 'unknown');
    }
    return ctx.twitchStatus();
  });
  handle('removeTwitchApp', async () => {
    await twitch.removeApp();
    return ctx.twitchStatus();
  });
  // Not awaited: the login waits for the streamer's confirmation on Twitch; the status follows by event.
  handle('twitchLogin', () => void twitch.beginLogin());
  handle('reopenTwitchLogin', () => twitch.reopenLogin());
  handle('cancelTwitchLogin', () => twitch.cancelLogin());
  handle('twitchLogout', () => twitch.logout());

  // --- Reader ---
  handle('readerStatus', () => reader.status);
  handle('chatLog', () => reader.log);
  handle('pause', () => reader.pause());
  handle('resume', () => reader.resume());
  handle('skip', () => reader.skip());
  handle('clearQueue', () => reader.clear());
  handle('removeQueued', (id) => reader.remove(asString(id)));
  handle('testMessage', (text) => {
    const value = asText(text).trim();
    if (value) reader.test(value);
  });
  handle('testEvent', (kind) => {
    if (CHANNEL_EVENT_KINDS.includes(kind as ChannelEventKind)) reader.testEvent(kind as ChannelEventKind);
  });
  handle('learnReward', () => reader.learnReward(true));
  handle('cancelLearnReward', () => reader.learnReward(false));

  // --- Output ---
  handle('obsUrl', () => ctx.obsUrl());
  handle('newObsKey', () => {
    ctx.secrets.newObsKey();
    return ctx.obsUrl();
  });
  handle('audioDevices', () => ctx.audio.devices());
  handle('testOutput', () => ctx.testOutput());

  // --- Voices ---
  handle('listVoices', () => ctx.voice.voices());
  handle('previewVoice', (id) => ctx.previewVoice(asString(id)));
  handle('voicePackages', (): VoicePackageInfo[] => {
    const settings = ctx.getConfig().settings;
    const preselected = new Set(preselectedPackages(settings.speechLanguage).map((p) => p.id));
    return readVoicePackages().packages.map((pkg) => ({
      id: pkg.id,
      kind: pkg.kind,
      engine: pkg.engine,
      name: pkg.name,
      license: pkg.license,
      source: pkg.source,
      language: pkg.language,
      gender: pkg.gender,
      dataset: pkg.dataset,
      requires: pkg.requires,
      voices: pkg.kind === 'voice' ? [pkg.id] : (pkg.voices ?? []).map((v) => v.id),
      languages: [...new Set(pkg.kind === 'voice' ? [pkg.language ?? ''] : (pkg.voices ?? []).map((v) => v.language))].filter(Boolean),
      sizeBytes: packageSize(pkg),
      installed: isInstalled(ctx.dirs.voices, pkg),
      preselected: preselected.has(pkg.id),
    }));
  });

  let install: AbortController | undefined;
  let lastProgressAt = 0;
  const sendInstall = (state: InstallState) => ctx.send('rmc:voice-install', state);

  handle('installVoicePackages', async (ids) => {
    if (install) throw new Error('An installation is already running');
    const selection = packageIds(ids);
    if (!selection.length) return;
    const controller = new AbortController();
    install = controller;
    sendInstall({ state: 'installing', ids: selection });
    try {
      await installPackages(selection, ctx.dirs.voices, {
        signal: controller.signal,
        log: (line) => ctx.log(`VOICES    ${line}`),
        onProgress: (progress) => {
          const now = Date.now();
          if (progress.phase === 'download' && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
          lastProgressAt = now;
          sendInstall({ state: 'installing', ids: selection, progress });
        },
      });
      sendInstall({ state: 'done', ids: selection });
      ctx.voicesChanged();
    } catch (err) {
      if (controller.signal.aborted) sendInstall({ state: 'cancelled' });
      else sendInstall({ state: 'error', message: (err as Error).message });
    } finally {
      install = undefined;
    }
  });
  handle('cancelVoiceInstall', () => install?.abort());
  handle('removeVoicePackages', (ids) => {
    // The engine must not run while its files are deleted.
    ctx.voice.close();
    removePackages(packageIds(ids), ctx.dirs.voices, (line) => ctx.log(`VOICES    ${line}`));
    ctx.voicesChanged();
  });

  // --- Hotkeys ---
  handle('hotkeyStatus', () => ctx.hotkeys.status);
  handle('suspendHotkeys', (suspend) => ctx.hotkeys.suspend(suspend === true));

  // --- Errors from the UI: into the log, mapped to the TypeScript source; a burst is cut off ---
  let reported: number[] = [];
  handle('reportError', (report) => {
    const now = Date.now();
    reported = reported.filter((at) => now - at < ERROR_WINDOW_MS);
    if (reported.length >= MAX_ERRORS_PER_WINDOW) return;
    reported.push(now);
    const value = asObject(report);
    const message = typeof value.message === 'string' ? value.message.slice(0, 1000) : 'unknown error';
    const stack = typeof value.stack === 'string' ? value.stack.slice(0, 8000) : '';
    ctx.log(`UI ERROR  ${stack ? mapStack(stack, ctx.uiDir) : message}`);
  });

  // --- About, links, folders ---
  handle('licenses', () => licenseEntries());
  handle('openChromiumLicenses', async () => {
    await shell.openPath(chromiumLicensesFile());
  });
  handle('links', () => LINKS);
  handle('openLink', async (id) => {
    const url = LINKS[asString(id) as LinkId];
    if (url?.startsWith('https://')) await shell.openExternal(url);
  });
  handle('copyText', (id) => {
    const values: Record<CopyId, () => string> = { obsUrl: ctx.obsUrl, loginCode: () => twitch.status.login?.userCode ?? '' };
    const value = values[asString(id) as CopyId];
    const text = value?.();
    if (text) clipboard.writeText(text);
  });
  handle('openFolder', async (kind) => {
    const folders: Record<FolderId, string> = { data: ctx.dataDir, voices: ctx.dirs.voices, logs: ctx.dirs.logs };
    const folder = folders[asString(kind) as FolderId];
    if (!folder) return;
    await fs.promises.mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid argument');
  return value;
}

/** A test message (longer than an id; Twitch allows 500 characters). */
function asText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Invalid argument');
  return value;
}

/** Only ids from the voice package manifest. */
function packageIds(value: unknown): string[] {
  const known = new Set(readVoicePackages().packages.map((p) => p.id));
  if (!Array.isArray(value)) throw new Error('Invalid argument');
  return value.filter((id): id is string => typeof id === 'string' && known.has(id));
}
