import { InjectionToken } from '@angular/core';
import type { RmcApi } from '@rmc/api';

declare global {
  interface Window {
    /** Provided by the desktop app's preload script. */
    rmc?: RmcApi;
  }
}

/** False when the UI is opened in a plain browser (ng serve without Electron). */
export const BRIDGE_AVAILABLE = typeof window !== 'undefined' && !!window.rmc;

/** The main process API (window.rmc). */
export const RMC = new InjectionToken<RmcApi>('rmc', {
  providedIn: 'root',
  factory: () => window.rmc ?? offlineBridge(),
});

/** Outside the desktop app every call fails and no event ever arrives. */
function offlineBridge(): RmcApi {
  return new Proxy({} as RmcApi, {
    get: (_target, name) =>
      String(name).startsWith('on') ? () => () => undefined : () => Promise.reject(new Error('Only available in the desktop app')),
  });
}
