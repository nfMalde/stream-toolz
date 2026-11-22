import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { ChannelpointsSettings as Settings, RewardSettings } from '@stream-toolz/channelpoints/api';

interface ChannelpointsSettingsState {
  settings: Settings | null;
  error: string | null;
}

/** Channel Points' settings (the app's own are in the shell's SettingsStore); the main process validates and saves them. */
export const ChannelpointsSettingsStore = signalStore(
  { providedIn: 'root' },
  withState<ChannelpointsSettingsState>({ settings: null, error: null }),
  withComputed(({ settings }) => ({
    loaded: computed(() => settings() !== null),
  })),
  withMethods((store, stz = inject(STZ)) => ({
    /** Optimistic: the UI shows the change at once, the main process returns the validated settings. */
    async update(change: Partial<Settings>): Promise<void> {
      const before = store.settings();
      if (!before) return;
      patchState(store, { settings: { ...before, ...change }, error: null });
      try {
        patchState(store, { settings: await stz.channelpoints.setSettings(change) });
      } catch (err) {
        patchState(store, { settings: before, error: (err as Error).message });
      }
    },
  })),
  withMethods((store) => ({
    /** One reward's settings; the whole map is sent, as the settings keep rewards by id. */
    updateReward(id: string, base: RewardSettings, change: Partial<RewardSettings>): Promise<void> {
      const rewards = store.settings()?.rewards ?? {};
      return store.update({ rewards: { ...rewards, [id]: { ...base, ...change } } });
    },
    removeReward(id: string): Promise<void> {
      const rewards = { ...(store.settings()?.rewards ?? {}) };
      delete rewards[id];
      return store.update({ rewards });
    },
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.channelpoints.onSettings((settings) => patchState(store, { settings }));
        void stz.channelpoints.settings().then((settings) => patchState(store, { settings }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
