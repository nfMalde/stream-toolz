// The reader: chat messages go through the filter into the queue and are read one after another, with a
// pause between them, on the chosen output (an audio device or the OBS browser source). Moderation follows
// the chat: a deleted message is taken out of the queue, and stopped if it is being read. Channel events
// (follows, subs, gifted subs, raids) are read before the chat, in the main language.

import { EventEmitter } from 'node:events';
import { own, type AudioSink } from '@stream-toolz/core';
import type { Speech } from '@stream-toolz/speech';
import type { ChannelEvent, ChatMessage } from '@stream-toolz/twitch';
import { groupOf, type ChannelEventKind } from '@stream-toolz/twitch/api';
import type { ChatLogEntry, QueuedItem, ReaderState, ReaderStatus, SkipReason } from './api';
import { ChatFilter, containsBlockedWord, eventMessageText } from './filter';
import { detectLanguage, mainLanguage, type ChatLanguage } from './language';
import type { LanguagePack } from './language-pack';
import { ReadQueue, type QueueEntry } from './queue';
import type { Settings } from './settings';
import { defaultEventText, fillEventText, fillTemplate, readingPack, spokenTexts } from './spoken';
import { spokenName } from './text';

export interface ReaderOptions {
  settings: () => Settings;
  /** The loaded language packs (the same array until they are reloaded). */
  packs: () => readonly LanguagePack[];
  sink: () => AudioSink;
  /** The voice for a language; undefined while none is installed or it failed to start. */
  speech: (language: ChatLanguage) => Promise<Speech | undefined>;
  /** The logged-in account. */
  ownUserId: () => string | undefined;
  /** The reward was learned (audience 'reward'). */
  onRewardLearned: (rewardId: string) => void;
  log: (line: string) => void;
}

type Events = {
  status: [ReaderStatus];
  log: [ChatLogEntry];
};

/** Chat log entries kept for the UI (memory only; chat is never written to disk). */
const LOG_SIZE = 200;
/** Follow bots follow by the hundred: at most this many follows are read per minute, each person once. */
const FOLLOWS_PER_MINUTE = 5;
const FOLLOWERS_KEPT = 5_000;

export class ChatReader extends EventEmitter<Events> {
  private readonly filter = new ChatFilter();
  private readonly queue = new ReadQueue();
  private readonly entries: ChatLogEntry[] = [];
  private state: ReaderState = 'off';
  private current: QueueEntry | undefined;
  private paused = false;
  private learningReward = false;
  private running = false;
  private wakeUp: (() => void) | undefined;
  private interruptPause: (() => void) | undefined;
  /** The message the user skipped while it was being read. */
  private skipping: QueueEntry | undefined;
  private voice: string | undefined;
  /** Who was read last and when (names are said again only after someone else, or after a while). */
  private last: { userId: string; at: number } | undefined;
  /** A message plays: the next one can be rendered meanwhile. */
  private playing = false;
  /**
   * The next message, rendered while the current one plays: the gap between two messages no longer includes
   * the render time. Used only if the message, its text and the voice are still the same.
   */
  private prefetched: { entry: QueueEntry; text: string; result: Promise<{ speech: Speech; wav: Buffer } | undefined> } | undefined;
  private testCounter = 0;
  /** Who followed since the app started (read once each), and when the last follows were read. */
  private readonly followers = new Set<string>();
  private followTimes: number[] = [];

  constructor(private readonly options: ReaderOptions) {
    super();
  }

  get status(): ReaderStatus {
    return {
      state: this.state,
      current: this.current && item(this.current),
      queued: this.queue.list().map(item),
      voice: this.voice,
      learningReward: this.learningReward,
    };
  }

  get log(): ChatLogEntry[] {
    return [...this.entries];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
    this.options.sink().stop();
    this.interruptPause?.();
    this.wake();
  }

  /** Something changed that may let the reader go on (output connected, voice installed, settings). */
  wake(): void {
    this.wakeUp?.();
  }

  setVoice(voice: string | undefined): void {
    this.voice = voice;
    this.emitStatus();
  }

  // --- From the chat ---

