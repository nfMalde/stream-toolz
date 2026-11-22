import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { mainLanguage, packFor, type LanguagePackInfo } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import { SettingsStore } from '@shell/stores/settings.store';
import { ReadMyChatSettingsStore } from './settings.store';

interface LanguagePacksState {
  packs: LanguagePackInfo[];
  reloading: boolean;
}

/** The loaded language packs (built in and the user's own files); the main process reads the folder. */
export const LanguagePacksStore = signalStore(
  { providedIn: 'root' },
  withState<LanguagePacksState>({ packs: [], reloading: false }),
  withComputed(({ packs }, settings = inject(ReadMyChatSettingsStore), app = inject(SettingsStore)) => {
    /** The pack of the chat's main language (until ReadMyChat's settings have arrived: the app's language). */
    const main = computed(() => packFor(settings.settings()?.speechLanguage ?? app.language(), packs()));
    return {
      main,
      mainId: computed(() => main()?.id ?? mainLanguage(settings.settings()?.speechLanguage ?? app.language(), packs())),
      /** The main language's pack first, then the others in the loaded order. */
      ordered: computed(() => {
        const first = main();
        return first ? [first, ...packs().filter((p) => p !== first)] : packs();
      }),
    };
  }),
  withMethods((store, stz = inject(STZ).readmychat) => ({
    async load(): Promise<void> {
      patchState(store, { packs: await stz.languagePacks() });
    },
    /** The folder was changed by hand: read it again (the main process also announces the result). */
    async reload(): Promise<void> {
      patchState(store, { reloading: true });
      try {
        patchState(store, { packs: await stz.reloadLanguagePacks() });
      } finally {
        patchState(store, { reloading: false });
      }
    },
    openFolder: () => stz.openLanguagePacksFolder(),
  })),
  withHooks((store, stz = inject(STZ).readmychat) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.onLanguagePacks((packs) => patchState(store, { packs }));
        void store.load();
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
