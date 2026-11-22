// Channel Points' part of the preload (window.stz.channelpoints): a fixed set of calls within its own namespace. Bundled
// into the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@stream-toolz/core/api';
import type { ChannelpointsApi } from '../src/api';
import type { Settings } from '../src/settings';

export function channelpointsBridge(scope: BridgeScope): ChannelpointsApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<Settings>(scope),
    rewards: () => invoke('rewards'),
    status: () => invoke('status'),
    onStatus: subscribe('status'),
    test: (rewardId) => invoke('test', rewardId),
    preview: (name) => invoke('preview', name),
    pickSounds: () => invoke('pickSounds'),
    removeSound: (name) => invoke('removeSound', name),
    openSoundsFolder: () => invoke('openSoundsFolder'),
  };
}
