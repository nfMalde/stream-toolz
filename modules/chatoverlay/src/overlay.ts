// The overlay's state: the last few messages and notices as the page shows them. Messages pass the settings' filters
// (bots, commands, events off), moderation takes them out again (a deleted message, a timed-out user, a cleared
// chat), and every change goes to one listener, which the main process turns into server-sent events and UI events.
// Pure logic, tested in test/overlay.test.ts.

import type { ChannelEvent, ChatMessage } from '@stream-toolz/twitch';
import { itemFromEvent, itemFromMessage, type OverlayItem } from './overlay-item';
import type { Settings } from './settings';
import { overlayTexts } from './texts';

/** What changed: one new item, items gone (deleted, timed out, faded), or everything gone. */
export type OverlayChange = { type: 'item'; item: OverlayItem } | { type: 'remove'; ids: string[] } | { type: 'clear' };

export interface OverlayOptions {
  settings: () => Settings;
  /** The app's language ("de", "en"): the event lines. */
  language: () => string;
  onChange: (change: OverlayChange) => void;
  now?: () => number;
}

interface Entry {
  /** Who wrote it, for a timeout or ban; '' for events. */
  userId: string;
  item: OverlayItem;
}

/** Sample messages for the "Test messages" button: emotes, a mention, every role, and one event. */
const SAMPLES: { name: string; color: string; roles: ChatMessage['roles']; fragments: ChatMessage['fragments'] }[] = [
  { name: 'Maldoe', color: '#ff730f', roles: { broadcaster: true, moderator: false, vip: false, subscriber: true }, fragments: [{ kind: 'text', text: 'Willkommen im Chat! ' }, { kind: 'emote', text: 'Kappa', emoteId: '25' }] },
  { name: 'ModMax', color: '#1e90ff', roles: { broadcaster: false, moderator: true, vip: false, subscriber: true }, fragments: [{ kind: 'text', text: 'GG ' }, { kind: 'mention', text: '@Maldoe' }, { kind: 'text', text: ', that was close ' }, { kind: 'emote', text: 'PogChamp', emoteId: '305954156' }] },
  { name: 'Viewer_42', color: '', roles: { broadcaster: false, moderator: false, vip: true, subscriber: false }, fragments: [{ kind: 'text', text: 'erste Runde heute? ' }, { kind: 'emote', text: 'LUL', emoteId: '425618' }] },
  { name: 'xX_Dark_Lord_Xx', color: '#9147ff', roles: { broadcaster: false, moderator: false, vip: false, subscriber: false }, fragments: [{ kind: 'text', text: 'Hello from the other side 👋' }] },
];

export class ChatOverlay {
  private entries: Entry[] = [];
  private testCounter = 0;

  constructor(private readonly options: OverlayOptions) {}

  get items(): OverlayItem[] {
    return this.entries.map((entry) => entry.item);
  }

  /** A chat message, if the settings let it through. */
  receive(message: ChatMessage): void {
    const settings = this.options.settings();
    if (!message.test) {
      if (settings.hideBots.includes(message.login.toLowerCase())) return;
      if (settings.hideCommands && message.text.trimStart().startsWith('!')) return;
    }
    const item = itemFromMessage(message);
    if (item.parts.length === 0) return;
    this.push({ userId: message.userId, item });
  }

  /** A follow, sub, gifted sub or raid as a one-line notice. */
  event(event: ChannelEvent): void {
    if (!this.options.settings().showEvents && !event.test) return;
    this.push({ userId: '', item: itemFromEvent(event, overlayTexts(this.options.language())) });
  }

  /** A moderator deleted one message. */
  deleted(id: string): void {
    this.drop((entry) => entry.item.id === id);
  }

  /** A user was timed out or banned: their messages go. */
  userCleared(userId: string): void {
    if (!userId) return;
    this.drop((entry) => entry.userId === userId);
  }

  chatCleared(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.options.onChange({ type: 'clear' });
  }

  /** The settings changed: fewer messages allowed drops the oldest. */
  settingsChanged(): void {
    this.trim();
  }

  /** A few sample messages with emotes, a mention and roles, marked as tests, plus one follow. */
  test(): void {
    const now = this.options.now?.() ?? Date.now();
    for (const [index, sample] of SAMPLES.entries()) {
      this.testCounter++;
      this.receive({
        id: `test-${this.testCounter}`,
        userId: `test-user-${index}`,
        login: sample.name.toLowerCase(),
        name: sample.name,
        text: sample.fragments.map((fragment) => fragment.text).join(''),
        fragments: sample.fragments,
        roles: sample.roles,
        color: sample.color || undefined,
        bits: 0,
        fromOtherChannel: false,
        receivedAt: now + index,
        test: true,
      });
    }
    this.testCounter++;
    this.event({ id: `test-${this.testCounter}`, kind: 'follow', userId: 'test-user-f', login: 'newfollower', name: 'NewFollower', count: 0, months: 0, tier: '', prime: false, receivedAt: now + SAMPLES.length, test: true });
  }

  private push(entry: Entry): void {
    // The same id twice (a reconnect replays nothing, but a test id could repeat) replaces the older one.
    this.entries = this.entries.filter((e) => e.item.id !== entry.item.id);
    this.entries.push(entry);
    this.options.onChange({ type: 'item', item: entry.item });
    this.trim();
  }

  private trim(): void {
    const max = this.options.settings().maxMessages;
    if (this.entries.length <= max) return;
    const gone = this.entries.splice(0, this.entries.length - max);
    this.options.onChange({ type: 'remove', ids: gone.map((entry) => entry.item.id) });
  }

  private drop(matches: (entry: Entry) => boolean): void {
    const gone = this.entries.filter(matches);
    if (gone.length === 0) return;
    this.entries = this.entries.filter((entry) => !matches(entry));
    this.options.onChange({ type: 'remove', ids: gone.map((entry) => entry.item.id) });
  }
}
