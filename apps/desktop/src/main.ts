// Electron main process: one window with the Angular UI. The shell runs here (the Twitch connection, the local
// server with the OBS browser source, the audio outputs, shortcuts, settings and secrets), and the modules that are
// switched on, each through its host (modules.ts).

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, Menu, nativeTheme, shell } from 'electron';
import { normalizeAppSettings, PRODUCT_BYLINE, PRODUCT_NAME, type AppSettings, type OutputStatus } from '@stream-toolz/core';
import { asciiPath, removeRetiredPackages } from '@stream-toolz/speech';
import { TwitchConnection } from '@stream-toolz/twitch';
import { DeviceAudio } from './audio';
import { loadConfig, saveConfig, type ConfigFile } from './config';
import { env } from './env';
import { Hotkeys } from './hotkeys';
import { registerIpc } from './ipc';
import { LocalServer } from './local-server';
import { createLogger, errorText } from './logger';
import { Modules } from './modules';
import { ObsOutput } from './obs';
import { SecretFile } from './secrets';
import { APP_ORIGIN, DEV_URL, blockHostLookups, guardWebContents, hardenSession, registerAppScheme, serveApp } from './security';

const dev = !app.isPackaged;
/** Repository root in dev (apps/desktop/dist/main.cjs). */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// ASCII only: the app name ends up in the user agent and in folder names.
const APP_NAME = 'Stream Toolz';
/** Earlier names of the app (renamed 2026-10-28): their data folder moves to the current one, once. */
const FORMER_APP_NAMES = ['ReadMyChat'];
app.setName(APP_NAME);
// Dev gets its own profile folder, so testing never touches the installed app's login and settings.
const suffix = dev ? '-dev' : '';
app.setPath('userData', adoptDataFolder(app.getPath('appData'), APP_NAME + suffix, FORMER_APP_NAMES.map((name) => name + suffix)));

/**
 * Settings, the encrypted Twitch data (Client ID, tokens) and logs always live in the user's profile
 * (%APPDATA%\Stream Toolz, dev: %APPDATA%\Stream Toolz-dev), never in the repository: nothing secret can end up
 * in a commit. STZ_DATA_DIR may move them, but not into the repository.
 */
const dataDir = profileDataDir();
const dirs = {
  // Voice packages are no secret: dev shares the repository's download cache with the console tools.
  // ASCII paths for the engines (a profile like C:\Users\Jörg gets its short name, ascii-path.ts).
  voices: asciiPath(dev && !env('DATA_DIR') ? path.join(repoRoot, '.cache', 'tts') : path.join(dataDir, 'voices'), console.error),
  logs: path.join(dataDir, 'logs'),
  work: asciiPath(path.join(dataDir, 'cache', 'speech'), console.error),
};
const configFile = path.join(dataDir, 'config.json');
const secretsFile = path.join(dataDir, 'secrets.bin');

/** Built UI: next to the app when installed, the Angular build output in dev. */
const uiDir = app.isPackaged ? path.join(process.resourcesPath, 'ui') : path.join(repoRoot, 'apps', 'ui', 'dist', 'ui', 'browser');
/** Quitting waits at most this long for the local server (its OBS sources) to close. */
const QUIT_TIMEOUT_MS = 3_000;

registerAppScheme();
blockHostLookups();
// Screenshot script (dev): Windows stops painting a window that others cover, and the shots would show an old frame.
if (dev && env('SCREENSHOTS')) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

// One instance only: two would fight over the local port and read the chat twice.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

let window: BrowserWindow | undefined;

