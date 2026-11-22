import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { AppConfig, AppInfo, AppSettings, ModuleState } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '../core/stz';

interface SettingsState {
  config: AppConfig | null;
  info: AppInfo | null;
  /** The setup assistant overlay (first start, the navigation, the pages). */
  guideOpen: boolean;
  /** Step the assistant opens at; null: the first. */
  guideStep: string | null;
  error: string | null;
}

/**
 * The app's configuration: its own settings and which modules are on (each module keeps its settings in its own
 * store). Changes are applied right away and saved by the main process.
 */
export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>({ config: null, info: null, guideOpen: false, guideStep: null, error: null }),
  withComputed(({ config }) => ({
    loaded: computed(() => config() !== null),
    settings: computed(() => config()?.app ?? null),
    language: computed(() => config()?.app.language ?? (navigator.language.startsWith('de') ? 'de' : 'en')),
    modules: computed<Record<string, ModuleState>>(() => config()?.modules ?? {}),
  })),
  withMethods((store, stz = inject(STZ)) => {
    let markLoaded = () => {};
    const loaded = new Promise<void>((resolve) => (markLoaded = resolve));

    /** Optimistic: the UI shows the change at once, the main process returns the validated settings. */
    async function update(change: Partial<AppSettings>): Promise<void> {
      const config = store.config();
      if (!config) return;
      patchState(store, { config: { ...config, app: { ...config.app, ...change } }, error: null });
      try {
        const app = await stz.setAppSettings(change);
        patchState(store, { config: { ...store.config()!, app } });
      } catch (err) {
        patchState(store, { config, error: (err as Error).message });
      }
    }

    async function markGuideDone(): Promise<void> {
      const config = store.config();
      if (!config || config.guideDone) return;
      patchState(store, { config: { ...config, guideDone: true } });
      await stz.setGuideDone(true);
    }

    return {
      update,

      /** Resolves once the configuration has arrived (the route guards wait for it). */
      whenLoaded: (): Promise<void> => loaded,

      /** A module is on (false while the configuration is not loaded yet). */
      moduleEnabled(id: string): boolean {
        return store.modules()[id]?.enabled ?? false;
      },

      async setModuleEnabled(id: string, enabled: boolean): Promise<void> {
        const config = store.config();
        if (!config) return;
        patchState(store, { config: { ...config, modules: { ...config.modules, [id]: { enabled } } } });
        const modules = await stz.setModuleEnabled(id, enabled);
        patchState(store, { config: { ...store.config()!, modules } });
      },

      async load(): Promise<void> {
        const [config, info] = await Promise.all([stz.getConfig(), stz.info()]);
        // First start: the setup assistant opens by itself.
        patchState(store, { config, info, guideOpen: !config.guideDone });
        markLoaded();
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
  withHooks((store, stz = inject(STZ)) => {
    const unsubscribe: (() => void)[] = [];
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        // Changes from another place in the UI, or a module switched on or off elsewhere.
        unsubscribe.push(
          stz.onAppSettings((app) => {
            const config = store.config();
            if (config) patchState(store, { config: { ...config, app } });
          }),
          stz.onModules((modules) => {
            const config = store.config();
            if (config) patchState(store, { config: { ...config, modules } });
          }),
        );
        void store.load();
      },
      onDestroy() {
        for (const off of unsubscribe) off();
      },
    };
  }),
);