  receive(message: ChatMessage): void {
    const settings = this.options.settings();
    if (this.learningReward && message.rewardId) {
      this.learningReward = false;
      this.options.onRewardLearned(message.rewardId);
      this.options.log('READER    reward learned');
    }
    // The language first: the filter says links and pronounces words in the message's own language.
    const language = this.languageOf(message);
    const verdict = this.filter.check(message, settings, this.options.ownUserId(), readingPack(language, this.options.packs()), message.receivedAt);
    if (!verdict.read) {
      this.addLog(message, 'skipped', verdict.reason);
      return;
    }
    const entry: QueueEntry = { message, body: verdict.body, language, readyAt: message.receivedAt + settings.modDelay * 1000 };
    this.addLog(message, 'queued');
    for (const dropped of this.queue.push(entry, settings.maxQueue)) this.addLog(dropped.message, 'skipped', 'queue-full');
    if (this.playing && !this.prefetched) this.prefetch();
    this.emitStatus();
    this.wake();
  }

  /** A follow, sub, gifted sub or raid: read before the waiting chat, in the main language, without mod delay. */
  event(event: ChannelEvent): void {
    const settings = this.options.settings();
    const packs = this.options.packs();
    const language = mainLanguage(settings.speechLanguage, packs);
    const pack = readingPack(language, packs);
    const texts = pack.texts;
    const say = (login: string, name: string) => (name ? (own(settings.nicknames, login) ?? spokenName(name, login, settings.cleanNames)) : texts.anonymous);
    const template = settings.eventTexts[event.kind] || defaultEventText(event.kind, language, event.count, packs);
    const tier = event.prime ? texts.prime : /^[123]000$/.test(event.tier) ? texts.tier.replace('{n}', event.tier[0]!) : '';
    const announcement = fillEventText(template, {
      name: say(event.login, event.name),
      count: String(event.count),
      months: String(event.months),
      recipient: event.recipient ? say(event.recipient.login, event.recipient.name) : '',
      tier,
    });
    const said = event.message ? eventMessageText(event.message, settings, pack) : '';
    const body = said ? `${announcement} ${said}` : announcement;
    const message: ChatMessage = {
      id: event.id,
      userId: event.userId || `anonymous-${event.id}`,
      login: event.login,
      name: event.name || texts.anonymous,
      text: body,
      fragments: [],
      roles: { broadcaster: false, moderator: false, vip: false, subscriber: false },
      bits: 0,
      fromOtherChannel: false,
      receivedAt: event.receivedAt,
      test: event.test,
      event: event.kind,
    };
    const reason = this.eventSkip(event, settings);
    if (reason) {
      this.addLog(message, 'skipped', reason);
      return;
    }
    this.addLog(message, 'queued');
    for (const dropped of this.queue.push({ message, body, language, readyAt: event.receivedAt }, settings.maxQueue)) this.addLog(dropped.message, 'skipped', 'queue-full');
    // Rendered early for the message after the current one, which is no longer next.
    if (this.prefetched && this.queue.peek() !== this.prefetched.entry) this.prefetched = undefined;
    if (this.playing && !this.prefetched) this.prefetch();
    this.emitStatus();
    this.wake();
  }

  /** Why an event is not read, if it is not: switched off, an ignored or blocked name, too many follows. */
  private eventSkip(event: ChannelEvent, settings: Settings): SkipReason | undefined {
    if (event.test) return undefined;
    if (!settings.events[groupOf(event.kind)]) return 'event-off';
    if (event.login && settings.ignoredUsers.includes(event.login)) return 'ignored-user';
    const names = [event.name, event.login, event.recipient?.name ?? '', event.recipient?.login ?? ''];
    if (names.some((name) => containsBlockedWord(name, settings.blockedWords))) return 'blocked-word';
    if (event.kind !== 'follow') return undefined;
    if (this.followers.has(event.userId)) return 'duplicate';
    this.followTimes = this.followTimes.filter((at) => event.receivedAt - at < 60_000);
    if (this.followTimes.length >= FOLLOWS_PER_MINUTE) return 'follow-limit';
    this.followTimes.push(event.receivedAt);
    if (this.followers.size >= FOLLOWERS_KEPT) this.followers.clear();
    this.followers.add(event.userId);
    return undefined;
  }

  /** A moderator deleted a message. */
  deleted(messageId: string): void {
    this.drop((e) => e.message.id === messageId, 'deleted');
  }

  /** A user was timed out or banned: their messages go. */
  userCleared(userId: string): void {
    this.drop((e) => e.message.userId === userId, 'user-cleared');
  }

