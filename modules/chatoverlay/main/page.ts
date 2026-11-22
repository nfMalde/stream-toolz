// The overlay page for OBS's browser source: an empty, transparent page whose script draws the chat from server-sent
// events. Plain HTML and JS as string constants, no libraries, no inline script (CSP); the look is in the shared
// stylesheet (src/page-css.ts) and the values the streamer picked arrive as the "style" event.

import crypto from 'node:crypto';

export interface PageTexts {
  title: string;
  /** Shown in a plain browser while nothing has arrived (in OBS the page stays empty). */
  empty: string;
}

export function pageTexts(language: string): PageTexts {
  return language.toLowerCase().startsWith('de')
    ? { title: 'Stream Toolz – Chat Overlay (OBS-Quelle)', empty: 'Chat Overlay wartet auf Nachrichten. Diese Seite ist für OBS gedacht (Browserquelle); zum Ansehen reicht sie auch im Browser.' }
    : { title: 'Stream Toolz – Chat Overlay (OBS source)', empty: 'Chat Overlay is waiting for messages. This page is meant for OBS (browser source); for a look it works in a browser too.' };
}

/** Transparent in OBS; the note shows only in a plain browser while the list is empty. */
export function page(language: string): string {
  const t = pageTexts(language);
  const lang = language.toLowerCase().startsWith('de') ? 'de' : 'en';
  return `<!doctype html>
<html lang="${lang}" data-page="${PAGE_VERSION}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t.title)}</title>
<link rel="stylesheet" href="style.css">
<style>
  html, body { margin: 0; height: 100%; background: transparent; }
  #note { display: none; position: fixed; left: 16px; bottom: 16px; max-width: 480px; padding: 12px 16px; border-radius: 10px; font: 14px/1.5 system-ui, sans-serif; color: #f4ede6; background: rgba(24, 18, 13, .92); }
  body.browser.empty #note { display: block; }
</style>
</head>
<body>
<div id="overlay" class="stz-chat-overlay" data-direction="up" data-align="left"></div>
<div id="note">${escapeHtml(t.empty)}</div>
<script src="page.js"></script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * The page's script. Everything from the events becomes DOM nodes through textContent and properties, never HTML;
 * the colours were checked in the app. Emote pictures only when the style says so (the page was then served with a
 * CSP that allows Twitch's CDN; the app reloads the page when that setting changes).
 */
export const PAGE_JS = `'use strict';
(() => {
  const base = location.pathname.replace(/\\/$/, '');
  const root = document.getElementById('overlay');
  const note = document.getElementById('note');
  const EMOTE_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2/';
  const ROLE_LABELS = { broadcaster: 'STREAMER', mod: 'MOD', vip: 'VIP', sub: 'SUB' };
  const FADE_OUT_MS = 650;
  const inObs = typeof window.obsstudio !== 'undefined';
  if (!inObs) document.body.classList.add('browser');

  let style = null;
  let items = [];
  const nodes = new Map();
  const timers = new Map();

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const emptyNote = () => document.body.classList.toggle('empty', items.length === 0);

  const render = (item) => {
    const node = el('div', 'co-item ' + (item.kind === 'event' ? 'co-event' : 'co-message') + (item.test ? ' co-test' : ''));
    node.dataset.id = item.id;
    if (item.kind === 'message') {
      if (style && style.showBadges) {
        for (const role of item.roles) node.appendChild(el('span', 'co-badge ' + role, ROLE_LABELS[role] || role));
      }
      const name = el('span', 'co-name', item.name);
      if (style && style.twitchColors && item.color) name.style.color = item.color;
      node.appendChild(name);
      node.appendChild(el('span', 'co-sep', ': '));
    }
    const text = el('span', 'co-text');
    for (const part of item.parts) {
      if (part.kind === 'emote' && style && style.emotes === 'images' && part.emoteId) {
        const img = el('img', 'co-emote');
        img.alt = part.text;
        img.title = part.text;
        img.loading = 'eager';
        img.decoding = 'async';
        img.src = EMOTE_CDN + part.emoteId + '/default/dark/2.0';
        img.addEventListener('error', () => img.replaceWith(el('span', 'co-emote', part.text)));
        text.appendChild(img);
      } else if (part.kind === 'emote') text.appendChild(el('span', 'co-emote', part.text));
      else if (part.kind === 'mention') text.appendChild(el('span', 'co-mention', part.text));
      else text.appendChild(document.createTextNode(part.text));
    }
    node.appendChild(text);
    return node;
  };

  const forget = (id) => {
    const timer = timers.get(id);
    if (timer) { clearTimeout(timer.fade); clearTimeout(timer.gone); timers.delete(id); }
  };

  const remove = (id) => {
    forget(id);
    items = items.filter((item) => item.id !== id);
    const node = nodes.get(id);
    nodes.delete(id);
    if (node) node.remove();
    emptyNote();
  };

  // After fadeSeconds the line fades out and leaves; a line already older than that (from the backlog) leaves at once.
  const scheduleFade = (item) => {
    forget(item.id);
    if (!style || !style.fadeSeconds) return true;
    const left = item.at + style.fadeSeconds * 1000 - Date.now();
    if (left <= 0) return false;
    const timer = {};
    timer.fade = setTimeout(() => {
      const node = nodes.get(item.id);
      if (node) node.classList.add('co-fading');
      timer.gone = setTimeout(() => remove(item.id), FADE_OUT_MS);
    }, left);
    timers.set(item.id, timer);
    return true;
  };

  const add = (item) => {
    if (nodes.has(item.id)) remove(item.id);
    if (!scheduleFade(item)) return;
    items.push(item);
    const node = render(item);
    nodes.set(item.id, node);
    if (style && style.direction === 'down') root.prepend(node);
    else root.appendChild(node);
    const max = style ? style.maxMessages : 50;
    while (items.length > max) remove(items[0].id);
    emptyNote();
  };

  const clear = () => {
    for (const id of [...nodes.keys()]) remove(id);
    items = [];
    emptyNote();
  };

  const applyStyle = (next) => {
    style = next;
    root.style.setProperty('--co-font-size', style.fontSize + 'px');
    root.style.setProperty('--co-font', style.fontFamily);
    root.style.setProperty('--co-text', style.textColor);
    root.style.setProperty('--co-bg', style.background);
    root.style.setProperty('--co-name', style.nameColor);
    root.style.setProperty('--co-width', style.width + 'px');
    root.dataset.direction = style.direction;
    root.dataset.align = style.align;
    // Names, badges and emotes depend on the style: the lines are drawn again.
    const current = items.slice();
    clear();
    for (const item of current) add(item);
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
    events.addEventListener('style', (event) => applyStyle(JSON.parse(event.data)));
    events.addEventListener('texts', (event) => { note.textContent = JSON.parse(event.data).empty; });
    events.addEventListener('backlog', (event) => {
      clear();
      for (const item of JSON.parse(event.data).items) add(item);
    });
    events.addEventListener('message', (event) => add(JSON.parse(event.data)));
    events.addEventListener('remove', (event) => {
      for (const id of JSON.parse(event.data).ids) remove(id);
    });
    events.addEventListener('clear', clear);
    events.addEventListener('reload', () => location.reload());
  };
  emptyNote();
  connect();
})();
`;

/** Changes with the script: a page still open from an older app version notices it in "hello" and reloads. */
export const PAGE_VERSION = crypto.createHash('sha256').update(PAGE_JS).digest('hex').slice(0, 12);