async function start(): Promise<void> {
  guardWebContents();
  await app.whenReady();
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(null);
  hardenSession();
  serveApp(DEV_URL ? undefined : uiDir);

  const log = createLogger(dirs.logs, dev);
  log(`APP       ${PRODUCT_NAME} ${app.getVersion()} (Electron ${process.versions.electron})`);
  // Errors nobody caught go into the log with their stack (TypeScript lines, see scripts/build.mjs) instead of
  // Electron's error dialog; the app keeps reading.
  process.on('uncaughtException', (err) => log(`ERROR     uncaught: ${errorText(err)}`));
  process.on('unhandledRejection', (reason) => log(`ERROR     unhandled rejection: ${errorText(reason)}`));
  app.on('render-process-gone', (_event, contents, details) => log(`ERROR     window process gone (${details.reason}, exit ${details.exitCode}): ${contents.getURL().slice(0, 60)}`));
  app.on('child-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') log(`ERROR     ${details.type} process gone (${details.reason}, exit ${details.exitCode})`);
  });
  fs.rmSync(dirs.work, { recursive: true, force: true });

  let config: ConfigFile = loadConfig(configFile, app.getLocale(), log);
  const appSettings = () => config.app;
  const save = (change: Partial<ConfigFile>) => {
    config = { ...config, ...change };
    saveConfig(configFile, config);
  };
  const secrets = new SecretFile(secretsFile, log);
  const send = (channel: string, value: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  };
  let modules: Modules | undefined;

  // Packages that left the catalogue (Kokoro) are cleared once; nothing uses them.
  removeRetiredPackages(dirs.voices, (line) => log(`VOICES    ${line}`));

  // --- Outputs: an audio device, and the OBS browser source on the local server ---
  const audio = new DeviceAudio(path.join(__dirname, 'audio-preload.cjs'), dev);
  audio.start();
  let portInUse = false;
  const outputStatus = (): OutputStatus => ({ obsClients: obs.clientCount, portInUse });
  const outputChanged = () => {
    const status = outputStatus();
    send('stz:output-status', status);
    modules?.outputChanged(status);
  };
  const obs = new ObsOutput(outputChanged, log);
  const serverUrl = (id: string) => `http://127.0.0.1:${appSettings().serverPort}/${id}/${secrets.obsKey}/`;
  const obsUrl = () => serverUrl('obs');

  // --- Twitch: the streamer's own app (type Public), login by code on twitch.tv/activate ---
  const twitch = new TwitchConnection({
    store: secrets.twitchStore,
    channel: () => appSettings().channel,
    features: () => modules?.twitchFeatures() ?? [],
    // Only Twitch's own login page (the address comes from Twitch's answer).
    openBrowser: (url) => {
      if (/^https:\/\/(www\.)?twitch\.tv\//.test(url)) void shell.openExternal(url);
    },
    log,
  });

  // --- Local server: the OBS browser source ---
  const server = new LocalServer({ obs, obsKey: () => secrets.obsKey, language: () => appSettings().language, log });
  const listen = async () => {
    try {
      await server.listen(appSettings().serverPort);
      portInUse = false;
    } catch (err) {
      portInUse = true;
      log(`SERVER    port ${appSettings().serverPort}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    }
    outputChanged();
  };

  // --- System-wide shortcuts, for every module ---
  const hotkeys = new Hotkeys((status) => send('stz:hotkey-status', status), log);

  // --- Modules ---
  modules = new Modules({
    dev,
    locale: app.getLocale(),
    app: appSettings,
    stored: (id) => config.modules[id],
    save: (id, module) => save({ modules: { ...config.modules, [id]: module } }),
    twitch,
    device: audio,
    obs,
    outputStatus,
    hotkeys,
    server,
    serverUrl,
    desktop: {
      copyText: (text) => clipboard.writeText(text),
      openLocalPage: async (url) => {
        // Only this PC's own address: a module opens nothing on the internet.
        if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//.test(url)) throw new Error('Not allowed');
        await shell.openExternal(url);
      },
      openFolder: async (folder) => {
        await fs.promises.mkdir(folder, { recursive: true });
        await shell.openPath(folder);
      },
      pickFolder: async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
        return result.canceled ? undefined : result.filePaths[0];
      },
      pickFiles: async (extensions) => {
        const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: extensions.join(', '), extensions }] });
        return result.canceled ? [] : result.filePaths;
      },
    },
    dirs: { ...dirs, data: dataDir },
    log,
    send,
  });
  const running = modules;

  async function applyAppSettings(change: Record<string, unknown>): Promise<AppSettings> {
    const before = config.app;
    const next = normalizeAppSettings({ ...before, ...change }, before);
    save({ app: next });
    if (next.channel !== before.channel) twitch.reconnect();
    if (next.serverPort !== before.serverPort) await listen();
    send('stz:app-settings', next);
    running.appChanged(next, before);
    return next;
  }

  registerIpc({
    dataDir,
    dirs,
    uiDir: DEV_URL ? undefined : uiDir,
    dev,
    secrets,
    twitch,
    audio,
    obs,
    hotkeys,
    getConfig: () => ({ app: config.app, modules: running.states, guideDone: config.guideDone }),
    applyAppSettings,
    setModuleEnabled: (id, enabled) => running.setEnabled(id, enabled),
    setGuideDone: (done) => save({ guideDone: done }),
    outputStatus,
    obsUrl,
    voicesChanged: (phase) => running.voicesChanged(phase),
    log,
    send,
  });

  createWindow();
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    hotkeys.close();
    running.stopAll();
    twitch.stop();
    obs.close();
    audio.close();
    // Never kept open by a server that does not finish (the app would stay in the background, holding the
    // single-instance lock): at most QUIT_TIMEOUT_MS.
    void Promise.race([server.close(), new Promise((resolve) => setTimeout(resolve, QUIT_TIMEOUT_MS))]).finally(() => app.exit(0));
  });
  app.on('window-all-closed', () => app.quit());

  await listen();
  // The modules first: they listen before the first event arrives, and the connection knows what they read.
  running.startEnabled();
  twitch.start();
}

function createWindow(): void {
  window = new BrowserWindow({
    title: `${PRODUCT_NAME} ${PRODUCT_BYLINE}`,
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    // Maldö: the mascot as the window and taskbar icon (as in GT Toolz; in dev straight from the UI's sources).
    icon: path.join(app.isPackaged ? uiDir : path.join(repoRoot, 'apps', 'ui', 'public'), 'maldoe-256.png'),
    backgroundColor: '#0d0a07',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0a07', symbolColor: '#d8cdc3', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: dev || env('DEVTOOLS') === '1',
    },
  });
  window.once('ready-to-show', () => window?.show());
  // The hidden audio window would keep the app running: closing the main window ends it.
  window.on('closed', () => {
    window = undefined;
    app.quit();
  });
  // Dev: the UI's console output (errors, CSP violations) also goes to the terminal.
  if (dev) {
    window.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') console.log(`[ui:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
  }
  window.webContents.on('before-input-event', (event, input) => {
    // F12 / Ctrl+Shift+I: DevTools (dev builds only, see devTools above). Ctrl+R: reload.
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      window?.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (dev && input.control && input.key.toLowerCase() === 'r') {
      window?.webContents.reload();
      event.preventDefault();
    }
  });
  void window.loadURL(DEV_URL ?? `${APP_ORIGIN}/`);
  const screenshots = env('SCREENSHOTS');
  if (dev && screenshots) runScreenshotScript(window, screenshots);
}

/**
 * The data folder for the app's name. After a rename the folder of an earlier name moves over once, so the login,
 * the OBS address, the settings and the voices stay. If it cannot be moved (in use, another drive), the old folder
 * stays as it is and the app starts with a new one; nothing is deleted. (From GT Toolz.)
 */
function adoptDataFolder(appData: string, name: string, formerNames: string[]): string {
  const folder = path.join(appData, name);
  if (fs.existsSync(folder)) return folder;
  const former = formerNames.find((n) => fs.existsSync(path.join(appData, n)));
  if (!former) return folder;
  try {
    fs.renameSync(path.join(appData, former), folder);
    console.log(`[app] data folder moved from "${former}" to "${name}"`);
  } catch (err) {
    console.error(`[app] data folder "${former}" could not be moved, starting with a new one: ${(err as Error).message}`);
  }
  return folder;
}

function profileDataDir(): string {
  const profile = app.getPath('userData');
  const dataDir = env('DATA_DIR');
  if (!dataDir) return profile;
  const wanted = path.resolve(dataDir);
  if (isInside(wanted, repoRoot)) {
    console.error(`[app] STZ_DATA_DIR must not be inside the repository (secrets would be next to the code); using ${profile}`);
    return profile;
  }
  return wanted;
}

/** dir is folder or below it (Windows paths compared without case). */
function isInside(dir: string, folder: string): boolean {
  const norm = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const relative = path.relative(norm(folder), norm(dir));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

type ScreenshotStep = { route: string } | { click: string } | { wait: number } | { shot: string } | { log: string } | { eval: string };

/**
 * Dev helper to check the layout without looking: runs a JSON script of steps against the UI and saves
 * screenshots next to it. Steps: {"route": "/settings"}, {"click": "css selector"}, {"wait": 1500},
 * {"shot": "name"}, {"log": "expression"}, {"eval": "statement"}.
 */
function runScreenshotScript(win: BrowserWindow, scriptFile: string): void {
  const steps = JSON.parse(fs.readFileSync(scriptFile, 'utf8')) as ScreenshotStep[];
  const dir = path.dirname(path.resolve(scriptFile));
  win.webContents.once('did-finish-load', async () => {
    for (const step of steps) {
      if ('route' in step) await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + step.route)}; void 0`);
      if ('click' in step) await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(step.click)})?.click(); void 0`);
      if ('eval' in step) await win.webContents.executeJavaScript(`${step.eval}; void 0`);
      if ('wait' in step) await new Promise((resolve) => setTimeout(resolve, step.wait));
      if ('log' in step) console.log(`[dev] ${step.log} =>`, await win.webContents.executeJavaScript(step.log));
      if ('shot' in step) fs.writeFileSync(path.join(dir, `${step.shot}.png`), (await win.webContents.capturePage()).toPNG());
    }
    console.log(`[dev] screenshots saved to ${dir}`);
    if (env('SCREENSHOTS_QUIT') === '1') app.quit();
  });
}
