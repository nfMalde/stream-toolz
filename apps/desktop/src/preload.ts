// The only bridge between the UI and the main process: a fixed set of calls (window.rmc).
// Runs sandboxed with context isolation; the UI never sees ipcRenderer itself.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { RmcApi, Unsubscribe } from '@stream-toolz/runtime/app-api';

const invoke = <T>(name: string, ...args: unknown[]) => ipcRenderer.invoke(`rmc:${name}`, ...args) as Promise<T>;

function subscribe<T>(channel: string): (listener: (value: T) => void) => Unsubscribe {
  return (listener) => {
    const handler = (_event: IpcRendererEvent, value: T) => listener(value);
    ipcRenderer.on(`rmc:${channel}`, handler);
    return () => ipcRenderer.removeListener(`rmc:${channel}`, handler);
  };
}

const api: RmcApi = {
  info: () => invoke('info'),
  getConfig: () => invoke('getConfig'),
  setSettings: (change) => invoke('setSettings', change),
  onSettings: subscribe('settings'),
  setGuideDone: (done) => invoke('setGuideDone', done),

  twitchStatus: () => invoke('twitchStatus'),
  onTwitchStatus: subscribe('twitch-status'),
  saveTwitchApp: (input) => invoke('saveTwitchApp', input),
  removeTwitchApp: () => invoke('removeTwitchApp'),
  twitchLogin: () => invoke('twitchLogin'),
  reopenTwitchLogin: () => invoke('reopenTwitchLogin'),
  cancelTwitchLogin: () => invoke('cancelTwitchLogin'),
  twitchLogout: () => invoke('twitchLogout'),

  readerStatus: () => invoke('readerStatus'),
  onReaderStatus: subscribe('reader-status'),
  chatLog: () => invoke('chatLog'),
  onChatLog: subscribe('chat-log'),
  pause: () => invoke('pause'),
  resume: () => invoke('resume'),
  skip: () => invoke('skip'),
  clearQueue: () => invoke('clearQueue'),
  removeQueued: (id) => invoke('removeQueued', id),
  testMessage: (text) => invoke('testMessage', text),
  testEvent: (kind) => invoke('testEvent', kind),
  learnReward: () => invoke('learnReward'),
  cancelLearnReward: () => invoke('cancelLearnReward'),

  obsUrl: () => invoke('obsUrl'),
  newObsKey: () => invoke('newObsKey'),
  audioDevices: () => invoke('audioDevices'),
  testOutput: () => invoke('testOutput'),

  listVoices: () => invoke('listVoices'),
  previewVoice: (id) => invoke('previewVoice', id),
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
};

contextBridge.exposeInMainWorld('rmc', api);
