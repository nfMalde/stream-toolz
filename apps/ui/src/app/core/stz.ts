import { InjectionToken } from '@angular/core';
import type { StzApi } from '@stz/api';

declare global {
  interface Window {
    /** Provided by the desktop app's preload script. */
    stz?: StzApi;
  }
}

/** False when the UI is opened in a plain browser (ng serve without Electron). */
export const BRIDGE_AVAILABLE = typeof window !== 'undefined' && !!window.stz;

/** The main process API (window.stz). */
export const STZ = new InjectionToken<StzApi>('stz', {
  providedIn: 'root',
  factory: () => window.stz ?? offlineBridge(),
});

/** Outside the desktop app every call fails and no event ever arrives, also in a module's namespace (stz.<id>.…). */
function offlineBridge(): StzApi {
  const member = (name: string): unknown => {
    const call = name.startsWith('on') ? () => () => undefined : () => Promise.reject(new Error('Only available in the desktop app'));
    return new Proxy(call, { get: (target, prop) => (prop in target ? Reflect.get(target, prop) : member(String(prop))) });
  };
  return new Proxy({} as StzApi, { get: (_target, name) => member(String(name)) });
}