  chatCleared(): void {
    this.drop(() => true, 'chat-cleared');
  }

  // --- From the UI ---

  pause(): void {
    this.paused = true;
    this.options.sink().stop();
    this.interruptPause?.();
    this.setState('paused');
  }

  resume(): void {
    this.paused = false;
    this.wake();
  }

  /** Stops the message being read; the next follows after the pause. */
  skip(): void {
    if (!this.current) return;
    this.skipping = this.current;
    this.options.sink().stop();
  }

  clear(): void {
    this.prefetched = undefined;
    for (const entry of this.queue.clear()) this.addLog(entry.message, 'skipped', 'cleared');
    this.emitStatus();
  }

  remove(id: string): void {
    this.drop((e) => e.message.id === id, 'removed');
  }

  learnReward(learn: boolean): void {
    this.learningReward = learn;
    this.emitStatus();
  }

  /** A message typed in the app, read like one from the chat (filters included). */
  test(text: string): void {
    const name = spokenTexts(this.options.settings().speechLanguage, this.options.packs()).testName;
    this.receive({
      id: `test-${++this.testCounter}`,
      userId: 'test',
      login: 'readmychat',
      name,
      text,
      fragments: [{ kind: 'text', text }],
      roles: { broadcaster: false, moderator: false, vip: false, subscriber: false },
      bits: 0,
      fromOtherChannel: false,
      receivedAt: Date.now(),
      test: true,
    });
  }

  /** An example of the event, read with its current text: the test buttons on the events page. */
  testEvent(kind: ChannelEventKind): void {
    const texts = spokenTexts(this.options.settings().speechLanguage, this.options.packs());
    const counts: Partial<Record<ChannelEventKind, number>> = { communityGift: 5, raid: 12 };
    this.event({
      id: `test-${++this.testCounter}`,
      kind,
      userId: 'test',
      login: 'readmychat',
      name: texts.testName,
      count: counts[kind] ?? (kind === 'gift' ? 1 : 0),
      months: kind === 'resub' ? 7 : 0,
      tier: '1000',
      prime: kind === 'prime',
      recipient: kind === 'gift' ? { login: 'maldoe', name: 'Maldö' } : undefined,
      receivedAt: Date.now(),
      test: true,
    });
  }

  /** The text as the voice says it, with the name in front when it is due (an event says its name itself). */
  spokenText(entry: QueueEntry, now = Date.now()): string {
    const settings = this.options.settings();
    const message = entry.message;
    if (message.event) return entry.body;
    const sayName =
      settings.readNames === 'always' ||
      (settings.readNames === 'changed' && (this.last?.userId !== message.userId || now - this.last.at > settings.nameRepeatSeconds * 1000));
    if (!sayName) return entry.body;
    const template = settings.template || spokenTexts(entry.language, this.options.packs()).says;
    const name = own(settings.nicknames, message.login) ?? spokenName(message.name, message.login, settings.cleanNames);
    return fillTemplate(template, name, entry.body);
  }

  /**
   * The language a message is read in: detected from its own words (not mentions or emotes, so "hello Maldö"
   * stays English) among the loaded packs, else the chat's main language.
   */
  private languageOf(message: ChatMessage): ChatLanguage {
    const settings = this.options.settings();
    const packs = this.options.packs();
    const main = mainLanguage(settings.speechLanguage, packs);
    if (!settings.detectLanguage) return main;
    const words = message.fragments
      .filter((f) => f.kind === 'text')
      .map((f) => f.text)
      .join(' ');
    return detectLanguage(words, packs) ?? main;
  }

  // --- Reading ---

  private async loop(): Promise<void> {
    while (this.running) {
      if (this.paused) {
        this.setState('paused');
        await this.sleep();
        continue;
      }
      const sink = this.options.sink();
      if (!sink.ready) {
        this.setState(this.queue.size ? 'waiting-output' : 'idle');
        await this.sleep();
        continue;
      }
      const now = Date.now();
      const entry = this.queue.next(now);
      if (!entry) {
        this.setState('idle');
        const at = this.queue.nextReadyAt();
        await this.sleep(at !== undefined ? at - now : undefined);
        continue;
      }
      const speech = await this.options.speech(entry.language).catch(() => undefined);
      if (!speech) {
        this.queue.putBack(entry);
        this.setState('no-voice');
        await this.sleep();
        continue;
      }
      await this.read(entry, speech, sink);
    }
    this.setState('off');
  }

