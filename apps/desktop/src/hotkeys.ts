// System-wide shortcuts of all modules (ReadMyChat: pause, skip, clear): they work while a game has the focus, and a
// Stream Deck can send them (F13 to F24 are free for that). A key another program, or an earlier action, already
// holds is reported as 'taken'.

import { globalShortcut } from 'electron';
import type { HotkeyState, HotkeyStatus } from '@stream-toolz/core';

type Bindings = Record<string, { key: string; run: () => void }>;

export class Hotkeys {
  /** Per module, in the order the modules started. */
  private readonly modules = new Map<string, Bindings>();
  private registered: string[] = [];
  private suspended = false;
  private state: HotkeyStatus = {};

  constructor(
    private readonly onStatus: (status: HotkeyStatus) => void,
    private readonly log: (line: string) => void,
  ) {}

  get status(): HotkeyStatus {
    return this.state;
  }

  /** A module's shortcuts; the keys are registered again only when they changed. */
  set(moduleId: string, actions: Bindings): void {
    const before = this.modules.get(moduleId);
    this.modules.set(moduleId, { ...actions });
    if (before && sameKeys(before, actions)) return;
    if (!this.suspended) this.register();
  }

  /** The module stopped: its keys are free again. */
  remove(moduleId: string): void {
    if (!this.modules.delete(moduleId)) return;
    if (!this.suspended) this.register();
  }

  /** Off while the user records a new key in the app (the old one would catch it). */
  suspend(suspend: boolean): void {
    if (suspend === this.suspended) return;
    this.suspended = suspend;
    if (suspend) this.unregister();
    else this.register();
  }

  close(): void {
    this.unregister();
  }

  private register(): void {
    this.unregister();
    const state: HotkeyStatus = {};
    for (const [moduleId, actions] of this.modules) {
      const moduleState: Record<string, HotkeyState> = {};
      for (const [action, { key }] of Object.entries(actions)) {
        if (!key) {
          moduleState[action] = 'off';
          continue;
        }
        let ok = false;
        try {
          // false: another program holds the key (or another action here uses it). The action is looked up when the
          // key is pressed, so a module may replace its actions without the keys being registered again.
          ok = !this.registered.includes(key) && globalShortcut.register(key, () => this.modules.get(moduleId)?.[action]?.run());
        } catch {
          ok = false;
        }
        moduleState[action] = ok ? 'active' : 'taken';
        if (ok) this.registered.push(key);
        else this.log(`HOTKEYS   ${moduleId} ${action}: ${key} is taken`);
      }
      state[moduleId] = moduleState;
    }
    this.state = state;
    this.onStatus(state);
  }

  private unregister(): void {
    for (const key of this.registered) globalShortcut.unregister(key);
    this.registered = [];
  }
}

function sameKeys(a: Bindings, b: Bindings): boolean {
  const actions = Object.keys(a);
  return actions.length === Object.keys(b).length && actions.every((action) => a[action]?.key === b[action]?.key);
}
