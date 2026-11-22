// Alerts's part of the preload (window.stz.alerts): a fixed set of calls within its own namespace. Bundled into the
// sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { AlertsApi } from '../src/api';
import type { Settings } from '../src/settings';

export function alertsBridge(scope: BridgeScope): AlertsApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
    status: () => invoke('status'),
    onStatus: subscribe('status'),
    test: (kind) => invoke('test', kind),
    clear: () => invoke('clear'),
    pickSounds: () => invoke('pickSounds'),
    removeSound: (name) => invoke('removeSound', name),
    preview: (name) => invoke('preview', name),
    copyUrl: () => invoke('copyUrl'),
    openUrl: () => invoke('openUrl'),
  };
}
