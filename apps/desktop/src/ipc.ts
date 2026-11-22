// IPC between the UI (window.stz, see preload.ts) and the shell in the main process. Every call is checked: it must
// come from the app's own page (bridge.ts), and its arguments are validated here, not trusted. The modules' calls
// (window.stz.<id>) are registered by their hosts (modules.ts).

import fs from 'node:fs';
import { app, clipboard, shell } from 'electron';
import {
  asObject,
  asString,
  PRODUCT_NAME,
  type AppConfig,
  type AppInfo,
  type AppSettings,
  type CopyId,
  type FolderId,
  type LinkId,
  type ModuleState,
  type OutputStatus,
} from '@stream-toolz/core';
import {
  availableVoices,
  installPackages,
  isInstalled,
  packageSize,
  preselectedPackages,
  readVoicePackages,
  removePackages,
  type InstallState,
  type VoicePackageInfo,
} from '@stream-toolz/speech';
import { TwitchFailure, type TwitchConnection, type TwitchStatus } from '@stream-toolz/twitch';
import type { DeviceAudio } from './audio';
import type { ObsOutput } from './obs';
import { handle as handleChannel } from './bridge';
import type { Hotkeys } from './hotkeys';
import { chromiumLicensesFile, licenseEntries } from './licenses';
import type { SecretFile } from './secrets';
import { mapStack } from './stack-map';

export interface IpcContext {
  dataDir: string;
  dirs: { voices: string; logs: string };
  /** The built UI with its source maps; undefined with the dev server (its code is readable as it is). */
  uiDir: string | undefined;
  dev: boolean;
  secrets: SecretFile;
  twitch: TwitchConnection;
  audio: DeviceAudio;
  obs: ObsOutput;
  hotkeys: Hotkeys;
  getConfig: () => AppConfig;
  /** Validates, applies and saves a change of the app's settings. */
  applyAppSettings: (change: Record<string, unknown>) => Promise<AppSettings>;
  setModuleEnabled: (id: string, enabled: boolean) => Record<string, ModuleState>;
  setGuideDone: (done: boolean) => void;
  outputStatus: () => OutputStatus;
  obsUrl: () => string;
  /** Voice packages are about to be removed, or were installed or removed. */
  voicesChanged: (phase: 'removing' | 'changed') => void;
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
  const { twitch } = ctx;
  const handle = (name: string, handler: (...args: unknown[]) => unknown) => void handleChannel(`stz:${name}`, handler);

  // --- Events to the UI ---
  twitch.on('status', () => ctx.send('stz:twitch-status', twitch.status));

  // --- App and modules ---
  handle(
    'info',
    (): AppInfo => ({
      name: PRODUCT_NAME,
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      // Not the data folder: its path holds the Windows user name, and the page opens it through openFolder.
      dev: ctx.dev,
      // Other Unix systems (FreeBSD …) get the Linux texts.
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
      encryption: ctx.secrets.persistent ? 'os' : 'none',
    }),
  );
  handle('getConfig', () => ctx.getConfig());
  handle('setAppSettings', (change) => ctx.applyAppSettings(asObject(change)));
  handle('setModuleEnabled', (id, enabled) => ctx.setModuleEnabled(asString(id), enabled === true));
  handle('setGuideDone', (done) => ctx.setGuideDone(done === true));

  // --- Twitch ---
  handle('twitchStatus', () => twitch.status);
  handle('saveTwitchApp', async (input) => {
    const value = asObject(input);
    try {
      await twitch.saveApp({ clientId: asString(value.clientId) });
    } catch (err) {
      // The UI shows a text per error code ("invalid-client", "network"), not Twitch's own message.
      throw new Error(err instanceof TwitchFailure ? err.code : 'unknown');
    }
    return twitch.status;
  });
  handle('removeTwitchApp', async (): Promise<TwitchStatus> => {
    await twitch.removeApp();
    return twitch.status;
  });
  // Not awaited: the login waits for the streamer's confirmation on Twitch; the status follows by event.
  handle('twitchLogin', () => void twitch.beginLogin());
  handle('reopenTwitchLogin', () => twitch.reopenLogin());
  handle('cancelTwitchLogin', () => twitch.cancelLogin());
  handle('twitchLogout', () => twitch.logout());

  // --- Outputs ---
  handle('outputStatus', () => ctx.outputStatus());
  handle('obsUrl', () => ctx.obsUrl());
  handle('newObsKey', () => {
    ctx.secrets.newObsKey();
    // Sources holding the old address reconnect, fail under the old key and are gone for good.
    ctx.obs.dropClients();
    return ctx.obsUrl();
  });
  handle('audioDevices', () => ctx.audio.devices());

  // --- Voices ---
  handle('listVoices', () => availableVoices(ctx.dirs.voices));
  handle('voicePackages', (): VoicePackageInfo[] => {
    const preselected = new Set(preselectedPackages(ctx.getConfig().app.language).map((p) => p.id));
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
  const sendInstall = (state: InstallState) => ctx.send('stz:voice-install', state);

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
      ctx.voicesChanged('changed');
    } catch (err) {
      if (controller.signal.aborted) sendInstall({ state: 'cancelled' });
      else sendInstall({ state: 'error', message: (err as Error).message });
    } finally {
      install = undefined;
    }
  });
  handle('cancelVoiceInstall', () => install?.abort());
  handle('removeVoicePackages', (ids) => {
    // The engines must not run while their files are deleted.
    ctx.voicesChanged('removing');
    removePackages(packageIds(ids), ctx.dirs.voices, (line) => ctx.log(`VOICES    ${line}`));
    ctx.voicesChanged('changed');
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
    const url = Object.hasOwn(LINKS, asString(id)) ? LINKS[asString(id) as LinkId] : undefined;
    if (url?.startsWith('https://')) await shell.openExternal(url);
  });
  handle('copyText', (id) => {
    const values: Record<CopyId, () => string> = { obsUrl: ctx.obsUrl, loginCode: () => twitch.status.login?.userCode ?? '' };
    const value = Object.hasOwn(values, asString(id)) ? values[asString(id) as CopyId] : undefined;
    const text = value?.();
    if (text) clipboard.writeText(text);
  });
  handle('openFolder', async (kind) => {
    const folders: Record<FolderId, string> = { data: ctx.dataDir, voices: ctx.dirs.voices, logs: ctx.dirs.logs };
    const folder = Object.hasOwn(folders, asString(kind)) ? folders[asString(kind) as FolderId] : undefined;
    if (!folder) return;
    await fs.promises.mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
}

/** Only ids from the voice package manifest. */
function packageIds(value: unknown): string[] {
  const known = new Set(readVoicePackages().packages.map((p) => p.id));
  if (!Array.isArray(value)) throw new Error('Invalid argument');
  return value.filter((id): id is string => typeof id === 'string' && known.has(id));
}
