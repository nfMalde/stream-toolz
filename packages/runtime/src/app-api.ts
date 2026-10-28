// The contract between the UI and the main process (window.rmc, see apps/desktop/src/preload.ts).
// Types only (plus a few constants), so the UI can import it without pulling in Node code.

import type { ChannelEventKind } from './chat/event-kind';
import type { ChatLanguage } from './chat/language';
import type { HotkeyAction, Settings } from './settings';

export type { ChatLanguage } from './chat/language';
export type { ChannelEventKind, EventGroup } from './chat/event-kind';

export type { Audience, HotkeyAction, LinkHandling, OutputMode, ReadNames, Settings } from './settings';
/** Pure checks and texts the UI shares with the main process (these files have no Node imports). */
export { HOTKEY_ACTIONS, isValidHotkey } from './settings';
export { CHANNEL_EVENT_KINDS, EVENT_GROUPS, groupOf } from './chat/event-kind';
export { defaultEventText } from './spoken';

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
  dataDir: string;
  dev: boolean;
  platform: Platform;
  /**
   * How the Twitch app data is stored: 'os' = encrypted by the system (Windows: DPAPI, macOS: Keychain,
   * Linux: Secret Service), 'none' = no encryption available (kept in memory only, never written).
   */
  encryption: 'os' | 'none';
}

export interface AppConfig {
  settings: Settings;
  /** The setup assistant was finished (or closed) once. */
  guideDone: boolean;
}

// --- Twitch ---

export type TwitchStage = 'no-app' | 'logged-out' | 'logging-in' | 'connecting' | 'connected' | 'error';

export type TwitchError =
  | 'invalid-client'
  | 'login-denied'
  | 'login-timeout'
  | 'token-invalid'
  | 'missing-scope'
  | 'channel-unknown'
  | 'subscription-failed'
  | 'network'
  | 'unknown';

export interface TwitchAccount {
  id: string;
  login: string;
  name: string;
}

export interface TwitchStatus {
  stage: TwitchStage;
  /** The Client ID of the streamer's own app (type "Public") is stored. */
  hasApp: boolean;
  /** The last characters of the Client ID, so the user can tell which app is stored. */
  clientIdHint?: string;
  /** The account that logged in. */
  user?: TwitchAccount;
  /** The channel whose chat is read (the own one unless another is set). */
  channel?: TwitchAccount;
  /** While logging in: the code to confirm on Twitch, and the page (code filled in). */
  login?: { userCode: string; verificationUri: string; expiresAt: number };
  error?: TwitchError;
  /** Twitch's own message for an error, if it sent one. */
  message?: string;
  /**
   * While connected: follows arrive ('active'), the login is older than the follower permission ('needs-login'),
   * or the account may not see the channel's followers (not its own channel and not a moderator: 'unavailable').
   */
  follows?: 'active' | 'needs-login' | 'unavailable';
}

/** The streamer's own app, registered as "Public": only its Client ID (there is no secret). */
export interface TwitchAppInput {
  clientId: string;
}

// --- Reader ---

export type ReaderState = 'off' | 'idle' | 'reading' | 'paused' | 'waiting-output' | 'no-voice';

export interface QueuedItem {
  id: string;
  name: string;
  /** The message as it was written. */
  text: string;
  /** What the voice says. */
  spoken: string;
  /** Read in this language. */
  language: ChatLanguage;
  /** When the message may be read (mod delay). */
  readyAt: number;
  test?: boolean;
  /** A follow, sub, raid, …: `spoken` is the whole announcement. */
  event?: ChannelEventKind;
}

export interface ReaderStatus {
  state: ReaderState;
  current?: QueuedItem;
  queued: QueuedItem[];
  /** OBS browser sources connected right now. */
  obsClients: number;
  /** The local port is taken: the OBS browser source cannot be reached. */
  portInUse: boolean;
  /** The voice that reads (display id), if one is ready. */
  voice?: string;
  /** The reward is being learned: the next channel points message with text sets it. */
  learningReward: boolean;
}

