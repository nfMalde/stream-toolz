// Chat Overlay in the main process: the last chat messages and notices from the shell's Twitch connection, served as a
// page for OBS's browser source on the shell's local server (server-sent events), and its calls from the UI
// (window.stz.chatoverlay). Everything it uses comes from its host (packages/core/src/module.ts); the shell takes
// handlers, listeners and the server mount back when it stops.

import type { ModuleDefinition } from '@stream-toolz/core';
import { CHATOVERLAY } from '../src/api';
import { ChatOverlay } from '../src/overlay';
import { OVERLAY_CSS } from '../src/page-css';
import { defaultSettings, normalizeSettings, type Settings } from '../src/settings';
import { EMOTE_CDN, styleOf } from '../src/style';
import { page, PAGE_JS, PAGE_VERSION, pageTexts } from './page';
import { EventStream, send } from './server';

export const chatoverlayModule: ModuleDefinition<Settings> = {
  id: CHATOVERLAY,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },
  // Follows appear as notices when the login allows them; the chat runs without.
  twitch: ['chat', 'follows'],

  start(host) {
    const settings = () => host.settings();
    const language = () => host.app().language;
    const { handle, send: emit } = host.bridge;

    const stream = new EventStream((count) => emit('clients', count));
    const overlay = new ChatOverlay({
      settings,
      language,
      onChange(change) {
        switch (change.type) {
          case 'item':
            stream.broadcast('message', change.item);
            emit('item', change.item);
            break;
          case 'remove':
            stream.broadcast('remove', { ids: change.ids });
            emit('removed', change.ids);
            break;
          case 'clear':
            stream.broadcast('clear', {});
            emit('cleared', null);
            break;
        }
      },
    });

    host.twitch.on('message', (message) => overlay.receive(message));
    host.twitch.on('deleted', (id) => overlay.deleted(id));
    host.twitch.on('userCleared', (userId) => overlay.userCleared(userId));
    host.twitch.on('chatCleared', () => overlay.chatCleared());
    host.twitch.on('event', (event) => overlay.event(event));

    // Pictures come from Twitch's CDN only when the streamer chose them: the page's CSP allows nothing else.
    const imgSrc = () => (settings().emotes === 'images' ? EMOTE_CDN.replace(/\/emoticons\/.*$/, '') : "'none'");

    host.server.handle((req, res, rest) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'method not allowed');
      switch (rest) {
        case '':
          return send(res, 200, 'text/html; charset=utf-8', page(language()), imgSrc());
        case 'page.js':
          return send(res, 200, 'text/javascript; charset=utf-8', PAGE_JS);
        case 'style.css':
          return send(res, 200, 'text/css; charset=utf-8', OVERLAY_CSS);
        case 'events':
          return stream.connect(req, res, [
            ['hello', { page: PAGE_VERSION }],
            ['style', styleOf(settings())],
            ['texts', pageTexts(language())],
            ['backlog', { items: overlay.items }],
          ]);
        default:
          return send(res, 404, 'text/plain', 'not found');
      }
    });

    // --- Calls from the UI ---
    handle('status', () => ({ url: host.server.url(), items: overlay.items, clients: stream.count }));
    handle('copyUrl', () => host.desktop.copyText(host.server.url()));
    handle('openUrl', () => host.desktop.openLocalPage(host.server.url()));
    handle('testMessages', () => overlay.test());

    host.log(`CHATOVERLAY started`);

    return {
      settingsChanged(next, before) {
        overlay.settingsChanged();
        // The page's CSP for emote pictures is set when the page loads: the pages load again.
        if (next.emotes !== before.emotes) stream.broadcast('reload', {});
        else stream.broadcast('style', styleOf(next));
      },
      appChanged(next, before) {
        if (next.language !== before.language) stream.broadcast('texts', pageTexts(next.language));
      },
      stop() {
        stream.close();
      },
    };
  },
};
