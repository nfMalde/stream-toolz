import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { AppConfig, AppInfo, Settings } from '@rmc/api';
import { BRIDGE_AVAILABLE, RMC } from '../core/rmc';

interface SettingsState {
  config: AppConfig | null;
  info: AppInfo | null;
  /** The setup assistant overlay (first start, the navigation, the pages). */
  guideOpen: boolean;
  /** Step the assistant opens at; null: the first. */
  guideStep: string | null;
  error: string | null;
}

/** App configuration and settings; changes are applied right away and saved by the main process. */
export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>({ config: null, info: null, guideOpen: false, guideStep: null, error: null }),
  withComputed(({ config }) => ({
    loaded: computed(() => config() !== null),
    settings: computed(() => config()?.settings ?? null),
    language: computed(() => config()?.settings.language ?? (navigator.language.startsWith('de') ? 'de' : 'en')),
  })),
  withMethods((store, rmc = inject(RMC)) => {
    /** Optimistic: the UI shows the change at once, the main process returns the validated settings. */
    async function update(change: Partial<Settings>): Promise<void> {
      const config = store.config();
      if (!config) return;
      patchState(store, { config: { ...config, settings: { ...config.settings, ...change } }, error: null });
      try {
        const settings = await rmc.setSettings(change);
        patchState(store, { config: { ...store.config()!, settings } });
      } catch (err) {
        patchState(store, { config, error: (err as Error).message });
      }
    }

    async function markGuideDone(): Promise<void> {
      const config = store.config();
      if (!config || config.guideDone) return;
      patchState(store, { config: { ...config, guideDone: true } });
      await rmc.setGuideDone(true);
    }

    return {
      update,

      async load(): Promise<void> {
        const [config, info] = await Promise.all([rmc.getConfig(), rmc.info()]);
        // First start: the setup assistant opens by itself.
        patchState(store, { config, info, guideOpen: !config.guideDone });
      },

      openGuide(step: string | null = null): void {
        patchState(store, { guideOpen: true, guideStep: step });
      },

      async closeGuide(): Promise<void> {
        patchState(store, { guideOpen: false, guideStep: null });
        await markGuideDone();
      },
    };
  }),
  withHooks((store, rmc = inject(RMC)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        // Changes the app makes itself (a learned reward) or from another place in the UI.
        unsubscribe = rmc.onSettings((settings) => {
          const config = store.config();
          if (config) patchState(store, { config: { ...config, settings } });
        });
        void store.load();
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
