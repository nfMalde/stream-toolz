import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { ChannelEventKind, ChatLogEntry, ReaderStatus } from '@rmc/api';
import { BRIDGE_AVAILABLE, RMC } from '../core/rmc';

/** Entries shown in the chat history (the main process keeps the same number). */
const LOG_SIZE = 200;

interface ReaderStoreState {
  status: ReaderStatus | null;
  /** Newest last. One entry per message: its latest outcome (queued → read or skipped). */
  log: ChatLogEntry[];
}

/** The reader: what is being read, what waits, what was read or skipped. */
export const ReaderStore = signalStore(
  { providedIn: 'root' },
  withState<ReaderStoreState>({ status: null, log: [] }),
  withComputed(({ status }) => ({
    state: computed(() => status()?.state ?? 'off'),
    paused: computed(() => status()?.state === 'paused'),
    queued: computed(() => status()?.queued ?? []),
  })),
  withMethods((store, rmc = inject(RMC)) => ({
    /** A new outcome replaces the message's earlier entry. */
    add(entry: ChatLogEntry): void {
      const log = store.log().filter((e) => e.id !== entry.id);
      log.push(entry);
      patchState(store, { log: log.slice(-LOG_SIZE) });
    },
    togglePause(): Promise<void> {
      return store.status()?.state === 'paused' ? rmc.resume() : rmc.pause();
    },
    skip: () => rmc.skip(),
    clear: () => rmc.clearQueue(),
    remove: (id: string) => rmc.removeQueued(id),
    test: (text: string) => rmc.testMessage(text),
    testEvent: (kind: ChannelEventKind) => rmc.testEvent(kind),
    learnReward: () => rmc.learnReward(),
    cancelLearnReward: () => rmc.cancelLearnReward(),
  })),
  withHooks((store, rmc = inject(RMC)) => {
    const unsubscribe: (() => void)[] = [];
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe.push(rmc.onReaderStatus((status) => patchState(store, { status })));
        unsubscribe.push(rmc.onChatLog((entry) => store.add(entry)));
        void rmc.readerStatus().then((status) => patchState(store, { status }));
        void rmc.chatLog().then((entries) => {
          for (const entry of entries) store.add(entry);
        });
      },
      onDestroy() {
        for (const off of unsubscribe) off();
      },
    };
  }),
);
