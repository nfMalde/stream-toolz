import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { AlertsStatus, ChannelEventKind } from '@stz/api';

/** The overlay's status: its address, the sounds in the folder, what is on screen, how many pages are connected. */
export const AlertsStore = signalStore(
  { providedIn: 'root' },
  withState<{ status: AlertsStatus | null }>({ status: null }),
  withComputed(({ status }) => ({
    url: computed(() => status()?.url ?? ''),
    sounds: computed(() => status()?.sounds ?? []),
    pages: computed(() => status()?.pages ?? 0),
    queued: computed(() => status()?.queued ?? 0),
    current: computed(() => status()?.current),
  })),
  withMethods((store, stz = inject(STZ)) => ({
    test(kind: ChannelEventKind): Promise<void> {
      return stz.alerts.test(kind);
    },
    clear(): Promise<void> {
      return stz.alerts.clear();
    },
    async pickSounds(): Promise<void> {
      const sounds = await stz.alerts.pickSounds();
      const status = store.status();
      if (status) patchState(store, { status: { ...status, sounds } });
    },
    async removeSound(name: string): Promise<void> {
      const sounds = await stz.alerts.removeSound(name);
      const status = store.status();
      if (status) patchState(store, { status: { ...status, sounds } });
    },
    preview(name: string): Promise<void> {
      return stz.alerts.preview(name);
    },
    copyUrl(): Promise<void> {
      return stz.alerts.copyUrl();
    },
    openUrl(): Promise<void> {
      return stz.alerts.openUrl();
    },
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.alerts.onStatus((status) => patchState(store, { status }));
        void stz.alerts.status().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
