import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { isValidHotkey, type HotkeyState } from '@stz/api';
import { acceleratorFrom, keyLabels } from '../core/hotkey';
import { STZ } from '../core/stz';
import { I18n } from '../i18n/i18n';
import { Icon } from './icon';

/**
 * One system-wide shortcut: shows its keys and whether it works, records a new one on "Change" (the app's
 * shortcuts are off meanwhile, so the old key does not fire), or switches it off.
 */
@Component({
  selector: 'stz-hotkey-field',
  imports: [Icon],
  template: `
    @if (recording()) {
      <span class="recording small"><span class="dot pulse"></span>{{ hint() ?? t('hotkey.recording') }}</span>
      <button type="button" class="btn sm ghost" (click)="stop()">{{ t('common.cancel') }}</button>
    } @else {
      @if (value()) {
        <span class="keys">
          @for (key of labels(); track $index) {
            <span class="kbd">{{ key }}</span>
          }
        </span>
        @if (state() === 'taken') {
          <span class="chip danger" [title]="t('hotkey.takenHint')">{{ t('hotkey.taken') }}</span>
        } @else if (state() === 'active') {
          <span class="chip ok">{{ t('hotkey.active') }}</span>
        }
      } @else {
        <span class="faint small">{{ t('hotkey.none') }}</span>
      }
      <button type="button" class="btn sm" (click)="start()"><stz-icon name="sliders" [size]="13" />{{ t('hotkey.change') }}</button>
      @if (value()) {
        <button type="button" class="btn sm ghost" (click)="changed.emit('')">{{ t('hotkey.off') }}</button>
      }
    }
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .keys { display: inline-flex; gap: 4px; }
    .recording { display: inline-flex; align-items: center; gap: 8px; color: var(--accent-text); max-width: 360px; }
  `,
})
export class HotkeyField {
  readonly value = input.required<string>();
  readonly state = input<HotkeyState>('off');
  readonly changed = output<string>();

  private readonly stz = inject(STZ);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly recording = signal(false);
  protected readonly hint = signal<string | undefined>(undefined);

  private readonly onKey = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) return this.stop();
    const accelerator = acceleratorFrom(event);
    // A modifier alone: wait for the key.
    if (!accelerator) return;
    if (!isValidHotkey(accelerator)) {
      this.hint.set(this.t('hotkey.needModifier'));
      return;
    }
    this.changed.emit(accelerator);
    this.stop();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected labels(): string[] {
    return keyLabels(this.value(), this.i18n.lang());
  }

  protected start(): void {
    this.hint.set(undefined);
    this.recording.set(true);
    void this.stz.suspendHotkeys(true).catch(() => undefined);
    document.addEventListener('keydown', this.onKey, true);
  }

  protected stop(): void {
    if (!this.recording()) return;
    this.recording.set(false);
    document.removeEventListener('keydown', this.onKey, true);
    void this.stz.suspendHotkeys(false).catch(() => undefined);
  }
}
