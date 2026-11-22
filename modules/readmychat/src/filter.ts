// Decides per message whether it is read, and what the voice says. Remembers recent texts (duplicates)
// and how much each person wrote (limit per minute). Pure logic, tested in test/filter.test.ts.

import type { ChatMessage } from '@stream-toolz/twitch';
import type { SkipReason } from './api';
import type { Settings } from './settings';
import type { ReadingPack } from './spoken';
import { spokenMessage, type TextOptions } from './text';

export type Verdict = { read: true; body: string } | { read: false; reason: SkipReason };

const MINUTE_MS = 60_000;

export class ChatFilter {
  /** Normalized text → when it was last accepted. */
  private readonly recentTexts = new Map<string, number>();
  /** User id → when their accepted messages came (last minute). */
  private readonly perUser = new Map<string, number[]>();

  /** ownUserId: the logged-in account (its own messages may be left out); pack: the language the message is read in. */
  check(message: ChatMessage, settings: Settings, ownUserId: string | undefined, pack: ReadingPack, now = Date.now()): Verdict {
    const skip = (reason: SkipReason): Verdict => ({ read: false, reason });
    const test = !!message.test;

    if (message.fromOtherChannel && !settings.sharedChat) return skip('shared-chat');
    if (!test && !settings.readOwn && ownUserId && message.userId === ownUserId) return skip('own-message');
    if (settings.ignoredUsers.includes(message.login)) return skip('ignored-user');
    if (!test && settings.audience === 'privileged') {
      const r = message.roles;
      if (!r.broadcaster && !r.moderator && !r.vip && !r.subscriber) return skip('audience');
    }
    if (!test && settings.audience === 'reward' && (!settings.rewardId || message.rewardId !== settings.rewardId)) return skip('reward');
    if (settings.skipCommands && message.text.trimStart().startsWith('!')) return skip('command');
    if (containsBlockedWord(message.text, settings.blockedWords)) return skip('blocked-word');

    const spoken = spokenMessage(message, textOptions(settings, pack));
    if (spoken.hasLink && settings.links === 'skip-message') return skip('link');
    if (spoken.emoteOnly) return skip('emote-only');
    if (!spoken.text) return skip('empty');

    if (!test) {
      this.forget(now, settings);
      const key = spoken.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const seen = this.recentTexts.get(key);
      if (settings.duplicateSeconds > 0 && seen !== undefined && now - seen < settings.duplicateSeconds * 1000) return skip('duplicate');
      const times = this.perUser.get(message.userId) ?? [];
      if (settings.userLimit > 0 && times.length >= settings.userLimit) return skip('user-limit');
      this.recentTexts.set(key, now);
      this.perUser.set(message.userId, [...times, now]);
    }
    return { read: true, body: spoken.text };
  }

  reset(): void {
    this.recentTexts.clear();
    this.perUser.clear();
  }

  /** Drops what is too old to matter, so the maps stay small on a busy chat. */
  private forget(now: number, settings: Settings): void {
    const textAge = Math.max(settings.duplicateSeconds * 1000, 1);
    for (const [key, at] of this.recentTexts) if (now - at >= textAge) this.recentTexts.delete(key);
    for (const [user, times] of this.perUser) {
      const recent = times.filter((t) => now - t < MINUTE_MS);
      if (recent.length) this.perUser.set(user, recent);
      else this.perUser.delete(user);
    }
  }
}

/**
 * The text that came with an event (a resub), cleaned like a chat message; '' where a filter would skip it.
 * Duplicates and the limit per person do not count: an event comes once.
 */
export function eventMessageText(message: ChatMessage, settings: Settings, pack: ReadingPack): string {
  if (containsBlockedWord(message.text, settings.blockedWords)) return '';
  const spoken = spokenMessage(message, textOptions(settings, pack));
  if (spoken.emoteOnly || (spoken.hasLink && settings.links === 'skip-message')) return '';
  return spoken.text;
}

/** The pack's own pronunciations first, the streamer's over them. */
function textOptions(settings: Settings, pack: ReadingPack): TextOptions {
  return {
    links: settings.links,
    linkWord: pack.texts.link,
    collapseRepeats: settings.collapseRepeats,
    maxLength: settings.maxLength,
    cleanNames: settings.cleanNames,
    nicknames: settings.nicknames,
    pronunciations: Object.keys(pack.pronounce).length ? { ...pack.pronounce, ...settings.pronunciations } : settings.pronunciations,
  };
}

/** Whole words only ("arsch" is not in "Barschbecken"); a phrase with spaces matches as a whole. */
export function containsBlockedWord(text: string, words: string[]): boolean {
  if (!words.length) return false;
  const lower = text.toLowerCase();
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(lower);
  });
}