  private async read(entry: QueueEntry, speech: Speech, sink: AudioSink): Promise<void> {
    const settings = this.options.settings();
    this.current = entry;
    // Always tell the UI: the state may already be 'reading' (the message before), the message is new.
    this.state = 'reading';
    this.emitStatus();
    const text = this.spokenText(entry);
    const early = this.prefetched;
    this.prefetched = undefined;
    let wav: Buffer | undefined;
    try {
      const ready = early?.entry === entry && early.text === text ? await early.result : undefined;
      wav = ready?.speech === speech ? ready.wav : await speech.synthesize(text);
    } catch (err) {
      this.options.log(`READER    speech failed: ${(err as Error).message}`);
      this.addLog(entry.message, 'skipped', 'speech-failed');
    }
    let played = false;
    // Deleted, skipped or paused while the voice was rendering: not read now.
    if (wav && this.current === entry && !this.paused && this.skipping !== entry) {
      if (!entry.message.event) this.last = { userId: entry.message.userId, at: Date.now() };
      this.playing = true;
      this.prefetch();
      try {
        await sink.play(wav, settings.volume / 100);
      } finally {
        this.playing = false;
      }
      played = true;
    }
    if (this.current === entry) {
      if (this.skipping === entry) this.addLog(entry.message, 'skipped', 'removed');
      else if (played) this.addLog(entry.message, 'read');
      // Paused before it was heard: read after resuming.
      else if (wav && this.paused) this.queue.putBack(entry);
    }
    this.skipping = undefined;
    this.current = undefined;
    this.emitStatus();
    if (played) await this.pauseBetween(settings.pauseBetween * 1000);
  }

  /** Renders the message that comes next while the current one plays (the name as if the current was the last). */
  private prefetch(): void {
    const next = this.queue.peek();
    if (!next) return;
    const text = this.spokenText(next);
    const result = this.options
      .speech(next.language)
      .then(async (speech) => (speech ? { speech, wav: await speech.synthesize(text) } : undefined))
      .catch(() => undefined);
    this.prefetched = { entry: next, text, result };
  }

  /** Removes queued messages (and stops the one being read) that match. */
  private drop(match: (entry: QueueEntry) => boolean, reason: SkipReason): void {
    if (this.prefetched && match(this.prefetched.entry)) this.prefetched = undefined;
    for (const entry of this.queue.remove(match)) this.addLog(entry.message, 'skipped', reason);
    const current = this.current;
    if (current && match(current)) {
      this.current = undefined;
      this.options.sink().stop();
      this.addLog(current.message, 'skipped', reason);
    }
    this.emitStatus();
  }

  /** Waits until woken (or for ms); new messages, settings or outputs wake it. */
  private sleep(ms?: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = ms !== undefined ? setTimeout(done, Math.max(0, ms)) : undefined;
      const self = this;
      function done(): void {
        clearTimeout(timer);
        if (self.wakeUp === done) self.wakeUp = undefined;
        resolve();
      }
      this.wakeUp = done;
    });
  }

  /** The pause between two messages: new messages do not cut it short, only pausing or stopping does. */
  private pauseBetween(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (this.interruptPause === done) this.interruptPause = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.interruptPause = done;
    });
  }

  private addLog(message: ChatMessage, outcome: ChatLogEntry['outcome'], reason?: SkipReason): void {
    const entry: ChatLogEntry = { id: message.id, at: Date.now(), name: message.name, text: message.text, outcome, reason, test: message.test, event: message.event };
    this.entries.push(entry);
    if (this.entries.length > LOG_SIZE) this.entries.splice(0, this.entries.length - LOG_SIZE);
    this.emit('log', entry);
  }

  private setState(state: ReaderState): void {
    if (state === this.state) return;
    this.state = state;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.status);
  }
}

function item(entry: QueueEntry): QueuedItem {
  return {
    id: entry.message.id,
    name: entry.message.name,
    text: entry.message.text,
    spoken: entry.body,
    language: entry.language,
    readyAt: entry.readyAt,
    test: entry.message.test,
    event: entry.message.event,
  };
}
