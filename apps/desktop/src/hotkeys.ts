// System-wide shortcuts (pause, skip, clear): they work while a game has the focus, and a Stream Deck can send
// them (F13 to F24 are free for that). A key another program already holds is reported as 'taken'.

import { globalShortcut } from 'electron';
import { HOTKEY_ACTIONS, type HotkeyAction, type HotkeyStatus, type Settings } from '@stream-toolz/runtime';

export class Hotkeys {
  private registered: string[] = [];
  private current: Settings['hotkeys'] | undefined;
  private suspended = false;
  private state: HotkeyStatus = { pause: 'off', skip: 'off', clear: 'off' };

  constructor(
    private readonly actions: Record<HotkeyAction, () => void>,
    private readonly onStatus: (status: HotkeyStatus) => void,
    private readonly log: (line: string) => void,
  ) {}

  get status(): HotkeyStatus {
    return this.state;
  }

  /** Registers the keys of the settings (again only when they changed). */
  apply(hotkeys: Settings['hotkeys']): void {
    if (this.current && HOTKEY_ACTIONS.every((a) => this.current![a] === hotkeys[a])) return;
    this.current = { ...hotkeys };
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
    const state: HotkeyStatus = { pause: 'off', skip: 'off', clear: 'off' };
    for (const action of HOTKEY_ACTIONS) {
      const key = this.current?.[action];
      if (!key) continue;
      let ok = false;
      try {
        // false: another program holds the key (or another action here uses it).
        ok = !this.registered.includes(key) && globalShortcut.register(key, this.actions[action]);
      } catch {
        ok = false;
      }
      state[action] = ok ? 'active' : 'taken';
      if (ok) this.registered.push(key);
      else this.log(`HOTKEYS   ${action}: ${key} is taken`);
    }
    this.state = state;
    this.onStatus(state);
  }

  private unregister(): void {
    for (const key of this.registered) globalShortcut.unregister(key);
    this.registered = [];
  }
}
