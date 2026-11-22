// Chat Bot's part of the preload (window.stz.bot): a fixed set of calls within its own namespace. Bundled into the
// sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { BotApi } from '../src/api';
import type { Settings } from '../src/settings';

export function botBridge(scope: BridgeScope): BotApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
    status: () => invoke('status'),
    onStatus: subscribe('status'),
    preview: (commandId, sampleArgs) => invoke('preview', commandId, sampleArgs),
    sendTest: (text) => invoke('sendTest', text),
    resetUses: (commandId) => invoke('resetUses', commandId),
  };
}
