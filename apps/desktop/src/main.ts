// Electron main process: one window with the Angular UI. The Twitch connection, the reader, the voice and
// the local server (Twitch login, OBS browser source) run here.

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, Menu, nativeTheme, shell } from 'electron';
import {
  ChatReader,
  defaultSettings,
  languageOf,
  normalizeSettings,
  PRODUCT_BYLINE,
  PRODUCT_NAME,
  spokenTexts,
  TwitchConnection,
  type AppConfig,
  type Settings,
} from '@stream-toolz/runtime';
import { DeviceAudio } from './audio';
import { Hotkeys } from './hotkeys';
import { loadConfig, saveConfig } from './config';
import { registerIpc } from './ipc';
import { LocalServer } from './local-server';
import { createLogger, errorText } from './logger';
import { ObsOutput } from './obs';
import { SecretFile } from './secrets';
import { APP_ORIGIN, DEV_URL, guardWebContents, hardenSession, registerAppScheme, serveApp } from './security';
import { VoiceHolder } from './voice';

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
 * Settings, the encrypted Twitch data (Client ID, secret, tokens) and logs always live in the user's profile
 * (%APPDATA%\Stream Toolz, dev: %APPDATA%\Stream Toolz-dev), never in the repository: nothing secret can end up
 * in a commit. RMC_DATA_DIR may move them, but not into the repository.
 */
const dataDir = profileDataDir();
const dirs = {
  // Voice packages are no secret: dev shares the repository's download cache with the console tools.
  voices: dev && !process.env.RMC_DATA_DIR ? path.join(repoRoot, '.cache', 'tts') : path.join(dataDir, 'voices'),
  logs: path.join(dataDir, 'logs'),
  work: path.join(dataDir, 'cache', 'speech'),
};
const configFile = path.join(dataDir, 'config.json');
const secretsFile = path.join(dataDir, 'secrets.bin');

/** Built UI: next to the app when installed, the Angular build output in dev. */
const uiDir = app.isPackaged ? path.join(process.resourcesPath, 'ui') : path.join(repoRoot, 'apps', 'ui', 'dist', 'ui', 'browser');

registerAppScheme();

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

  let config: AppConfig = loadConfig(configFile, defaultSettings(app.getLocale()));
  const settings = () => config.settings;
  const secrets = new SecretFile(secretsFile, log);

  // --- Outputs ---
  const audio = new DeviceAudio(path.join(__dirname, 'audio-preload.cjs'), dev, () => settings().deviceId);
  audio.start();
  let reader: ChatReader | undefined;
  const obs = new ObsOutput((count) => reader?.setObsClients(count), log);
  const sink = () => (settings().output === 'obs' ? obs : audio);
  const obsUrl = () => `http://127.0.0.1:${settings().serverPort}/obs/${secrets.obsKey}/`;

  // --- Twitch: the streamer's own app (type Public), login by code on twitch.tv/activate ---
  const twitch = new TwitchConnection({
    store: secrets.twitchStore,
    channel: () => settings().channel,
    // Only Twitch's own login page (the address comes from Twitch's answer).
    openBrowser: (url) => {
      if (/^https:\/\/(www\.)?twitch\.tv\//.test(url)) void shell.openExternal(url);
    },
    log,
  });

  // --- Local server: the OBS browser source ---
  const server = new LocalServer({ obs, obsKey: () => secrets.obsKey, language: () => settings().language, log });
  const send = (channel: string, value: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  };
  const listen = async () => {
    try {
      await server.listen(settings().serverPort);
      reader?.setPortInUse(false);
    } catch (err) {
      reader?.setPortInUse(true);
      log(`SERVER    port ${settings().serverPort}: ${(err as NodeJS.ErrnoException).code ?? (err as Error).message}`);
    }
  };

  // --- Voice and reader ---
  const voice = new VoiceHolder(dirs.voices, dirs.work, settings, (id) => reader?.setVoice(id), log);
  reader = new ChatReader({
    settings,
    sink,
    speech: (language) => voice.get(language),
    ownUserId: () => twitch.ownUserId,
    onRewardLearned: (rewardId) => void applySettings({ rewardId }),
    log,
  });
  const chat = reader;
  twitch.on('message', (message) => chat.receive(message));
  twitch.on('deleted', (id) => chat.deleted(id));
  twitch.on('userCleared', (userId) => chat.userCleared(userId));
  twitch.on('chatCleared', () => chat.chatCleared());
  twitch.on('event', (event) => chat.event(event));

  // --- System-wide shortcuts ---
  const hotkeys = new Hotkeys(
    {
      pause: () => (chat.status.state === 'paused' ? chat.resume() : chat.pause()),
      skip: () => chat.skip(),
      clear: () => chat.clear(),
    },
    (status) => send('rmc:hotkey-status', status),
    log,
  );

  async function applySettings(change: Record<string, unknown>): Promise<Settings> {
    const before = config.settings;
    const next = normalizeSettings({ ...before, ...change }, before);
    config = { ...config, settings: next };
    saveConfig(configFile, config);
    if (next.channel !== before.channel) twitch.reconnect();
    if (next.serverPort !== before.serverPort) await listen();
    if (next.output !== before.output) (before.output === 'obs' ? obs : audio).stop();
    const voiceKeys: (keyof Settings)[] = ['voices', 'speechLanguage', 'rate', 'commaPause', 'sentencePause'];
    if (voiceKeys.some((key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]))) voice.invalidate();
    hotkeys.apply(next.hotkeys);
    chat.wake();
    send('rmc:settings', next);
    return next;
  }

  registerIpc({
    dataDir,
    dirs,
    uiDir: DEV_URL ? undefined : uiDir,
    dev,
    secrets,
    twitch,
    reader: chat,
    voice,
    audio,
    hotkeys,
    getConfig: () => config,
    twitchStatus: () => twitch.status,
    applySettings,
    setGuideDone: (done) => {
      config = { ...config, guideDone: done };
      saveConfig(configFile, config);
    },
    obsUrl,
    testOutput: async () => {
      const speech = await voice.get(languageOf(settings().speechLanguage));
      if (!speech) throw new Error('no-voice');
      const output = sink();
      if (!output.ready) throw new Error('obs-not-connected');
      output.play(await speech.synthesize(spokenTexts(settings().speechLanguage).outputTest), settings().volume / 100);
    },
    // Previews are for the user's own ears: always on the audio device, never on the stream.
    previewVoice: async (id) => {
      audio.stop();
      void audio.play(await voice.preview(id), settings().volume / 100);
    },
    voicesChanged: () => {
      voice.close();
      voice.invalidate();
      chat.wake();
    },
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
    chat.stop();
    twitch.stop();
    obs.close();
    voice.close();
    audio.close();
    void server.close().finally(() => app.exit(0));
  });
  app.on('window-all-closed', () => app.quit());

  await listen();
  hotkeys.apply(settings().hotkeys);
  twitch.start();
  chat.start();
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
      devTools: dev || process.env.RMC_DEVTOOLS === '1',
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
  if (dev && process.env.RMC_SCREENSHOTS) runScreenshotScript(window, process.env.RMC_SCREENSHOTS);
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
  if (!process.env.RMC_DATA_DIR) return profile;
  const wanted = path.resolve(process.env.RMC_DATA_DIR);
  if (isInside(wanted, repoRoot)) {
    console.error(`[app] RMC_DATA_DIR must not be inside the repository (secrets would be next to the code); using ${profile}`);
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
    if (process.env.RMC_SCREENSHOTS_QUIT === '1') app.quit();
  });
}
