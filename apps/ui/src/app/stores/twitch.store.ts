import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { TwitchAppInput, TwitchStatus } from '@rmc/api';
import { BRIDGE_AVAILABLE, RMC } from '../core/rmc';

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
  withMethods((store, rmc = inject(RMC)) => ({
    async saveApp(input: TwitchAppInput): Promise<boolean> {
      patchState(store, { saving: true, saveError: null });
      try {
        patchState(store, { status: await rmc.saveTwitchApp(input) });
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
      patchState(store, { status: await rmc.removeTwitchApp(), saveError: null });
    },
    login(): Promise<void> {
      return rmc.twitchLogin();
    },
    reopenLogin(): Promise<void> {
      return rmc.reopenTwitchLogin();
    },
    copyCode(): Promise<void> {
      return rmc.copyText('loginCode');
    },
    cancelLogin(): Promise<void> {
      return rmc.cancelTwitchLogin();
    },
    logout(): Promise<void> {
      return rmc.twitchLogout();
    },
  })),
  withHooks((store, rmc = inject(RMC)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = rmc.onTwitchStatus((status) => patchState(store, { status }));
        void rmc.twitchStatus().then((status) => patchState(store, { status }));
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
