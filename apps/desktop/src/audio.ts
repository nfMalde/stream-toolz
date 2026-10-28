// Output 'device': the voice plays in a hidden window with Web Audio, on the audio device the user chose
// (setSinkId). The window's page is app://rmc/audio.html (security.ts), which loads nothing; the player is
// its preload script (audio-preload.ts). The same window lists the audio devices, so ids and names match.

import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import { wavDuration, type AudioDevice, type AudioSink } from '@stream-toolz/runtime';
import { AUDIO_PAGE_URL } from './security';

/** Extra time after a clip's length before it counts as ended (the player did not answer). */
const END_MARGIN_MS = 3_000;
const DEVICES_TIMEOUT_MS = 5_000;

export class DeviceAudio implements AudioSink {
  /** Messages wait until the player is up, so the reader can always play. */
  readonly ready = true;
  private window: BrowserWindow | undefined;
  private windowReady = false;
  private pending: [channel: string, ...args: unknown[]][] = [];
  private readonly playing = new Map<number, () => void>();
  private readonly deviceRequests = new Map<number, (devices: AudioDevice[]) => void>();
  private nextId = 1;

  constructor(
    private readonly preload: string,
    private readonly dev: boolean,
    /** The device chosen in the settings ('' = the system's default). */
    private readonly deviceId: () => string,
  ) {
    const fromPlayer = (event: IpcMainEvent) => !!this.window && event.sender === this.window.webContents;
    ipcMain.on('audio:ready', (event) => {
      if (!fromPlayer(event)) return;
      this.windowReady = true;
      for (const [channel, ...args] of this.pending.splice(0)) this.window!.webContents.send(channel, ...args);
    });
    ipcMain.on('audio:ended', (event, id: unknown) => {
      if (fromPlayer(event) && typeof id === 'number') this.finish(id);
    });
    ipcMain.on('audio:devices', (event, id: unknown, devices: unknown) => {
      if (!fromPlayer(event) || typeof id !== 'number' || !Array.isArray(devices)) return;
      const list = devices
        .filter((d): d is AudioDevice => !!d && typeof d.id === 'string' && typeof d.label === 'string')
        .map((d) => ({ id: d.id.slice(0, 128), label: d.label.slice(0, 200) }));
      this.deviceRequests.get(id)?.(list);
      this.deviceRequests.delete(id);
    });
  }

  start(): void {
    const window = new BrowserWindow({
      show: false,
      width: 100,
      height: 100,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        // Clips play while the window is hidden, without a click first.
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    this.window = window;
    this.windowReady = false;
    window.webContents.on('render-process-gone', (_event, details) => {
      console.error(`[audio] player stopped (${details.reason}), starting it again`);
      if (this.window !== window) return;
      for (const id of [...this.playing.keys()]) this.finish(id);
      if (!window.isDestroyed()) window.destroy();
      this.start();
    });
    if (this.dev) {
      window.webContents.on('console-message', (event) => {
        if (event.level === 'warning' || event.level === 'error') console.log(`[audio:${event.level}] ${event.message}`);
      });
    }
    void window.loadURL(AUDIO_PAGE_URL);
  }

  close(): void {
    for (const id of [...this.playing.keys()]) this.finish(id);
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
  }

  play(wav: Buffer, volume: number): Promise<void> {
    const id = this.nextId++;
    let seconds = 10;
    try {
      seconds = wavDuration(wav);
    } catch {
      // Not a WAV: the player reports the error and ends it.
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(id), seconds * 1000 + END_MARGIN_MS);
      this.playing.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
      this.send('audio:play', id, wav, volume, this.deviceId());
    });
  }

  stop(): void {
    this.send('audio:stop');
    for (const id of [...this.playing.keys()]) this.finish(id);
  }

  /** The audio outputs, with names. */
  devices(): Promise<AudioDevice[]> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.deviceRequests.delete(id);
        resolve([]);
      }, DEVICES_TIMEOUT_MS);
      this.deviceRequests.set(id, (devices) => {
        clearTimeout(timer);
        resolve(devices);
      });
      this.send('audio:list-devices', id);
    });
  }

  private finish(id: number): void {
    const done = this.playing.get(id);
    this.playing.delete(id);
    done?.();
  }

  private send(channel: string, ...args: unknown[]): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (this.windowReady) window.webContents.send(channel, ...args);
    else this.pending.push([channel, ...args]);
  }
}
