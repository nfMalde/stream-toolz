// The contract between the shell (apps/desktop) and a module's main-process part: what a module declares, and what
// the shell hands it when it starts. A module never imports Electron and never reaches into the shell: everything
// it uses comes from its host, and the host takes it all back when the module stops (switched off, app closing).

import type { CustomReward, TwitchEvents, TwitchFeature } from '@stream-toolz/twitch';
import type { OutputStatus } from './api';
import type { AudioSink } from './audio';
import type { AppSettings } from './settings';

export interface ModuleDefinition<S extends object = object> {
  /** Lower case letters: the key in config.json, the IPC namespace (stz:<id>:…) and window.stz.<id>. */
  readonly id: string;
  /** Switched on in a new install. */
  readonly enabledByDefault: boolean;
  readonly settings: ModuleSettings<S>;
  /** What it reads from Twitch while it is on: the login asks only for the permissions of these features. */
  readonly twitch?: readonly TwitchFeature[];
  /** Called when the module is switched on (at start, or later by the user). */
  start(host: ModuleHost<S>): ModuleInstance<S>;
}

export interface ModuleSettings<S> {
  /** Every setting with its default, for the system's locale ("de-DE"). */
  defaults(locale: string): S;
  /** Turns untrusted input into complete, valid settings: what is missing or invalid keeps its value from base. */
  normalize(value: unknown, base: S): S;
}

/** A running module. The shell calls these; all but stop() are optional. */
export interface ModuleInstance<S> {
  /** The settings changed (in the UI, or by the module itself); the host has saved them and told the UI. */
  settingsChanged?(next: S, before: S): void;
  /** The app's settings changed (language, port, …). */
  appChanged?(next: AppSettings, before: AppSettings): void;
  /** The OBS browser sources connected or left, or the local port is taken or free again. */
  outputChanged?(status: OutputStatus): void;
  /** Voice packages are about to be removed (engines must not run meanwhile), or were installed or removed. */
  voicesChanged?(phase: 'removing' | 'changed'): void;
  /** Switched off or the app closes: stop playing, close engines. Handlers and listeners are removed by the host. */
  stop(): void;
}

export interface ModuleHost<S> {
  readonly id: string;
  readonly dev: boolean;
  /** One line in the technical log (secrets are masked there; never log chat content). */
  log(line: string): void;

  settings(): S;
  /** Validates, saves and announces a change the module makes itself (e.g. a learned reward). */
  updateSettings(change: Partial<S>): Promise<S>;
  app(): AppSettings;

  readonly twitch: ModuleTwitch;
  readonly audio: ModuleAudio;
  readonly speech: ModuleSpeech;
  readonly hotkeys: ModuleHotkeys;
  readonly server: ModuleServer;
  readonly desktop: ModuleDesktop;
  readonly bridge: ModuleBridge;
  /** The module's own folder in the user's profile (files it writes: text files for OBS, sounds). */
  readonly dataDir: string;
}

/**
 * The shell's local server (loopback only), for a module's own browser source: its pages answer under
 * /<id>/<key>/… with the same key as the OBS audio source ("New address" replaces it for every module).
 */
export interface ModuleServer {
  /** The module's requests (the key was checked): rest is the path below /<id>/<key>/, without a leading slash. */
  handle(handler: LocalRequestHandler): void;
  /** The address of the module's page, http://127.0.0.1:<port>/<id>/<key>/ (the port as set now). */
  url(): string;
}

/** A request to the module's part of the local server. Node's http types, named here so a module needs no Electron. */
export type LocalRequestHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, rest: string) => void | Promise<void>;

/** What a module may do on the desktop, through the shell (it never imports Electron). */
export interface ModuleDesktop {
  /** To the clipboard: the UI has no clipboard access. */
  copyText(text: string): void;
  /** A page of the local server in the browser: http://127.0.0.1 or http://localhost only. */
  openLocalPage(url: string): Promise<void>;
  /** The folder in the system's file manager (created if missing). */
  openFolder(folder: string): Promise<void>;
  /** The user picks a folder (a dialog); undefined when they cancel. */
  pickFolder(): Promise<string | undefined>;
  /** The user picks files of the given extensions ("wav", "mp3"); empty when they cancel. */
  pickFiles(extensions: string[]): Promise<string[]>;
}

/** The shell's one Twitch connection: every module hears the same events. */
export interface ModuleTwitch {
  on<E extends keyof TwitchEvents>(event: E, listener: (...args: TwitchEvents[E]) => void): void;
  /** The logged-in account. */
  readonly ownUserId: string | undefined;
  /** Whether the connection is up (the login done and the channel known). */
  readonly connected: boolean;
  /** The channel's custom rewards (the module must declare the feature 'redemptions'). */
  customRewards(): Promise<CustomReward[]>;
  /** A chat message as the logged-in account (the module must declare the feature 'chatWrite'). */
  sendMessage(text: string, replyTo?: string): Promise<void>;
}

/** The shell's outputs. Only one clip plays on each at a time. */
export interface ModuleAudio {
  /** An audio device; deviceId is read on every clip ('' = the system's default). */
  device(deviceId: () => string): AudioSink;
  /** The OBS browser source (the address under Output). */
  readonly obs: AudioSink;
  readonly status: OutputStatus;
}

/** Where voice packages are installed (the shell installs and removes them) and where engines may write. */
export interface ModuleSpeech {
  readonly voicesDir: string;
  readonly workDir: string;
}

/** System-wide shortcuts: the module's actions and their keys (Electron accelerators, '' = off). */
export interface ModuleHotkeys {
  /** Replaces the module's shortcuts; called again whenever its keys change. */
  set(actions: Record<string, { key: string; run: () => void }>): void;
}

/** The module's calls from the UI (stz:<id>:<name>) and its events to the UI. */
export interface ModuleBridge {
  /** Arguments come from the UI: check every one of them. */
  handle(name: string, handler: (...args: unknown[]) => unknown): void;
  send(event: string, value: unknown): void;
}
