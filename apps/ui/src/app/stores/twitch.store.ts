import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { TwitchAppInput, TwitchStatus } from '@stz/api';
import { BRIDGE_AVAILABLE, STZ } from '../core/stz';

interface TwitchState {
  status: TwitchStatus | null;
  /** The Client ID is being checked with Twitch. */
  saving: boolean;
  /** Why saving failed ('invalid-client', 'network', …). */
  saveError: string | null;
}

/** The Twitch connection: the user's app, the login and the channel being read. */
export const TwitchStore = signalStore(
  { providedIn: 'root' },
  withState<TwitchState>({ status: null, saving: false, saveError: null }),
  withComputed(({ status }) => ({
    stage: computed(() => status()?.stage ?? 'no-app'),
    hasApp: computed(() => status()?.hasApp ?? false),
    connected: computed(() => status()?.stage === 'connected'),
    loggedIn: computed(() => !!status()?.user && status()?.stage !== 'logged-out' && status()?.stage !== 'no-app'),
  })),
  withMethods((store, stz = inject(STZ)) => ({
    async saveApp(input: TwitchAppInput): Promise<boolean> {
      patchState(store, { saving: true, saveError: null });
      try {
        patchState(store, { status: await stz.saveTwitchApp(input) });
        return true;
      } catch (err) {
        // Electron prefixes the message ("Error invoking remote method …: Error: invalid-client").
        const code = /(invalid-client|network)/.exec((err as Error).message)?.[1] ?? 'unknown';
        patchState(store, { saveError: code });
        return false;
      } finally {
        patchState(store, { saving: false });
      }
    },
    async removeApp(): Promise<void> {
      patchState(store, { status: await stz.removeTwitchApp(), saveError: null });
    },
    login(): Promise<void> {
      return stz.twitchLogin();
    },
    reopenLogin(): Promise<void> {
      return stz.reopenTwitchLogin();
    },
    copyCode(): Promise<void> {
      return stz.copyText('loginCode');
    },
    cancelLogin(): Promise<void> {
      return stz.cancelTwitchLogin();
    },
    logout(): Promise<void> {
      return stz.twitchLogout();
    },
  })),
  withHooks((store, stz = inject(STZ)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = stz.onTwitchStatus((status) => patchState(store, { status }));
        void stz.twitchStatus().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
