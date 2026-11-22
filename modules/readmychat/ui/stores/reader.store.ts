import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { ChannelEventKind, ChatLogEntry, ReaderStatus } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';

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
  withMethods((store, stz = inject(STZ).readmychat) => ({
    /** A new outcome replaces the message's earlier entry. */
    add(entry: ChatLogEntry): void {
      const log = store.log().filter((e) => e.id !== entry.id);
      log.push(entry);
      patchState(store, { log: log.slice(-LOG_SIZE) });
    },
    togglePause(): Promise<void> {
      return store.status()?.state === 'paused' ? stz.resume() : stz.pause();
    },
    skip: () => stz.skip(),
    clear: () => stz.clearQueue(),
    remove: (id: string) => stz.removeQueued(id),
    test: (text: string) => stz.testMessage(text),
    testEvent: (kind: ChannelEventKind) => stz.testEvent(kind),
    learnReward: () => stz.learnReward(),
    cancelLearnReward: () => stz.cancelLearnReward(),
  })),
  withHooks((store, stz = inject(STZ).readmychat) => {
    const unsubscribe: (() => void)[] = [];
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe.push(stz.onReaderStatus((status) => patchState(store, { status })));
        unsubscribe.push(stz.onChatLog((entry) => store.add(entry)));
        void stz.readerStatus().then((status) => patchState(store, { status }));
        void stz.chatLog().then((entries) => {
          for (const entry of entries) store.add(entry);
        });
      },
      onDestroy() {
        for (const off of unsubscribe) off();
      },
    };
  }),
);
