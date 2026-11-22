// The overlay page for OBS: a transparent page that shows one alert at a time and plays its sound itself through
// an <audio> element, so the sound goes through the browser source's audio in OBS (its own fader in the mixer).
// Plain HTML, CSS and JS as string constants; nothing is loaded from anywhere but the local server, and the page
// runs no inline script (CSP script-src 'self'). The text is put in with textContent, never as HTML.

import crypto from 'node:crypto';
import type { ChannelEventKind } from '@stream-toolz/twitch';

const TEXTS = {
  de: {
    title: 'Stream Toolz – Alerts (OBS-Quelle)',
    browser: 'Diese Seite ist für OBS gedacht (Browserquelle). Im Browser: einmal klicken, damit der Ton spielen darf.',
    kinds: { follow: 'Follow', sub: 'Neues Abo', prime: 'Prime-Abo', resub: 'Abo verlängert', gift: 'Geschenk', communityGift: 'Geschenk', raid: 'Raid' } satisfies Record<ChannelEventKind, string>,
  },
  en: {
    title: 'Stream Toolz – Alerts (OBS source)',
    browser: 'This page is meant for OBS (browser source). In a browser: click once so the sound may play.',
    kinds: { follow: 'Follow', sub: 'New sub', prime: 'Prime sub', resub: 'Resub', gift: 'Gift', communityGift: 'Gift', raid: 'Raid' } satisfies Record<ChannelEventKind, string>,
  },
};

export function pageTexts(language: string): (typeof TEXTS)['de'] {
  return language.startsWith('de') ? TEXTS.de : TEXTS.en;
}

/** Transparent in OBS; in a normal browser a short note (and a click to allow sound). */
export function page(language: string): string {
  const t = pageTexts(language);
  return `<!doctype html>
<html lang="${language.startsWith('de') ? 'de' : 'en'}" data-page="${PAGE_VERSION}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="note" data-browser="${t.browser}"></div>
<div id="stage"></div>
<script src="page.js"></script>
</body>
</html>`;
}

export const STYLE = `
html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
:root {
  --size: 40px; --text: #ffffff; --accent: #ff730f; --bg: #0d0a07cc;
  --font: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
html[data-font="mono"] { --font: ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace; }
html[data-font="serif"] { --font: Georgia, "Times New Roman", serif; }
html[data-font="rounded"] { --font: "Arial Rounded MT Bold", "Varela Round", "Nunito", "Comic Sans MS", sans-serif; }
#note { display: none; font: 15px/1.5 system-ui, sans-serif; color: #f4ede6; background: #18120d; padding: 16px 20px; margin: 20px; border-radius: 12px; max-width: 520px; }
body.browser #note { display: block; }
#stage { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 4vh 4vw; box-sizing: border-box; pointer-events: none; }
html[data-position="center"] #stage { justify-content: center; }
html[data-position="bottom"] #stage { justify-content: flex-end; }
.alert {
  max-width: 92vw; padding: calc(var(--size) * .45) calc(var(--size) * .7); border-radius: calc(var(--size) * .35);
  background: var(--bg); color: var(--text); font-family: var(--font); text-align: center;
  border-left: calc(var(--size) * .18) solid var(--accent); box-shadow: 0 10px 40px -10px rgba(0, 0, 0, .7);
  animation: enter .45s cubic-bezier(.2, .9, .3, 1.25) both;
}
.alert.leaving { animation: leave .3s ease-in both; }
.alert .kind { font-size: calc(var(--size) * .4); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: calc(var(--size) * .15); }
.alert .title { font-size: var(--size); font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; text-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
.alert .message { font-size: calc(var(--size) * .55); line-height: 1.35; margin-top: calc(var(--size) * .25); opacity: .92; overflow-wrap: anywhere; }
@keyframes enter { from { opacity: 0; transform: var(--from); } to { opacity: 1; transform: none; } }
@keyframes leave { from { opacity: 1; transform: none; } to { opacity: 0; transform: var(--from); } }
html[data-animation="fade"] .alert { --from: none; }
html[data-animation="slide"] .alert { --from: translateY(-40px); }
html[data-position="bottom"][data-animation="slide"] .alert { --from: translateY(40px); }
html[data-animation="pop"] .alert { --from: scale(.6); }
`;

/** The page's script (plain, no libraries). */
export const SCRIPT = `'use strict';
(() => {
  const base = location.pathname.replace(/\\/$/, '');
  const note = document.getElementById('note');
  const stage = document.getElementById('stage');
  const inObs = typeof window.obsstudio !== 'undefined';
  if (!inObs) document.body.classList.add('browser');
  note.textContent = inObs ? '' : note.dataset.browser;
  let kinds = {};
  let current = null;
  let hideTimer = 0;
  let audio = null;

  const stopSound = () => {
    if (!audio) return;
    try { audio.pause(); } catch (e) {}
    audio.removeAttribute('src');
    audio = null;
  };
  const hide = () => {
    clearTimeout(hideTimer);
    const box = current;
    current = null;
    if (!box) return;
    box.classList.add('leaving');
    setTimeout(() => box.remove(), 320);
  };
  const applyStyle = (style) => {
    const root = document.documentElement;
    root.style.setProperty('--size', style.fontSize + 'px');
    root.style.setProperty('--text', style.textColor);
    root.style.setProperty('--accent', style.accentColor);
    root.style.setProperty('--bg', style.background);
    root.dataset.font = style.fontFamily;
    root.dataset.position = style.position;
    root.dataset.animation = style.animation;
  };
  const show = (alert) => {
    stopSound();
    if (current) { current.remove(); current = null; }
    clearTimeout(hideTimer);
    const box = document.createElement('div');
    box.className = 'alert';
    const kind = document.createElement('div');
    kind.className = 'kind';
    kind.textContent = kinds[alert.kind] || alert.kind;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = alert.title;
    box.append(kind, title);
    if (alert.message) {
      const message = document.createElement('div');
      message.className = 'message';
      message.textContent = alert.message;
      box.append(message);
    }
    stage.replaceChildren(box);
    current = box;
    hideTimer = setTimeout(hide, alert.durationMs);
    if (alert.soundUrl) {
      audio = new Audio(base + '/' + alert.soundUrl);
      audio.volume = Math.max(0, Math.min(1, alert.volume));
      audio.play().catch(() => undefined);
    }
  };

  // The browser retries a lost connection by itself (the app restarts), but gives up after an error answer,
  // e.g. from a second Stream Toolz with another address on this port. Then this tries again, ever slower.
  let wait = 2000;
  const connect = () => {
    const events = new EventSource(base + '/events');
    events.addEventListener('open', () => { wait = 2000; });
    events.addEventListener('error', () => {
      if (events.readyState !== EventSource.CLOSED) return;
      setTimeout(connect, wait);
      wait = Math.min(wait * 2, 30000);
    });
    events.addEventListener('hello', (event) => {
      if (JSON.parse(event.data).page !== document.documentElement.dataset.page) location.reload();
    });
    events.addEventListener('style', (event) => {
      const data = JSON.parse(event.data);
      kinds = data.kinds || {};
      applyStyle(data.style);
    });
    events.addEventListener('alert', (event) => show(JSON.parse(event.data)));
    events.addEventListener('clear', () => { stopSound(); hide(); });
  };
  connect();
})();
`;

/** Changes with the page: an OBS page still open from an older app version notices it and reloads. */
export const PAGE_VERSION = crypto.createHash('sha256').update(STYLE).update(SCRIPT).digest('hex').slice(0, 12);
