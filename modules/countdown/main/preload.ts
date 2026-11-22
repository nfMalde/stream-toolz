// Countdown's part of the preload (window.stz.countdown): a fixed set of calls within its own namespace. Bundled into the
// sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { CountdownApi } from '../src/api';
import type { Settings } from '../src/settings';

export function countdownBridge(scope: BridgeScope): CountdownApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
    start: (phrase) => invoke('start', phrase),
    pause: (id) => invoke('pause', id),
    resume: (id) => invoke('resume', id),
    adjust: (id, deltaMs) => invoke('adjust', id, deltaMs),
    remove: (id) => invoke('remove', id),
    clear: () => invoke('clear'),
    status: () => invoke('status'),
    onStatus: subscribe('status'),
    copyUrl: () => invoke('copyUrl'),
    openUrl: () => invoke('openUrl'),
    pickFolder: () => invoke('pickFolder'),
    openFolder: () => invoke('openFolder'),
  };
}
