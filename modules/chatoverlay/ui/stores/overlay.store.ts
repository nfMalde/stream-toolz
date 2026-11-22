import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { ChatoverlayItem } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';

/** The preview never keeps more than the settings allow at most; the main process trims to the actual setting. */
const MAX_ITEMS = 50;

interface OverlayState {
  url: string;
  /** What the overlay shows now, oldest first. */
  items: ChatoverlayItem[];
  /** OBS browser sources showing the page. */
  clients: number;
  copied: boolean;
}

/** The overlay as OBS shows it: its address, its lines (for the preview) and who is connected. */
export const OverlayStore = signalStore(
  { providedIn: 'root' },
  withState<OverlayState>({ url: '', items: [], clients: 0, copied: false }),
  withMethods((store, stz = inject(STZ).chatoverlay) => ({
    async load(): Promise<void> {
      const status = await stz.status();
      patchState(store, { url: status.url, items: status.items, clients: status.clients });
    },
    add(item: ChatoverlayItem): void {
      const items = store.items().filter((i) => i.id !== item.id);
      items.push(item);
      patchState(store, { items: items.slice(-MAX_ITEMS) });
    },
    remove(ids: string[]): void {
      patchState(store, { items: store.items().filter((i) => !ids.includes(i.id)) });
    },
    clear(): void {
      patchState(store, { items: [] });
    },
    async copyUrl(): Promise<void> {
      await stz.copyUrl();
      patchState(store, { copied: true });
      setTimeout(() => patchState(store, { copied: false }), 2000);
    },
    openUrl: () => stz.openUrl(),
    test: () => stz.testMessages(),
  })),
  withHooks((store, stz = inject(STZ).chatoverlay) => {
    const unsubscribe: (() => void)[] = [];
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe.push(stz.onItem((item) => store.add(item)));
        unsubscribe.push(stz.onRemoved((ids) => store.remove(ids)));
        unsubscribe.push(stz.onCleared(() => store.clear()));
        unsubscribe.push(stz.onClients((clients) => patchState(store, { clients })));
        void store.load();
      },
      onDestroy() {
        for (const off of unsubscribe) off();
      },
    };
  }),
);
