import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { primaryLanguage, type InstallState, type VoiceChoice, type VoicePackageInfo } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import { LanguagePacksStore } from './language-packs.store';

interface VoicesState {
  voices: VoiceChoice[];
  packages: VoicePackageInfo[];
  /** Packages ticked for installation (voices and models; their engines come along). */
  selected: string[];
  /** The user changed the selection; the language's preselection no longer applies. */
  touched: boolean;
  install: InstallState;
  previewing: string | null;
  loading: boolean;
}

/** A package as offered to the user: a voice or model, with the engine it needs if that is still missing. */
export interface OfferedPackage {
  pkg: VoicePackageInfo;
  engine?: VoicePackageInfo;
  /** Download size including the missing engine. */
  sizeBytes: number;
}

/** Voices and optional voice packages (from GT Toolz). Nothing is downloaded before the user clicks Install. */
export const VoicesStore = signalStore(
  { providedIn: 'root' },
  withState<VoicesState>({ voices: [], packages: [], selected: [], touched: false, install: { state: 'idle' }, previewing: null, loading: false }),
  withComputed(({ voices, packages, selected, install }, languagePacks = inject(LanguagePacksStore)) => {
    /** The chat's main language ("de") decides which voice packages the assistant offers. */
    const language = computed(() => primaryLanguage(languagePacks.main()?.locale ?? languagePacks.mainId()));
    const offered = computed<OfferedPackage[]>(() => {
      const byId = new Map(packages().map((p) => [p.id, p]));
      return packages()
        .filter((p) => p.kind !== 'engine')
        .map((pkg) => {
          const engine = pkg.requires ? byId.get(pkg.requires) : undefined;
          return { pkg, engine, sizeBytes: pkg.sizeBytes + (engine && !engine.installed ? engine.sizeBytes : 0) };
        });
    });
    /** Installed voices per language pack id: those whose language matches the pack's locale ("de-DE" → "de"). */
    const installedFor = computed<Record<string, VoiceChoice[]>>(() =>
      Object.fromEntries(languagePacks.packs().map((pack) => [pack.id, voices().filter((v) => v.installed && primaryLanguage(v.language) === primaryLanguage(pack.locale))])),
    );
    return {
      language,
      offered,
      installedFor,
      /** The main language has an installed voice. */
      hasInstalledVoice: computed(() => (installedFor()[languagePacks.mainId()]?.length ?? 0) > 0),
      /** Download size of the selection; an engine needed by several packages counts once. */
      selectedBytes: computed(() => {
        const ids = new Set<string>();
        for (const offer of offered()) {
          if (!selected().includes(offer.pkg.id) || offer.pkg.installed) continue;
          ids.add(offer.pkg.id);
          if (offer.engine && !offer.engine.installed) ids.add(offer.engine.id);
        }
        return packages()
          .filter((p) => ids.has(p.id))
          .reduce((sum, p) => sum + p.sizeBytes, 0);
      }),
      installing: computed(() => install().state === 'installing'),
    };
  }),
  withMethods((store, stz = inject(STZ)) => {
    /** The preselection for the chat language (the main process marks it), until the user changes it. */
    function preselect(): void {
      if (store.touched()) return;
      const ids = store
        .packages()
        .filter((p) => p.kind !== 'engine' && !p.installed && p.preselected)
        .map((p) => p.id);
      patchState(store, { selected: ids });
    }

    async function load(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const [voices, packages] = await Promise.all([stz.listVoices(), stz.voicePackages()]);
        patchState(store, { voices, packages });
        preselect();
      } finally {
        patchState(store, { loading: false });
      }
    }

    return {
      load,
      preselect,

      toggle(id: string): void {
        const selected = store.selected();
        patchState(store, { touched: true, selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] });
      },

      /**
       * Downloads the selected packages: only ever from the user's click. Not named install(): that is the
       * install state (in GT Toolz a method of that name replaced it and started downloads on render).
       */
      async installSelected(): Promise<void> {
        const ids = store.selected().filter((id) => !store.packages().find((p) => p.id === id)?.installed);
        if (!ids.length) return;
        await stz.installVoicePackages(ids);
      },

      cancel(): Promise<void> {
        return stz.cancelVoiceInstall();
      },

      async remove(id: string): Promise<void> {
        await stz.removeVoicePackages([id]);
        await load();
      },

      async preview(id: string): Promise<void> {
        patchState(store, { previewing: id });
        try {
          await stz.readmychat.previewVoice(id);
        } finally {
          patchState(store, { previewing: null });
        }
      },
    };
  }),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.onVoiceInstall((install) => {
          patchState(store, { install });
          if (install.state === 'done') {
            patchState(store, { selected: [], touched: true });
            void store.load();
          }
        });
        void store.load();
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
