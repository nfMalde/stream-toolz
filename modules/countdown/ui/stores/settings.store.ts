import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { CountdownSettings as Settings } from '@stz/api';

interface CountdownSettingsState {
  settings: Settings | null;
  error: string | null;
}

/** Countdown's settings (the app's own are in the shell's SettingsStore); the main process validates and saves them. */
export const CountdownSettingsStore = signalStore(
  { providedIn: 'root' },
  withState<CountdownSettingsState>({ settings: null, error: null }),
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
        patchState(store, { settings: await stz.countdown.setSettings(change) });
      } catch (err) {
        patchState(store, { settings: before, error: (err as Error).message });
      }
    },
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        // Changes the module makes itself (the timers, a picked folder) or from another place in the UI.
        unsubscribe = stz.countdown.onSettings((settings) => patchState(store, { settings }));
        void stz.countdown.settings().then((settings) => patchState(store, { settings }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
