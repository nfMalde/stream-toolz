import { Component, computed, inject, signal } from '@angular/core';
import { BOT_LIMITS, BOT_PREFIX, newBotId, type BotSettings, type BotTimedMessage } from '@stz/api';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { BotSettingsStore } from '../../stores/settings.store';
import { BotBanners } from '../banners';

interface Draft {
  id: string | null;
  text: string;
  everyMinutes: number;
  minMessages: number;
}

const EMPTY: Draft = { id: null, text: '', everyMinutes: 15, minMessages: 5 };

/** Timed messages (list + form) and the bot's global settings. */
@Component({
  selector: 'stz-bot-timers',
  imports: [Icon, Slider, Toggle, BotBanners],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">Chat Bot</div>
          <h1>{{ t('bot.timers.title') }}</h1>
        </div>
      </div>

      <stz-bot-banners />

      @if (s) {
        <div class="grid">
          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="clock" /></div>
              <div>
                <h2>{{ t('bot.timers.list') }}</h2>
                <p class="faint small">{{ t('bot.timers.listHint', { n: s.timers.length, max: limits.timers }) }}</p>
              </div>
            </div>
            @for (timer of s.timers; track timer.id) {
              <div class="timer" [class.editing]="draft().id === timer.id">
                <div class="body">
                  <span class="text selectable">{{ timer.text }}</span>
                  <span class="faint small">{{ t('bot.timers.every', { n: timer.everyMinutes }) }} · {{ timer.minMessages ? t('bot.timers.minMessages', { n: timer.minMessages }) : t('bot.timers.always') }}</span>
                </div>
                <stz-toggle [checked]="timer.enabled" [label]="t('bot.timers.enabled')" (checkedChange)="setEnabled(timer, $event)" />
                <button type="button" class="btn sm ghost" (click)="edit(timer)"><stz-icon name="sliders" [size]="14" />{{ t('bot.timers.edit') }}</button>
                <button type="button" class="btn sm ghost icon-only" [title]="t('bot.timers.remove')" (click)="remove(timer)"><stz-icon name="trash" [size]="14" /></button>
              </div>
            } @empty {
              <div class="empty">
                <div class="card-icon"><stz-icon name="clock" /></div>
                <p>{{ t('bot.timers.empty') }}</p>
              </div>
            }

            <form class="stack form" (submit)="$event.preventDefault(); save()">
              <h3>{{ draft().id ? t('bot.timers.editTitle') : t('bot.timers.addTitle') }}</h3>
              <div class="field">
                <label for="timerText">{{ t('bot.timers.text') }}</label>
                <textarea id="timerText" class="input area" [attr.maxlength]="limits.response" [value]="draft().text" (input)="patch({ text: read($event) })" [placeholder]="t('bot.timers.textPlaceholder')"></textarea>
                <div class="row">
                  <p class="faint small spacer">{{ t('bot.timers.textHint') }}</p>
                  <span class="faint small num">{{ draft().text.length }}/{{ limits.response }}</span>
                </div>
              </div>
              <div class="grid inner">
                <div class="field span-6">
                  <label for="every">{{ t('bot.timers.everyLabel') }}</label>
                  <input id="every" class="input num" type="number" min="1" [max]="limits.everyMinutes" step="1" [value]="draft().everyMinutes" (input)="patch({ everyMinutes: number($event, 1, limits.everyMinutes) })" />
                  <p class="faint small">{{ t('bot.timers.everyHint') }}</p>
                </div>
                <div class="field span-6">
                  <label for="minMessages">{{ t('bot.timers.minMessagesLabel') }}</label>
                  <input id="minMessages" class="input num" type="number" min="0" [max]="limits.minMessages" step="1" [value]="draft().minMessages" (input)="patch({ minMessages: number($event, 0, limits.minMessages) })" />
                  <p class="faint small">{{ t('bot.timers.minMessagesHint') }}</p>
                </div>
              </div>
              <div class="row">
                <button type="submit" class="btn primary" [disabled]="!valid()"><stz-icon name="check" [size]="15" />{{ draft().id ? t('bot.timers.save') : t('bot.timers.add') }}</button>
                @if (draft().id) {
                  <button type="button" class="btn ghost" (click)="reset()">{{ t('common.cancel') }}</button>
                }
                @if (full()) {
                  <span class="faint small">{{ t('bot.timers.full', { max: limits.timers }) }}</span>
                }
              </div>
            </form>
          </section>

          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="sliders" /></div>
              <h2>{{ t('bot.settings.title') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('bot.settings.globalCooldown') }}</div>
                <div class="hint">{{ t('bot.settings.globalCooldownHint') }}</div>
              </div>
            </div>
            <stz-slider [value]="s.globalCooldownSeconds" [min]="0" [max]="limits.globalCooldown" [step]="1" [format]="secondsOff" [label]="t('bot.settings.globalCooldown')" (changed)="set({ globalCooldownSeconds: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('bot.settings.replyInThread') }}</div>
                <div class="hint">{{ t('bot.settings.replyInThreadHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.replyInThread" [label]="t('bot.settings.replyInThread')" (checkedChange)="set({ replyInThread: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('bot.settings.listCommand', { prefix: prefix }) }}</div>
                <div class="hint">{{ t('bot.settings.listCommandHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.listCommand" [label]="t('bot.settings.listCommand', { prefix: prefix })" (checkedChange)="set({ listCommand: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('bot.settings.prefix') }}</div>
                <div class="hint">{{ t('bot.settings.prefixHint') }}</div>
              </div>
              <div class="control"><span class="chip mono">{{ prefix }}</span></div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .timer { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
    .timer:first-of-type { border-top: 0; }
    .timer.editing { background: var(--accent-soft); margin: 0 -8px; padding: 10px 8px; border-radius: 8px; }
    .timer .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .timer .text { overflow-wrap: anywhere; }
    .form { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); gap: 14px; }
    .form h3 { font-size: 14px; font-weight: 650; }
    .area { height: 80px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
    .input.num { width: 120px; }
    .grid.inner { gap: 16px; }
    stz-slider { margin: 4px 0 10px; }
  `,
})
export class BotTimersPage {
  protected readonly settings = inject(BotSettingsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly prefix = BOT_PREFIX;
  protected readonly limits = BOT_LIMITS;
  protected readonly draft = signal<Draft>(EMPTY);
  protected readonly full = computed(() => !this.draft().id && this.settings.timers().length >= BOT_LIMITS.timers);
  protected readonly valid = computed(() => !this.full() && !!this.draft().text.trim());

  protected readonly secondsOff = (value: number) => (value === 0 ? this.t('common.off') : `${this.i18n.number(value, 0)} s`);

  protected set(change: Partial<BotSettings>): void {
    void this.settings.update(change);
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected number(event: Event, min: number, max: number): number {
    const n = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : min;
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected reset(): void {
    this.draft.set(EMPTY);
  }

  protected edit(timer: BotTimedMessage): void {
    this.draft.set({ id: timer.id, text: timer.text, everyMinutes: timer.everyMinutes, minMessages: timer.minMessages });
  }

  protected save(): void {
    if (!this.valid()) return;
    const d = this.draft();
    const existing = this.settings.timers().find((x) => x.id === d.id);
    const timer: BotTimedMessage = { id: existing?.id ?? newBotId(), text: d.text.trim(), everyMinutes: d.everyMinutes, minMessages: d.minMessages, enabled: existing?.enabled ?? true };
    const timers = existing ? this.settings.timers().map((x) => (x.id === existing.id ? timer : x)) : [...this.settings.timers(), timer];
    this.set({ timers });
    this.reset();
  }

  protected remove(timer: BotTimedMessage): void {
    this.set({ timers: this.settings.timers().filter((x) => x.id !== timer.id) });
    if (this.draft().id === timer.id) this.reset();
  }

  protected setEnabled(timer: BotTimedMessage, enabled: boolean): void {
    this.set({ timers: this.settings.timers().map((x) => (x.id === timer.id ? { ...x, enabled } : x)) });
  }
}
