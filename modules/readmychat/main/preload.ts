// ReadMyChat's part of the preload (window.stz.readmychat): a fixed set of calls within its own namespace. Bundled
// into the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { ReadMyChatApi, Settings } from '../src/api';

export function readMyChatBridge(scope: BridgeScope): ReadMyChatApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
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
    testOutput: () => invoke('testOutput'),
    previewVoice: (id) => invoke('previewVoice', id),
    languagePacks: () => invoke('languagePacks'),
    onLanguagePacks: subscribe('language-packs'),
    reloadLanguagePacks: () => invoke('reloadLanguagePacks'),
    openLanguagePacksFolder: () => invoke('openLanguagePacksFolder'),
  };
}
