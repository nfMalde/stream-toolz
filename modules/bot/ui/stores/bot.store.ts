import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { BotStatus } from '@stz/api';

interface BotStoreState {
  status: BotStatus | null;
}

/** The bot: its last actions, what waits to be sent, and whether it may write. */
export const BotStore = signalStore(
  { providedIn: 'root' },
  withState<BotStoreState>({ status: null }),
  withComputed(({ status }) => ({
    /** Newest first. */
    log: computed(() => [...(status()?.log ?? [])].reverse()),
    connected: computed(() => status()?.connected ?? false),
    canWrite: computed(() => status()?.canWrite),
    queued: computed(() => status()?.queued ?? 0),
  })),
  withMethods((_store, stz = inject(STZ).bot) => ({
    preview: (commandId: string, sampleArgs: string) => stz.preview(commandId, sampleArgs),
    sendTest: (text: string) => stz.sendTest(text),
    resetUses: (commandId: string) => stz.resetUses(commandId),
  })),
  withHooks((store, stz = inject(STZ).bot) => {
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
