// Messages waiting to be read, oldest first. Each may only be read from its readyAt on (mod delay);
// when there are too many, the oldest are dropped, so the voice never falls far behind the chat.
// Channel events (follows, subs, raids) wait in front of the chat and are dropped only when nothing else is left.

import type { ChatMessage } from '@stream-toolz/twitch';
import type { ChatLanguage } from './language';

export interface QueueEntry {
  message: ChatMessage;
  /** The message as the voice says it (without the name). */
  body: string;
  /** Read in this language, with its voice. */
  language: ChatLanguage;
  readyAt: number;
}

export class ReadQueue {
  private items: QueueEntry[] = [];

  /** Adds an entry (an event after the waiting events); returns the entries dropped to stay within maxSize. */
  push(entry: QueueEntry, maxSize: number): QueueEntry[] {
    if (entry.message.event) {
      const firstChat = this.items.findIndex((e) => !e.message.event);
      this.items.splice(firstChat < 0 ? this.items.length : firstChat, 0, entry);
    } else {
      this.items.push(entry);
    }
    const dropped: QueueEntry[] = [];
    while (this.items.length > Math.max(1, maxSize)) {
      const oldestChat = this.items.findIndex((e) => !e.message.event);
      dropped.push(...this.items.splice(Math.max(0, oldestChat), 1));
    }
    return dropped;
  }

  /** Takes the oldest entry that may be read now. */
  next(now: number): QueueEntry | undefined {
    const index = this.items.findIndex((e) => e.readyAt <= now);
    return index >= 0 ? this.items.splice(index, 1)[0] : undefined;
  }

  /** The entry that comes next, without taking it (to render it early). */
  peek(): QueueEntry | undefined {
    return this.items[0];
  }

  /** Puts an entry back at the front (it could not be read yet). */
  putBack(entry: QueueEntry): void {
    this.items.unshift(entry);
  }

  /** When the next entry may be read, if any waits. */
  nextReadyAt(): number | undefined {
    return this.items.length ? Math.min(...this.items.map((e) => e.readyAt)) : undefined;
  }

  remove(predicate: (entry: QueueEntry) => boolean): QueueEntry[] {
    const removed = this.items.filter(predicate);
    this.items = this.items.filter((e) => !predicate(e));
    return removed;
  }

  clear(): QueueEntry[] {
    return this.items.splice(0);
  }

  list(): readonly QueueEntry[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }
}
