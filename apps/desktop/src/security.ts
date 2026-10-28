// The windows only ever show the app's own pages. No remote content, no new windows, no permissions but the
// choice of the audio output; every request a window makes that would leave the app is cancelled. Twitch is
// reached from the main process only (login, API, EventSub). The local server (local-server.ts) is separate
// and answers on the loopback interface only.

import fs from 'node:fs';
import path from 'node:path';
import { app, protocol, session, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://rmc`;
/** The hidden player window's page (audio.ts): empty, may load nothing; the player is its preload. */
export const AUDIO_PAGE_URL = `${APP_ORIGIN}/audio.html`;

/** Dev only: the Angular dev server (ng serve). */
export const DEV_URL = process.env.RMC_DEV_URL;

const SCRIPT_SRC = DEV_URL ? `'self' ${DEV_URL}` : `'self'`;
const CONNECT_SRC = DEV_URL ? `'self' ${DEV_URL} ${DEV_URL.replace(/^http/, 'ws')}` : `'self'`;

/** Angular adds component styles at runtime, hence 'unsafe-inline' for styles (never for scripts). */
export const CONTENT_SECURITY_POLICY = [
  `default-src 'none'`,
  `script-src ${SCRIPT_SRC}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src ${CONNECT_SRC}`,
  `base-uri 'self'`,
  `form-action 'none'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
].join('; ');

const AUDIO_PAGE = "<!doctype html><meta charset=\"utf-8\"><title>audio</title>";

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

export function isAppUrl(url: string): boolean {
  if (url.startsWith(`${APP_ORIGIN}/`) || url === APP_ORIGIN) return true;
  return !!DEV_URL && (url === DEV_URL || url.startsWith(`${DEV_URL}/`));
}

/** IPC calls are only accepted from the app's own page. */
export function fromApp(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return isAppUrl(event.senderFrame?.url ?? '');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * app://rmc/: the player page always (also in dev, so the player and the device list share one origin),
 * and the built UI from uiDir when there is no dev server (unknown paths get index.html, for the router).
 */
export function serveApp(uiDir: string | undefined): void {
  const root = uiDir ? path.resolve(uiDir) : undefined;
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'rmc') return new Response('Not found', { status: 404 });
    const headers = { 'Content-Security-Policy': CONTENT_SECURITY_POLICY, 'X-Content-Type-Options': 'nosniff' };
    if (url.pathname === '/audio.html') {
      return new Response(AUDIO_PAGE, { headers: { ...headers, 'Content-Security-Policy': "default-src 'none'", 'Content-Type': MIME['.html']! } });
    }
    if (!root) return new Response('Not found', { status: 404 });
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    // Never anything outside the UI folder.
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    return new Response(await fs.promises.readFile(file), { headers: { ...headers, 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' } });
  });
}

/** The app's own page (app://rmc, in dev the Angular dev server) as a permission origin; with or without a final slash. */
function isAppOrigin(origin: string): boolean {
  const bare = origin.replace(/\/$/, '');
  return bare === APP_ORIGIN || (!!DEV_URL && bare === new URL(DEV_URL).origin);
}

export function hardenSession(): void {
  const ses = session.defaultSession;
  // The only permission: choosing the audio output (setSinkId). No microphone, camera or screen.
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requesting = (details as { requestingUrl?: string }).requestingUrl ?? contents.getURL();
    callback(isAppUrl(requesting) && (permission as string) === 'speaker-selection');
  });
  // The 'media' check lets the device list carry the devices' names; nothing is recorded.
  ses.setPermissionCheckHandler(
    (_contents, permission, origin, details) =>
      isAppOrigin(origin) && ((permission as string) === 'speaker-selection' || (permission === 'media' && (details as { mediaType?: string }).mediaType === 'audio')),
  );
  ses.setDevicePermissionHandler(() => false);
  ses.setSpellCheckerEnabled(false);

  // Nothing leaves the windows: only the app's own files, DevTools and (in dev) the Angular dev server.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;
    const allowed = isAppUrl(url) || url.startsWith('devtools://') || url.startsWith('data:') || url.startsWith('blob:') || (!!DEV_URL && url.startsWith(DEV_URL.replace(/^http/, 'ws')));
    if (!allowed) console.warn(`[security] blocked request: ${url}`);
    callback({ cancel: !allowed });
  });

  // The dev server sends no CSP of its own.
  if (DEV_URL) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (details.url.startsWith(DEV_URL!)) headers['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY];
      callback({ responseHeaders: headers });
    });
  }
}

export function guardWebContents(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
