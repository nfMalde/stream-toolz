import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withState } from '@ngrx/signals';
import type { OutputStatus } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '../core/stz';

/** The shell's outputs: OBS browser sources connected right now, and whether the local port is taken. */
export const OutputStore = signalStore(
  { providedIn: 'root' },
  withState<{ status: OutputStatus | null }>({ status: null }),
  withComputed(({ status }) => ({
    obsClients: computed(() => status()?.obsClients ?? 0),
    portInUse: computed(() => status()?.portInUse ?? false),
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.onOutputStatus((status) => patchState(store, { status }));
        void stz.outputStatus().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
