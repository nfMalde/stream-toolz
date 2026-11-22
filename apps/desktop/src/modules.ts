// The built-in modules and their hosts. A module starts when it is switched on and gets only what the shell offers
// (packages/core/src/module.ts): its settings, the Twitch events, the audio outputs, shortcuts and its own IPC
// namespace (stz:<id>:…). When it stops, the shell takes all of that back. The shell keeps every module's settings
// in config.json and answers its settings calls, also while the module is off.

import type { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { asObject, type AppSettings, type ModuleDefinition, type ModuleDesktop, type ModuleHost, type ModuleInstance, type ModuleState, type OutputStatus } from '@stream-toolz/core';
import { readMyChat } from '@stream-toolz/readmychat/main';
import { countdownModule } from '@stream-toolz/countdown/main';
import { chatoverlayModule } from '@stream-toolz/chatoverlay/main';
import { alertsModule } from '@stream-toolz/alerts/main';
import { channelpointsModule } from '@stream-toolz/channelpoints/main';
import { botModule } from '@stream-toolz/bot/main';
import { TWITCH_FEATURES, type TwitchConnection, type TwitchFeature } from '@stream-toolz/twitch';
import type { DeviceAudio } from './audio';
import { handle } from './bridge';
import type { StoredModule } from './config';
import type { Hotkeys } from './hotkeys';
import type { LocalServer } from './local-server';
import { errorText } from './logger';
import type { ObsOutput } from './obs';

/** Every module that ships with the app, in the order of the navigation. */
export const MODULES: readonly ModuleDefinition[] = [readMyChat, countdownModule, chatoverlayModule, alertsModule, channelpointsModule, botModule];

/** What the shell gives its modules. */
export interface Shell {
  dev: boolean;
  /** The system's locale, for the defaults of a first start. */
  locale: string;
  app: () => AppSettings;
  stored: (id: string) => StoredModule | undefined;
  save: (id: string, module: Required<StoredModule>) => void;
  twitch: TwitchConnection;
  device: DeviceAudio;
  obs: ObsOutput;
  outputStatus: () => OutputStatus;
  hotkeys: Hotkeys;
  server: LocalServer;
  /** The address of a module's page on the local server, with the key. */
  serverUrl: (id: string) => string;
  desktop: ModuleDesktop;
  dirs: { voices: string; work: string; data: string };
  log: (line: string) => void;
  send: (channel: string, value: unknown) => void;
}

interface Entry {
  definition: ModuleDefinition;
  enabled: boolean;
  settings: object;
  running?: { instance: ModuleInstance<object>; cleanup: (() => void)[] };
}

export class Modules {
  private readonly entries: Entry[];

  constructor(
    private readonly shell: Shell,
    definitions: readonly ModuleDefinition[] = MODULES,
  ) {
    this.entries = definitions.map((definition) => {
      const stored = shell.stored(definition.id);
      return {
        definition,
        enabled: stored?.enabled ?? definition.enabledByDefault,
        settings: definition.settings.normalize(stored?.settings, definition.settings.defaults(shell.locale)),
      };
    });
    for (const entry of this.entries) {
      const id = entry.definition.id;
      handle(`stz:${id}:settings`, () => entry.settings);
      handle(`stz:${id}:setSettings`, (change) => this.updateSettings(entry, asObject(change)));
    }
  }

  get states(): Record<string, ModuleState> {
    return Object.fromEntries(this.entries.map((entry) => [entry.definition.id, { enabled: entry.enabled }]));
  }

  startEnabled(): void {
    for (const entry of this.entries) if (entry.enabled) this.start(entry);
  }

  /** What the modules that are on read from Twitch (the login asks for these permissions only). */
  twitchFeatures(): TwitchFeature[] {
    const wanted = new Set(this.entries.filter((entry) => entry.enabled).flatMap((entry) => entry.definition.twitch ?? []));
    return TWITCH_FEATURES.filter((feature) => wanted.has(feature));
  }

  /** Switched on or off by the user: saved, and the module starts or stops at once. */
  setEnabled(id: string, enabled: boolean): Record<string, ModuleState> {
    const entry = this.entries.find((e) => e.definition.id === id);
    if (entry && entry.enabled !== enabled) {
      const features = this.twitchFeatures().join();
      entry.enabled = enabled;
      this.save(entry);
      if (enabled) this.start(entry);
      else this.stop(entry);
      this.shell.log(`MODULES   ${id} ${enabled ? 'on' : 'off'}`);
      // Other features: the subscriptions change (or wait for a login that allows them).
      if (this.twitchFeatures().join() !== features) this.shell.twitch.reconnect();
      this.shell.send('stz:modules', this.states);
    }
    return this.states;
  }

  outputChanged(status: OutputStatus): void {
    for (const entry of this.entries) entry.running?.instance.outputChanged?.(status);
  }

  voicesChanged(phase: 'removing' | 'changed'): void {
    for (const entry of this.entries) entry.running?.instance.voicesChanged?.(phase);
  }

  appChanged(next: AppSettings, before: AppSettings): void {
    for (const entry of this.entries) entry.running?.instance.appChanged?.(next, before);
  }

  stopAll(): void {
    for (const entry of this.entries) this.stop(entry);
  }

  /** Validated by the module, saved, passed to the running module and announced to the UI. */
  private async updateSettings(entry: Entry, change: object): Promise<object> {
    const before = entry.settings;
    const next = entry.definition.settings.normalize({ ...before, ...change }, before);
    entry.settings = next;
    this.save(entry);
    entry.running?.instance.settingsChanged?.(next, before);
    this.shell.send(`stz:${entry.definition.id}:settings`, next);
    return next;
  }

  private save(entry: Entry): void {
    this.shell.save(entry.definition.id, { enabled: entry.enabled, settings: entry.settings });
  }

  private start(entry: Entry): void {
    if (entry.running) return;
    const shell = this.shell;
    const id = entry.definition.id;
    const cleanup: (() => void)[] = [() => shell.hotkeys.remove(id), () => shell.server.unmount(id)];
    const dataDir = path.join(shell.dirs.data, 'modules', id);
    fs.mkdirSync(dataDir, { recursive: true });
    const host: ModuleHost<object> = {
      id,
      dev: shell.dev,
      log: shell.log,
      settings: () => entry.settings,
      updateSettings: (change) => this.updateSettings(entry, change),
      app: shell.app,
      twitch: {
        on: (event, listener) => {
          // As a plain emitter: TypeScript cannot narrow the generic event name of the typed one here.
          const emitter: EventEmitter = shell.twitch;
          emitter.on(event, listener);
          cleanup.push(() => emitter.off(event, listener));
        },
        get ownUserId() {
          return shell.twitch.ownUserId;
        },
        get connected() {
          return shell.twitch.status.stage === 'connected';
        },
        customRewards: () => {
          if (!entry.definition.twitch?.includes('redemptions')) throw new Error(`${id} does not read redemptions`);
          return shell.twitch.customRewards();
        },
        sendMessage: (text, replyTo) => {
          if (!entry.definition.twitch?.includes('chatWrite')) throw new Error(`${id} does not write chat`);
          return shell.twitch.sendMessage(text, replyTo);
        },
      },
      audio: {
        device: (deviceId) => ({
          ready: shell.device.ready,
          play: (wav, volume) => shell.device.play(wav, volume, deviceId()),
          stop: () => shell.device.stop(),
        }),
        obs: shell.obs,
        get status() {
          return shell.outputStatus();
        },
      },
      speech: { voicesDir: shell.dirs.voices, workDir: shell.dirs.work },
      hotkeys: { set: (actions) => shell.hotkeys.set(id, actions) },
      server: { handle: (handler) => shell.server.mount(id, handler), url: () => shell.serverUrl(id) },
      desktop: shell.desktop,
      dataDir,
      bridge: {
        handle: (name, handler) => void cleanup.push(handle(`stz:${id}:${name}`, handler)),
        send: (event, value) => shell.send(`stz:${id}:${event}`, value),
      },
    };
    try {
      entry.running = { instance: entry.definition.start(host), cleanup };
      shell.log(`MODULES   ${id} started`);
    } catch (err) {
      // One module failing must not take the app down: it stays off until the next start.
      shell.log(`ERROR     module ${id} could not start: ${errorText(err)}`);
      for (const undo of cleanup.reverse()) undo();
    }
  }

  private stop(entry: Entry): void {
    const running = entry.running;
    if (!running) return;
    entry.running = undefined;
    try {
      running.instance.stop();
    } catch (err) {
      this.shell.log(`ERROR     module ${entry.definition.id} could not stop: ${errorText(err)}`);
    }
    for (const undo of running.cleanup.reverse()) undo();
  }
}
