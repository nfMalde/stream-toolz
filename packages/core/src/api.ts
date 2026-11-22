// The shell's part of the contract between the UI and the main process (window.stz): what all modules share (the
// app's settings and info, the modules on or off, Twitch, audio outputs, voices, shortcuts, errors, licenses, links,
// folders). Each module adds its own calls under its id (window.stz.<id>, see apps/desktop/src/bridge-api.ts).
// Types only (plus a few constants and pure helpers), so the UI can import it without pulling in Node code.

import type { InstallState, VoiceChoice, VoicePackageInfo } from '@stream-toolz/speech/api';
import type { TwitchAppInput, TwitchStatus } from '@stream-toolz/twitch/api';
import type { AppSettings } from './settings';

export { isValidHotkey } from './hotkeys';
export type { AppSettings } from './settings';
export { DEFAULT_SERVER_PORT } from './settings';

export const PRODUCT_NAME = 'Stream Toolz';
/** Who makes it, next to the name: title bar, window title, about. Never in folder or process names. */
export const PRODUCT_BYLINE = 'by Maldö';

export type Unsubscribe = () => void;
export type Platform = 'windows' | 'mac' | 'linux';

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  dev: boolean;
  platform: Platform;
  /**
   * How the Twitch app data is stored: 'os' = encrypted by the system (Windows: DPAPI, macOS: Keychain,
   * Linux: Secret Service), 'none' = no encryption available (kept in memory only, never written).
   */
  encryption: 'os' | 'none';
}

/** A module as the shell keeps it: switched on or off (its settings are its own, see ModuleSettingsApi). */
export interface ModuleState {
  enabled: boolean;
}

export interface AppConfig {
  app: AppSettings;
  /** Every built-in module by its id. */
  modules: Record<string, ModuleState>;
  /** The setup assistant was finished (or closed) once. */
  guideDone: boolean;
}

// --- Audio ---

export interface AudioDevice {
  id: string;
  label: string;
}

export interface OutputStatus {
  /** OBS browser sources connected right now. */
  obsClients: number;
  /** The local port is taken: the OBS browser source cannot be reached. */
  portInUse: boolean;
}

// --- Hotkeys ---

/** off: no key set; active: registered; taken: another program (or another action) already uses the key. */
export type HotkeyState = 'off' | 'active' | 'taken';
/** Per module id, per action of that module. */
export type HotkeyStatus = Record<string, Record<string, HotkeyState>>;

// --- Errors ---

export interface ErrorReport {
  message: string;
  stack?: string;
}

// --- About ---

export interface LicenseEntry {
  name: string;
  version?: string;
  license: string;
  usedFor: string;
  url?: string;
  /** Ships with the app, or an optional download. */
  shipped: 'bundled' | 'download';
  notice?: string;
  text?: string;
}

/**
 * Web pages the app may open (in the browser, on a click; the fixed list in apps/desktop/src/ipc.ts): the setup's
 * help pages, donations and Maldö's channels (the same ids as in GT Toolz).
 */
export type LinkId = 'twitchConsole' | 'twitchSecurity' | 'obs' | 'patreon' | 'paypal' | 'twitch' | 'youtube' | 'facebook' | 'x' | 'instagram';
/** Values the app copies to the clipboard for the user (so the UI never needs clipboard access). */
export type CopyId = 'obsUrl' | 'loginCode';
export type FolderId = 'data' | 'voices' | 'logs';

// --- The bridge ---

/** What a module's part of the preload builds its calls from: invoke and subscribe within its own namespace. */
export interface BridgeScope {
  invoke<T>(name: string, ...args: unknown[]): Promise<T>;
  subscribe<T>(event: string): (listener: (value: T) => void) => Unsubscribe;
}

/** Every module's settings, with the same three calls (the shell answers them, see apps/desktop/src/modules.ts). */
export interface ModuleSettingsApi<S> {
  settings(): Promise<S>;
  /** Applies and saves a change; returns the validated settings. */
  setSettings(change: Partial<S>): Promise<S>;
  /** Settings changed, also by the module itself (e.g. a learned reward). */
  onSettings(listener: (settings: S) => void): Unsubscribe;
}

export function settingsBridge<S>(scope: BridgeScope): ModuleSettingsApi<S> {
  return {
    settings: () => scope.invoke('settings'),
    setSettings: (change) => scope.invoke('setSettings', change),
    onSettings: scope.subscribe('settings'),
  };
}

export interface ShellApi {
  info(): Promise<AppInfo>;
  getConfig(): Promise<AppConfig>;
  /** Applies and saves a change; returns the validated settings. */
  setAppSettings(change: Partial<AppSettings>): Promise<AppSettings>;
  /** App settings changed, also from another place in the UI. */
  onAppSettings(listener: (settings: AppSettings) => void): Unsubscribe;
  /** Switches a module on or off: it starts or stops at once. */
  setModuleEnabled(id: string, enabled: boolean): Promise<Record<string, ModuleState>>;
  onModules(listener: (modules: Record<string, ModuleState>) => void): Unsubscribe;
  setGuideDone(done: boolean): Promise<void>;

  twitchStatus(): Promise<TwitchStatus>;
  onTwitchStatus(listener: (status: TwitchStatus) => void): Unsubscribe;
  /** Checks the Client ID with Twitch and stores it (encrypted). */
  saveTwitchApp(input: TwitchAppInput): Promise<TwitchStatus>;
  /** Forgets the app, the login and its tokens. */
  removeTwitchApp(): Promise<TwitchStatus>;
  /** Starts the login: Twitch gives a code, its page opens in the browser; the status follows by event. */
  twitchLogin(): Promise<void>;
  /** Opens Twitch's page for the running login again (the browser tab was closed). */
  reopenTwitchLogin(): Promise<void>;
  cancelTwitchLogin(): Promise<void>;
  twitchLogout(): Promise<void>;

  outputStatus(): Promise<OutputStatus>;
  onOutputStatus(listener: (status: OutputStatus) => void): Unsubscribe;
  /** The URL for the OBS browser source (contains the access key). */
  obsUrl(): Promise<string>;
  /** A new access key: the old URL stops working. */
  newObsKey(): Promise<string>;
  audioDevices(): Promise<AudioDevice[]>;

  listVoices(): Promise<VoiceChoice[]>;
  voicePackages(): Promise<VoicePackageInfo[]>;
  installVoicePackages(ids: string[]): Promise<void>;
  cancelVoiceInstall(): Promise<void>;
  removeVoicePackages(ids: string[]): Promise<void>;
  onVoiceInstall(listener: (state: InstallState) => void): Unsubscribe;

  hotkeyStatus(): Promise<HotkeyStatus>;
  onHotkeyStatus(listener: (status: HotkeyStatus) => void): Unsubscribe;
  /** While a new key is being recorded, the shortcuts are off (they would catch the keys). */
  suspendHotkeys(suspend: boolean): Promise<void>;

  /** An error in the UI, for the technical log (its stack is mapped to the TypeScript source there). */
  reportError(report: ErrorReport): Promise<void>;

  licenses(): Promise<LicenseEntry[]>;
  openChromiumLicenses(): Promise<void>;
  /** The links that exist (Patreon once there is one). */
  links(): Promise<Partial<Record<LinkId, string>>>;
  openLink(id: LinkId): Promise<void>;
  copyText(id: CopyId): Promise<void>;
  openFolder(id: FolderId): Promise<void>;
}
