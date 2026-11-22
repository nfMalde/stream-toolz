import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { BotSettings as Settings } from '@stz/api';

interface BotSettingsState {
  settings: Settings | null;
  error: string | null;
}

/** Chat Bot's settings (the app's own are in the shell's SettingsStore); the main process validates and saves them. */
export const BotSettingsStore = signalStore(
  { providedIn: 'root' },
  withState<BotSettingsState>({ settings: null, error: null }),
  withComputed(({ settings }) => ({
    loaded: computed(() => settings() !== null),
    commands: computed(() => settings()?.commands ?? []),
    timers: computed(() => settings()?.timers ?? []),
  })),
  withMethods((store, stz = inject(STZ)) => ({
    /** Optimistic: the UI shows the change at once, the main process returns the validated settings. */
    async update(change: Partial<Settings>): Promise<void> {
      const before = store.settings();
      if (!before) return;
      patchState(store, { settings: { ...before, ...change }, error: null });
      try {
        patchState(store, { settings: await stz.bot.setSettings(change) });
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
        // Changes the module makes itself (the use counts) or from another page.
        unsubscribe = stz.bot.onSettings((settings) => patchState(store, { settings }));
        void stz.bot.settings().then((settings) => patchState(store, { settings }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
