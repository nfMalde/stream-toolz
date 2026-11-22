// ReadMyChat in the main process: the reader on the shell's Twitch connection, a voice per chat language (one per
// loaded language pack), its calls from the UI (window.stz.readmychat) and its shortcuts. Everything it uses comes
// from its host (packages/core/src/module.ts); the shell takes handlers, listeners and shortcuts back when it stops.

import { asText, asString, type ModuleDefinition } from '@stream-toolz/core';
import { CHANNEL_EVENT_KINDS, type ChannelEventKind } from '@stream-toolz/twitch';
import { READMYCHAT } from '../src/api';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { mainLanguage } from '../src/language';
import { packInfo, type LanguagePack } from '../src/language-pack';
import { ChatReader } from '../src/reader';
import { defaultSettings, normalizeSettings, type Settings } from '../src/settings';
import { spokenTexts } from '../src/spoken';
import { languagePacksDir, loadLanguagePacks } from './language-packs';
import { VoiceHolder } from './voice';

/** The voices are opened with these settings: a change opens them again. */
const VOICE_KEYS: (keyof Settings)[] = ['voices', 'speechLanguage', 'rate', 'commaPause', 'sentencePause'];

export const readMyChat: ModuleDefinition<Settings> = {
  id: READMYCHAT,
  enabledByDefault: true,
  settings: { defaults: (locale) => defaultSettings(locale, BUILT_IN_PACKS), normalize: normalizeSettings },
  // Follows are read when the login allows them; the chat runs without.
  twitch: ['chat', 'follows'],

  start(host) {
    const settings = () => host.settings();
    const device = host.audio.device(() => settings().deviceId);
    const sink = () => (settings().output === 'obs' ? host.audio.obs : device);

    // The built-in packs plus the user's own from the module's data folder; one array until the next reload, so
    // the detection index (src/language.ts) is built once per load.
    const packsDir = languagePacksDir(host.dataDir);
    let packs: readonly LanguagePack[] = loadLanguagePacks(packsDir, BUILT_IN_PACKS, host.log);
    const packInfos = () => packs.map(packInfo);

    let reader: ChatReader | undefined;
    const voice = new VoiceHolder(host.speech.voicesDir, host.speech.workDir, settings, () => packs, (id) => reader?.setVoice(id), host.log);
    reader = new ChatReader({
      settings,
      packs: () => packs,
      sink,
      speech: (language) => voice.get(language),
      ownUserId: () => host.twitch.ownUserId,
      onRewardLearned: (rewardId) => void host.updateSettings({ rewardId }),
      log: host.log,
    });
    const chat = reader;
    host.twitch.on('message', (message) => chat.receive(message));
    host.twitch.on('deleted', (id) => chat.deleted(id));
    host.twitch.on('userCleared', (userId) => chat.userCleared(userId));
    host.twitch.on('chatCleared', () => chat.chatCleared());
    host.twitch.on('event', (event) => chat.event(event));

    // System-wide shortcuts: they also work while a game has the focus.
    const applyHotkeys = (keys: Settings['hotkeys']) =>
      host.hotkeys.set({
        pause: { key: keys.pause, run: () => (chat.status.state === 'paused' ? chat.resume() : chat.pause()) },
        skip: { key: keys.skip, run: () => chat.skip() },
        clear: { key: keys.clear, run: () => chat.clear() },
      });

    // --- Calls from the UI and events to it ---
    const { handle, send } = host.bridge;
    chat.on('status', (status) => send('reader-status', status));
    chat.on('log', (entry) => send('chat-log', entry));
    handle('readerStatus', () => chat.status);
    handle('chatLog', () => chat.log);
    handle('pause', () => chat.pause());
    handle('resume', () => chat.resume());
    handle('skip', () => chat.skip());
    handle('clearQueue', () => chat.clear());
    handle('removeQueued', (id) => chat.remove(asString(id)));
    handle('testMessage', (text) => {
      const value = asText(text).trim();
      if (value) chat.test(value);
    });
    handle('testEvent', (kind) => {
      if (CHANNEL_EVENT_KINDS.includes(kind as ChannelEventKind)) chat.testEvent(kind as ChannelEventKind);
    });
    handle('learnReward', () => chat.learnReward(true));
    handle('cancelLearnReward', () => chat.learnReward(false));
    handle('testOutput', async () => {
      const speech = await voice.get(mainLanguage(settings().speechLanguage, packs));
      if (!speech) throw new Error('no-voice');
      const output = sink();
      if (!output.ready) throw new Error('obs-not-connected');
      void output.play(await speech.synthesize(spokenTexts(settings().speechLanguage, packs).outputTest), settings().volume / 100);
    });
    // Previews are for the user's own ears: always on the audio device, never on the stream.
    handle('previewVoice', async (id) => {
      device.stop();
      void device.play(await voice.preview(asString(id)), settings().volume / 100);
    });
    handle('languagePacks', () => packInfos());
    handle('reloadLanguagePacks', () => {
      packs = loadLanguagePacks(packsDir, BUILT_IN_PACKS, host.log);
      // A replaced pack may have another locale or other texts: the voices open again with them.
      voice.invalidate();
      chat.wake();
      send('language-packs', packInfos());
      return packInfos();
    });
    handle('openLanguagePacksFolder', () => host.desktop.openFolder(packsDir));

    applyHotkeys(settings().hotkeys);
    chat.start();

    return {
      settingsChanged(next, before) {
        if (next.output !== before.output) (before.output === 'obs' ? host.audio.obs : device).stop();
        if (VOICE_KEYS.some((key) => JSON.stringify(next[key]) !== JSON.stringify(before[key]))) voice.invalidate();
        applyHotkeys(next.hotkeys);
        chat.wake();
      },
      // An OBS source connected: waiting messages can be read.
      outputChanged: () => chat.wake(),
      voicesChanged(phase) {
        // The engine must not run while its files are deleted; afterwards the voices open again.
        voice.close();
        if (phase === 'changed') {
          voice.invalidate();
          chat.wake();
        }
      },
      stop() {
        chat.stop();
        voice.close();
      },
    };
  },
};
