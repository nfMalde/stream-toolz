// What the overlay page shows for one chat message or channel event, mapped from the Twitch types. Everything in it is
// bounded and cleaned here, once: the page and the preview put these values into DOM nodes with textContent only,
// never into HTML, and the colour has passed the same check as the settings' colours.

import type { ChannelEvent, ChatMessage } from '@stream-toolz/twitch';
import type { ItemPart, OverlayItem, Role } from './item';
import { COLOR } from './settings';
import type { OverlayTexts } from './texts';

export type { ItemPart, OverlayItem, PartKind, Role } from './item';

/** Twitch allows 500 characters per message; longer text (a malformed event) is cut. */
export const MAX_TEXT = 500;
/** Ids as the page and the UI pass them around; Twitch's are UUIDs, follows have a timestamp in theirs. */
const MAX_ID = 128;
const MAX_NAME = 64;
/** Control and invisible characters (zero-width, bidi marks, line separators) never reach the page. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
/** More than two combining marks on a letter ("Zalgo" text) would spill over other lines. */
const ZALGO = /(\p{M}{2})\p{M}+/gu;
const EMOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function cleanText(value: string, max = MAX_TEXT): string {
  return value.replace(INVISIBLE, ' ').replace(ZALGO, '$1').replace(/\s+/g, ' ').slice(0, max);
}

function cleanId(value: string, fallback: string): string {
  const id = value.replace(/[^\w.:-]/g, '_').slice(0, MAX_ID);
  return id || fallback;
}

function cleanName(value: string): string {
  return cleanText(value, MAX_NAME).trim();
}

function roles(message: ChatMessage): Role[] {
  const list: Role[] = [];
  if (message.roles.broadcaster) list.push('broadcaster');
  if (message.roles.moderator) list.push('mod');
  if (message.roles.vip) list.push('vip');
  if (message.roles.subscriber) list.push('sub');
  return list;
}

/** A message's fragments as parts, cleaned, together at most MAX_TEXT characters; empty parts are left out. */
export function partsOf(message: ChatMessage): ItemPart[] {
  const parts: ItemPart[] = [];
  let length = 0;
  for (const fragment of message.fragments) {
    if (length >= MAX_TEXT) break;
    const room = MAX_TEXT - length;
    const last = parts.at(-1);
    // Emotes and mentions stay whole or are left out: a cut one would show a broken name.
    if (fragment.kind === 'emote' || fragment.kind === 'mention') {
      const text = cleanText(fragment.text).trim();
      if (text === '' || text.length > room) continue;
      if (last && last.kind === 'text' && !last.text.endsWith(' ')) last.text += ' ';
      const part: ItemPart = { kind: fragment.kind, text };
      if (fragment.kind === 'emote' && fragment.emoteId && EMOTE_ID.test(fragment.emoteId)) part.emoteId = fragment.emoteId;
      parts.push(part);
      length += text.length;
      continue;
    }
    // Cheermotes and unknown fragments are shown as their text.
    const text = cleanText(fragment.text, room);
    if (text === '') continue;
    if (last && last.kind === 'text') last.text += text;
    else parts.push({ kind: 'text', text });
    length += text.length;
  }
  // Leading and trailing blanks of the whole message are noise on the page.
  const first = parts[0];
  if (first?.kind === 'text') first.text = first.text.trimStart();
  const end = parts.at(-1);
  if (end?.kind === 'text') end.text = end.text.trimEnd();
  return parts.filter((part) => part.text !== '');
}

export function itemFromMessage(message: ChatMessage): OverlayItem {
  return {
    id: cleanId(message.id, `m-${message.receivedAt}`),
    kind: 'message',
    name: cleanName(message.name) || cleanName(message.login),
    color: message.color && COLOR.test(message.color) ? message.color.toLowerCase() : '',
    roles: roles(message),
    parts: partsOf(message),
    at: message.receivedAt,
    ...(message.test ? { test: true } : {}),
  };
}

/** The line for a follow, sub, gifted sub or raid, in the app's language. */
export function eventLine(event: ChannelEvent, texts: OverlayTexts): string {
  const name = cleanName(event.name) || cleanName(event.login) || texts.anonymous;
  const template = (event.count === 1 && texts.eventsOne[event.kind]) || texts.events[event.kind];
  const tier = event.prime ? texts.prime : texts.tier.replace('{n}', String(Math.max(1, Math.floor(Number(event.tier) / 1000) || 1)));
  const values: Record<string, string> = {
    name,
    count: String(event.count),
    months: String(event.months),
    recipient: cleanName(event.recipient?.name ?? '') || cleanName(event.recipient?.login ?? '') || '…',
    tier,
  };
  return cleanText(template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match));
}

export function itemFromEvent(event: ChannelEvent, texts: OverlayTexts): OverlayItem {
  return {
    id: cleanId(event.id, `e-${event.receivedAt}`),
    kind: 'event',
    name: cleanName(event.name),
    color: '',
    roles: [],
    parts: [{ kind: 'text', text: eventLine(event, texts) }],
    at: event.receivedAt,
    event: event.kind,
    ...(event.test ? { test: true } : {}),
  };
}
