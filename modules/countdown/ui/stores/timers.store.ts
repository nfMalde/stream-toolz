import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { BRIDGE_AVAILABLE, STZ } from '@shell/core/stz';
import type { CountdownStatus } from '@stz/api';

type StartError = 'not-understood' | 'too-many';

interface CountdownState {
  status: CountdownStatus | null;
  /** The clock the page counts down with: once a second (the main process sends no tick, 2026-10-30). */
  now: number;
  error: StartError | null;
}

/** The running timers, the overlay address and the folder; the main process announces every change. */
export const CountdownStore = signalStore(
  { providedIn: 'root' },
  withState<CountdownState>({ status: null, now: Date.now(), error: null }),
  withComputed(({ status }) => ({
    /** Newest first, as the overlay shows them. */
    timers: computed(() => [...(status()?.timers ?? [])].reverse()),
    url: computed(() => status()?.url ?? ''),
    folder: computed(() => status()?.folder ?? ''),
    folderError: computed(() => status()?.folderError ?? null),
    clients: computed(() => status()?.clients ?? 0),
  })),
  withMethods((store, stz = inject(STZ)) => ({
    /** True when a timer started; otherwise the error is set for the page. */
    async start(phrase: string): Promise<boolean> {
      const result = await stz.countdown.start(phrase);
      if ('error' in result) {
        patchState(store, { error: result.error });
        return false;
      }
      patchState(store, { error: null });
      return true;
    },
    clearError(): void {
      if (store.error()) patchState(store, { error: null });
    },
    pause: (id: string) => void stz.countdown.pause(id),
    resume: (id: string) => void stz.countdown.resume(id),
    adjust: (id: string, deltaMs: number) => void stz.countdown.adjust(id, deltaMs),
    remove: (id: string) => void stz.countdown.remove(id),
    clear: () => void stz.countdown.clear(),
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    let clock: ReturnType<typeof setInterval> | undefined;
    return {
      onInit() {
        clock = setInterval(() => patchState(store, { now: Date.now() }), 1000);
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.countdown.onStatus((status) => patchState(store, { status }));
        void stz.countdown.status().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        clearInterval(clock);
        unsubscribe();
      },
    };
  }),
);