export type SkipReason =
  | 'command'
  | 'ignored-user'
  | 'own-message'
  | 'audience'
  | 'reward'
  | 'duplicate'
  | 'user-limit'
  | 'blocked-word'
  | 'link'
  | 'emote-only'
  | 'empty'
  | 'shared-chat'
  | 'deleted'
  | 'user-cleared'
  | 'chat-cleared'
  | 'queue-full'
  | 'cleared'
  | 'removed'
  | 'speech-failed'
  | 'event-off'
  | 'follow-limit';

export interface ChatLogEntry {
  id: string;
  at: number;
  name: string;
  text: string;
  outcome: 'queued' | 'read' | 'skipped';
  reason?: SkipReason;
  test?: boolean;
  event?: ChannelEventKind;
}

// --- Audio ---

export interface AudioDevice {
  id: string;
  label: string;
}

// --- Voices ---

export type VoiceEngine = 'onecore' | 'sapi' | 'piper' | 'sherpa';

export interface VoiceChoice {
  /** Windows voice name, or "piper:…" / "kokoro:…". */
  id: string;
  engine: VoiceEngine;
  /** BCP 47 ("de-DE"). */
  language: string;
  gender?: string;
  /** Optional voices need their package; Windows voices are always installed. */
  installed: boolean;
  packageId?: string;
  /** Display name when the id is not readable ("Jan"). */
  label?: string;
}

export interface VoicePackageInfo {
  id: string;
  kind: 'engine' | 'model' | 'voice';
  engine: 'piper' | 'sherpa';
  name: string;
  license: string;
  source: string;
  language?: string;
  gender?: string;
  dataset?: string;
  requires?: string;
  /** Voice ids the package provides. */
  voices: string[];
  languages: string[];
  sizeBytes: number;
  installed: boolean;
  /** Ticked in the first-start choice for the app language (the user can untick it). */
  preselected: boolean;
}

export interface InstallProgress {
  packageId: string;
  phase: 'download' | 'extract' | 'installed';
  /** Bytes downloaded over all packages of this install, and the total. */
  receivedBytes: number;
  totalBytes: number;
}

export type InstallState =
  | { state: 'idle' }
  | { state: 'installing'; ids: string[]; progress?: InstallProgress }
  | { state: 'done'; ids: string[] }
  | { state: 'cancelled' }
  | { state: 'error'; message: string };

// --- Hotkeys ---

/** off: no key set; active: registered; taken: another program (or another action) already uses the key. */
export type HotkeyState = 'off' | 'active' | 'taken';
export type HotkeyStatus = Record<HotkeyAction, HotkeyState>;

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

export interface RmcApi {
  info(): Promise<AppInfo>;
  getConfig(): Promise<AppConfig>;
  /** Applies and saves a change; returns the validated settings. */
  setSettings(change: Partial<Settings>): Promise<Settings>;
  /** Settings changed, also by the app itself (e.g. a learned reward). */
  onSettings(listener: (settings: Settings) => void): Unsubscribe;
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

  readerStatus(): Promise<ReaderStatus>;
  onReaderStatus(listener: (status: ReaderStatus) => void): Unsubscribe;
  chatLog(): Promise<ChatLogEntry[]>;
  onChatLog(listener: (entry: ChatLogEntry) => void): Unsubscribe;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  clearQueue(): Promise<void>;
  removeQueued(id: string): Promise<void>;
  /** Reads a text as if it came from the chat (filters included). */
  testMessage(text: string): Promise<void>;
  /** Reads an example of the event with its current text (also when the event is switched off). */
  testEvent(kind: ChannelEventKind): Promise<void>;
  /** The next channel points message with text sets the reward to read. */
  learnReward(): Promise<void>;
  cancelLearnReward(): Promise<void>;

  /** The URL for the OBS browser source (contains the access key). */
  obsUrl(): Promise<string>;
  /** A new access key: the old URL stops working. */
  newObsKey(): Promise<string>;
  audioDevices(): Promise<AudioDevice[]>;
  /** A short test sentence on the chosen output. */
  testOutput(): Promise<void>;

  listVoices(): Promise<VoiceChoice[]>;
  previewVoice(id: string): Promise<void>;
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
