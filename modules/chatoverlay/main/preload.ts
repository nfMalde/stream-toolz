// Chat Overlay's part of the preload (window.stz.chatoverlay): a fixed set of calls within its own namespace. Bundled into the
// sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { ChatoverlayApi } from '../src/api';
import type { Settings } from '../src/settings';

export function chatoverlayBridge(scope: BridgeScope): ChatoverlayApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
    status: () => invoke('status'),
    onItem: subscribe('item'),
    onRemoved: subscribe('removed'),
    onCleared: subscribe('cleared'),
    onClients: subscribe('clients'),
    copyUrl: () => invoke('copyUrl'),
    openUrl: () => invoke('openUrl'),
    testMessages: () => invoke('testMessages'),
  };
}
