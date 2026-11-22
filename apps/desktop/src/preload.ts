// The only bridge between the UI and the main process: a fixed set of calls (window.stz), the shell's and one
// namespace per built-in module (window.stz.<id>, built by the module's own part, e.g. readmychat/main/preload.ts).
// Runs sandboxed with context isolation; the UI never sees ipcRenderer itself.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BridgeScope } from '@stream-toolz/core/api';
import { READMYCHAT } from '@stream-toolz/readmychat/api';
import { readMyChatBridge } from '@stream-toolz/readmychat/preload';
import { COUNTDOWN } from '@stream-toolz/countdown/api';
import { countdownBridge } from '@stream-toolz/countdown/preload';
import { CHATOVERLAY } from '@stream-toolz/chatoverlay/api';
import { chatoverlayBridge } from '@stream-toolz/chatoverlay/preload';
import { ALERTS } from '@stream-toolz/alerts/api';
import { alertsBridge } from '@stream-toolz/alerts/preload';
import { CHANNELPOINTS } from '@stream-toolz/channelpoints/api';
import { channelpointsBridge } from '@stream-toolz/channelpoints/preload';
import { BOT } from '@stream-toolz/bot/api';
import { botBridge } from '@stream-toolz/bot/preload';
import type { StzApi, Unsubscribe } from './bridge-api';

const invoke = <T>(name: string, ...args: unknown[]) => ipcRenderer.invoke(`stz:${name}`, ...args) as Promise<T>;

function subscribe<T>(channel: string): (listener: (value: T) => void) => Unsubscribe {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, value: T) => listener(value);
    ipcRenderer.on(`stz:${channel}`, handler);
    return () => ipcRenderer.removeListener(`stz:${channel}`, handler);
  };
}

/** A module's namespace: its calls are stz:<id>:<name>, its events stz:<id>:<event>. */
const scope = (id: string): BridgeScope => ({
  invoke: <T>(name: string, ...args: unknown[]) => invoke<T>(`${id}:${name}`, ...args),
  subscribe: <T>(event: string) => subscribe<T>(`${id}:${event}`),
});

const api: StzApi = {
  info: () => invoke('info'),
  getConfig: () => invoke('getConfig'),
  setAppSettings: (change) => invoke('setAppSettings', change),
  onAppSettings: subscribe('app-settings'),
  setModuleEnabled: (id, enabled) => invoke('setModuleEnabled', id, enabled),
  onModules: subscribe('modules'),
  setGuideDone: (done) => invoke('setGuideDone', done),

  twitchStatus: () => invoke('twitchStatus'),
  onTwitchStatus: subscribe('twitch-status'),
  saveTwitchApp: (input) => invoke('saveTwitchApp', input),
  removeTwitchApp: () => invoke('removeTwitchApp'),
  twitchLogin: () => invoke('twitchLogin'),
  reopenTwitchLogin: () => invoke('reopenTwitchLogin'),
  cancelTwitchLogin: () => invoke('cancelTwitchLogin'),
  twitchLogout: () => invoke('twitchLogout'),

  outputStatus: () => invoke('outputStatus'),
  onOutputStatus: subscribe('output-status'),
  obsUrl: () => invoke('obsUrl'),
  newObsKey: () => invoke('newObsKey'),
  audioDevices: () => invoke('audioDevices'),

  listVoices: () => invoke('listVoices'),
  voicePackages: () => invoke('voicePackages'),
  installVoicePackages: (ids) => invoke('installVoicePackages', ids),
  cancelVoiceInstall: () => invoke('cancelVoiceInstall'),
  removeVoicePackages: (ids) => invoke('removeVoicePackages', ids),
  onVoiceInstall: subscribe('voice-install'),

  hotkeyStatus: () => invoke('hotkeyStatus'),
  onHotkeyStatus: subscribe('hotkey-status'),
  suspendHotkeys: (suspend) => invoke('suspendHotkeys', suspend),

  reportError: (report) => invoke('reportError', report),

  licenses: () => invoke('licenses'),
  openChromiumLicenses: () => invoke('openChromiumLicenses'),
  links: () => invoke('links'),
  openLink: (id) => invoke('openLink', id),
  copyText: (id) => invoke('copyText', id),
  openFolder: (id) => invoke('openFolder', id),

  [READMYCHAT]: readMyChatBridge(scope(READMYCHAT)),
  [COUNTDOWN]: countdownBridge(scope(COUNTDOWN)),
  [CHATOVERLAY]: chatoverlayBridge(scope(CHATOVERLAY)),
  [ALERTS]: alertsBridge(scope(ALERTS)),
  [CHANNELPOINTS]: channelpointsBridge(scope(CHANNELPOINTS)),
  [BOT]: botBridge(scope(BOT)),
};

contextBridge.exposeInMainWorld('stz', api);
