// Channel Points in the main process: a sound per redeemed reward on the shell's Twitch connection, its calls from
// the UI (window.stz.channelpoints) and its sounds folder. Everything it uses comes from its host
// (packages/core/src/module.ts); the shell takes handlers and listeners back when it stops.

import fs from 'node:fs';
import path from 'node:path';
import { asString, type ModuleDefinition } from '@stream-toolz/core';
import { CHANNELPOINTS, type ChannelpointsStatus, type RewardsResult } from '../src/api';
import { PlayerQueue } from '../src/player-queue';
import { defaultSettings, normalizeSettings, REWARD_ID, SOUND_EXTENSIONS, type Settings } from '../src/settings';
import { SoundLibrary } from './sounds';

/** Files dropped into the folder by hand come in bursts: the UI hears about them once. */
const WATCH_DEBOUNCE_MS = 300;

export const channelpointsModule: ModuleDefinition<Settings> = {
  id: CHANNELPOINTS,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },
  // Redemptions and the reward list; the broadcaster's own channel only.
  twitch: ['redemptions'],

  start(host) {
    const settings = () => host.settings();
    const device = host.audio.device(() => settings().deviceId);
    const sink = () => (settings().output === 'obs' ? host.audio.obs : device);
    const sounds = new SoundLibrary(path.join(host.dataDir, 'sounds'));

    const queue = new PlayerQueue({ settings, sink, sound: (name) => sounds.get(name), log: host.log });
    host.twitch.on('redemption', (redemption) => queue.receive(redemption));

    // --- Calls from the UI and events to it ---
    const { handle, send } = host.bridge;
    const status = async (): Promise<ChannelpointsStatus> => ({ sounds: await sounds.list(), log: queue.log, queued: queue.queued });
    const announce = () => void status().then((value) => send('status', value));
    queue.on('change', announce);

    handle('status', status);
    handle('rewards', rewards);
    handle('test', (rewardId) => {
      const id = asString(rewardId);
      if (REWARD_ID.test(id)) queue.test(id);
    });
    // Previews are for the user's own ears: always on the audio device, never on the stream.
    handle('preview', async (name) => {
      const sound = await sounds.get(asString(name));
      if (!sound) throw new Error('no-sound');
      device.stop();
      void device.play(sound, settings().volume / 100);
    });
    handle('pickSounds', async () => {
      const files = await host.desktop.pickFiles([...SOUND_EXTENSIONS]);
      const result = await sounds.add(files);
      if (result.added.length) host.log(`CHANNELPOINTS ${result.added.length} sound(s) added`);
      announce();
      return result;
    });
    handle('removeSound', async (name) => {
      await sounds.remove(asString(name));
      announce();
    });
    handle('openSoundsFolder', () => host.desktop.openFolder(sounds.dir));

    async function rewards(): Promise<RewardsResult> {
      if (!host.twitch.connected) return { error: 'not-connected' };
      try {
        const list = await host.twitch.customRewards();
        return { rewards: list.map(({ id, title, cost, enabled }) => ({ id, title, cost, enabled })) };
      } catch (err) {
        // Twitch answers 401 when the login lacks the permission, 403 when the account may not read the channel's
        // points (not the broadcaster, or no affiliate/partner).
        const status = (err as { status?: unknown }).status;
        if (status === 401) return { error: 'needs-login' };
        if (status === 403) return { error: 'unavailable' };
        host.log(`CHANNELPOINTS rewards: ${(err as Error).message}`);
        return { error: (err as Error).message || 'failed' };
      }
    }

    // Files the user puts into the folder by hand (through "Open folder") show up without a restart.
    let watcher: fs.FSWatcher | undefined;
    let watchTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      watcher = fs.watch(sounds.dir, () => {
        clearTimeout(watchTimer);
        watchTimer = setTimeout(announce, WATCH_DEBOUNCE_MS);
      });
      watcher.on('error', () => undefined);
    } catch {
      watcher = undefined;
    }

    host.log(`CHANNELPOINTS started`);

    return {
      settingsChanged(next, before) {
        if (next.output !== before.output) (before.output === 'obs' ? host.audio.obs : device).stop();
      },
      stop() {
        clearTimeout(watchTimer);
        watcher?.close();
        queue.stop();
        device.stop();
      },
    };
  },
};
