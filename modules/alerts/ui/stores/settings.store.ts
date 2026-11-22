import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { AlertsSettings as Settings } from '@stz/api';

interface AlertsSettingsState {
  settings: Settings | null;
  error: string | null;
}

/** Alerts's settings (the app's own are in the shell's SettingsStore); the main process validates and saves them. */
export const AlertsSettingsStore = signalStore(
  { providedIn: 'root' },
  withState<AlertsSettingsState>({ settings: null, error: null }),
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
        patchState(store, { settings: await stz.alerts.setSettings(change) });
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
        // Changes from another place in the UI.
        unsubscribe = stz.alerts.onSettings((settings) => patchState(store, { settings }));
        void stz.alerts.settings().then((settings) => patchState(store, { settings }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
