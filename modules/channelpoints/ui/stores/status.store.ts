import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { ChannelpointsStatus, PickSoundsResult } from '@stream-toolz/channelpoints/api';

/** The module's live side: the sounds in its folder, the last redemptions and how many sounds wait. */
export const ChannelpointsStatusStore = signalStore(
  { providedIn: 'root' },
  withState<{ status: ChannelpointsStatus | null }>({ status: null }),
  withComputed(({ status }) => ({
    sounds: computed(() => status()?.sounds ?? []),
    /** Newest first. */
    log: computed(() => [...(status()?.log ?? [])].reverse()),
    queued: computed(() => status()?.queued ?? 0),
  })),
  withMethods((_store, stz = inject(STZ).channelpoints) => ({
    test: (rewardId: string) => stz.test(rewardId),
    preview: (name: string) => stz.preview(name),
    pickSounds: (): Promise<PickSoundsResult> => stz.pickSounds(),
    removeSound: (name: string) => stz.removeSound(name),
    openFolder: () => stz.openSoundsFolder(),
  })),
  withHooks((store, stz = inject(STZ).channelpoints) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.onStatus((status) => patchState(store, { status }));
        void stz.status().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
