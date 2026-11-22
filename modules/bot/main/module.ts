// Chat Bot in the main process: the bot on the shell's Twitch connection, answering as the logged-in account
// (the user decided 2026-10-28: the streamer's own Public app, no second bot account yet), and its calls from the
// UI (window.stz.bot). Everything it uses comes from its host (packages/core/src/module.ts); the shell takes
// handlers and listeners back when it stops.

import { asString, asText, type ModuleDefinition } from '@stream-toolz/core';
import type { FeatureState } from '@stream-toolz/twitch';
import { BOT, type BotStatus } from '../src/api';
import { Bot } from '../src/bot';
import { defaultSettings, normalizeSettings, type Settings } from '../src/settings';

/** Timed messages are checked this often; a minute is their finest setting. */
const TICK_MS = 10_000;

export const botModule: ModuleDefinition<Settings> = {
  id: BOT,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },
  // chatWrite (user:write:chat) is the first permission that writes: the login shows it separately.
  twitch: ['chat', 'chatWrite'],

  start(host) {
    const settings = () => host.settings();
    // The channel's display name for {channel}; the app setting is its login until the first status says more.
    let channel = host.app().channel;
    let canWrite: FeatureState | undefined;

    const language = (): 'de' | 'en' => (host.app().language === 'de' ? 'de' : 'en');

    const bot = new Bot({
      settings,
      send: async (text, replyTo) => {
        try {
          await host.twitch.sendMessage(text, replyTo);
        } catch (err) {
          // The reason only (Twitch's drop reason, a missing permission): never the chat text.
          host.log(`BOT       send failed: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }
      },
      ownUserId: () => host.twitch.ownUserId,
      channel: () => channel,
      language,
      onUses: (commandId, uses) => {
        const commands = settings().commands.map((c) => (c.id === commandId ? { ...c, uses } : c));
        void host.updateSettings({ commands }).catch((err: unknown) => host.log(`BOT       uses not saved: ${err instanceof Error ? err.message : String(err)}`));
      },
      onChange: () => sendStatus(),
    });

    const status = (): BotStatus => ({ log: bot.log, connected: host.twitch.connected, canWrite, queued: bot.queued });
    const { handle, send } = host.bridge;
    const sendStatus = () => send('status', status());

    host.twitch.on('message', (message) => bot.onMessage(message));
    host.twitch.on('status', (twitch) => {
      canWrite = twitch.features?.chatWrite;
      if (twitch.channel) channel = twitch.channel.name;
      sendStatus();
    });

    handle('status', () => status());
    handle('preview', (commandId, sampleArgs) => {
      const id = asString(commandId);
      const command = settings().commands.find((c) => c.id === id);
      if (!command) throw new Error('unknown-command');
      // A sample name so the preview reads like a chat answer; the words are what the user typed into the preview.
      return bot.preview(command, language() === 'de' ? 'Zuschauer' : 'Viewer', asText(sampleArgs).trim());
    });
    handle('sendTest', (text) => bot.sendTest(asText(text)));
    handle('resetUses', async (commandId) => {
      const id = asString(commandId);
      await host.updateSettings({ commands: settings().commands.map((c) => (c.id === id ? { ...c, uses: 0 } : c)) });
      bot.resetUses(id);
    });

    bot.tick();
    const interval = setInterval(() => bot.tick(), TICK_MS);
    host.log(`BOT       started`);

    return {
      // A timer edited or removed takes effect on the next tick (the bot reads the settings each time).
      settingsChanged: () => sendStatus(),
      stop() {
        clearInterval(interval);
        bot.stop();
      },
    };
  },
};
