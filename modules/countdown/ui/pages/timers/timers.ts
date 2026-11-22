import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { formatRemaining, isDone, isPaused, MINUTE_MS, remainingMs, type Align, type FontFamily, type Output, type TimeFormat, type Timer } from '@stz/api';
import { clock } from '@shell/core/format';
import { STZ } from '@shell/core/stz';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { OutputStore } from '@shell/stores/output.store';
import { Icon } from '@shell/ui/icon';
import { Secret } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { CountdownSettingsStore } from '../../stores/settings.store';
import { CountdownStore } from '../../stores/timers.store';

/**
 * Countdown's one page: a phrase starts a timer ("in 15 Minuten", "bis 20:30 Pause"), the running timers with
 * their controls, where they show (the OBS overlay, a text file, both) and how the overlay looks.
 */
@Component({
  selector: 'stz-countdown-timers',
  imports: [Icon, Secret, Segmented, Slider, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('countdown.timers.eyebrow') }}</div>
          <h1>{{ t('countdown.timers.title') }}</h1>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" [disabled]="!store.timers().length" (click)="store.clear()"><stz-icon name="trash" [size]="16" />{{ t('countdown.timers.clear') }}</button>
        </div>
      </div>

      <div class="grid">
        <section class="card span-12">
          <div class="card-header">
            <div class="card-icon accent"><stz-icon name="clock" /></div>
            <div>
              <h2>{{ t('countdown.start.title') }}</h2>
              <p class="muted">{{ t('countdown.start.hint') }}</p>
            </div>
          </div>
          <div class="start-row">
            <input class="input big" [class.invalid]="store.error() === 'not-understood'" [value]="phrase()" [placeholder]="t('countdown.start.placeholder')"
                   autocomplete="off" spellcheck="false" [attr.aria-label]="t('countdown.start.title')"
                   (input)="phrase.set(read($event)); store.clearError()" (keydown.enter)="start()" />
            <button type="button" class="btn primary lg" [disabled]="!phrase().trim() || starting()" (click)="start()"><stz-icon name="play" [size]="16" />{{ t('countdown.start.button') }}</button>
          </div>
          @if (store.error(); as error) {
            <div class="row wrap feedback">
              <span class="chip danger"><span class="dot"></span>{{ t(error === 'too-many' ? 'countdown.start.tooMany' : 'countdown.start.notUnderstood') }}</span>
            </div>
          }
          <p class="faint small examples">{{ t('countdown.start.examples') }}</p>

          @if (!store.timers().length) {
            <div class="empty">{{ t('countdown.timers.empty') }}</div>
          } @else {
            <div class="timers">
              @for (timer of store.timers(); track timer.id) {
                @let paused = isPaused(timer);
                @let done = isDone(timer, store.now());
                <div class="timer" [class.done]="done" [class.paused]="paused">
                  <div class="info">
                    <div class="label">{{ timer.label || t('countdown.timer.untitled') }}</div>
                    <div class="meta row wrap">
                      @if (paused) {
                        <span class="chip warn"><span class="dot"></span>{{ t('countdown.timer.paused') }}</span>
                      } @else if (done) {
                        <span class="chip ok"><span class="dot pulse"></span>{{ t('countdown.timer.done') }}</span>
                      } @else {
                        <span class="faint small">{{ t('countdown.timer.endsAt', { time: endsAt(timer) }) }}</span>
                      }
                    </div>
                  </div>
                  <div class="time num">{{ remaining(timer) }}</div>
                  <div class="buttons">
                    <button type="button" class="btn sm" [disabled]="done" (click)="paused ? store.resume(timer.id) : store.pause(timer.id)">
                      <stz-icon [name]="paused ? 'play' : 'pause'" [size]="14" />{{ paused ? t('countdown.timer.resume') : t('countdown.timer.pause') }}
                    </button>
                    <button type="button" class="btn sm ghost num" [title]="t('countdown.timer.minus')" [disabled]="done" (click)="store.adjust(timer.id, -minute)">−1 min</button>
                    <button type="button" class="btn sm ghost num" [title]="t('countdown.timer.plus')" (click)="store.adjust(timer.id, minute)">+1 min</button>
                    <button type="button" class="btn sm ghost icon-only" [title]="t('countdown.timer.remove')" [attr.aria-label]="t('countdown.timer.remove')" (click)="store.remove(timer.id)"><stz-icon name="x" [size]="14" /></button>
                  </div>
                </div>
              }
            </div>
          }
        </section>

        @if (s) {
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="broadcast" /></div>
              <div>
                <h2>{{ t('countdown.output.title') }}</h2>
                <p class="muted">{{ t('countdown.output.intro') }}</p>
              </div>
            </div>
            <stz-segmented [options]="outputs()" [value]="s.output" (valueChange)="settings.update({ output: $event })" />
            <p class="faint small mode-hint">{{ t(outputHint(s.output)) }}</p>

            @if (s.output !== 'file') {
              <div class="status row">
                @if (output.portInUse()) {
                  <span class="chip danger"><span class="dot"></span>{{ t('countdown.output.portInUse') }}</span>
                } @else if (store.clients() > 0) {
                  <span class="chip ok"><span class="dot"></span>{{ t('countdown.output.connected', { count: store.clients() }) }}</span>
                } @else {
                  <span class="chip warn"><span class="dot pulse"></span>{{ t('countdown.output.waiting') }}</span>
                }
              </div>
              <div class="field">
                <span class="label">{{ t('countdown.output.url') }}</span>
                <div class="copy-row">
                  <code class="url selectable"><stz-secret [value]="store.url()" /></code>
                  <button type="button" class="btn sm" (click)="copy()"><stz-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? t('common.copied') : t('common.copy') }}</button>
                  <button type="button" class="btn sm ghost" (click)="stz.countdown.openUrl()"><stz-icon name="external" [size]="14" />{{ t('countdown.output.open') }}</button>
                </div>
                <p class="faint small">{{ t('countdown.output.urlHint') }}</p>
              </div>
              <ol class="steps">
                <li><div><b>{{ t('countdown.output.obs.step1') }}</b><p class="faint small">{{ t('countdown.output.obs.step1Hint') }}</p></div></li>
                <li><div><b>{{ t('countdown.output.obs.step2') }}</b><p class="faint small">{{ t('countdown.output.obs.step2Hint') }}</p></div></li>
                <li><div><b>{{ t('countdown.output.obs.step3') }}</b><p class="faint small">{{ t('countdown.output.obs.step3Hint') }}</p></div></li>
              </ol>
            }

            @if (s.output !== 'overlay') {
              <div class="field" [class.after-overlay]="s.output === 'both'">
                <span class="label">{{ t('countdown.output.folder') }}</span>
                <div class="copy-row">
                  <code class="url selectable"><stz-secret [value]="store.folder()" /></code>
                  <button type="button" class="btn sm" (click)="stz.countdown.pickFolder()"><stz-icon name="folder" [size]="14" />{{ t('countdown.output.choose') }}</button>
                  <button type="button" class="btn sm ghost" (click)="stz.countdown.openFolder()"><stz-icon name="external" [size]="14" />{{ t('countdown.output.openFolder') }}</button>
                  @if (s.folder) {
                    <button type="button" class="btn sm ghost" (click)="settings.update({ folder: '' })">{{ t('countdown.output.defaultFolder') }}</button>
                  }
                </div>
                @if (store.folderError()) {
                  <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('countdown.output.folderError') }}</span></div>
                }
                <p class="faint small">{{ t('countdown.output.filesHint') }}</p>
              </div>
              <ol class="steps">
                <li><div><b>{{ t('countdown.output.file.step1') }}</b><p class="faint small">{{ t('countdown.output.file.step1Hint') }}</p></div></li>
                <li><div><b>{{ t('countdown.output.file.step2') }}</b><p class="faint small">{{ t('countdown.output.file.step2Hint') }}</p></div></li>
              </ol>
            }
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="sliders" /></div>
              <div>
                <h2>{{ t('countdown.look.title') }}</h2>
                <p class="muted">{{ t('countdown.look.intro') }}</p>
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('countdown.look.format') }}</div>
                <div class="hint">{{ t('countdown.look.formatHint') }}</div>
              </div>
              <div class="control">
                <select class="input select" [value]="s.format" (change)="setFormat($event)">
                  @for (format of formats; track format) {
                    <option [value]="format" [selected]="format === s.format">{{ t(formatLabel(format)) }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('countdown.look.doneText') }}</div>
                <div class="hint">{{ t('countdown.look.doneTextHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.showDoneText" [label]="t('countdown.look.doneText')" (checkedChange)="settings.update({ showDoneText: $event })" /></div>
            </div>
            @if (s.showDoneText) {
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.doneTextValue') }}</div>
                  <div class="hint">{{ t('countdown.look.doneTextValueHint') }}</div>
                </div>
                <div class="control">
                  <input class="input done-text" [value]="doneText()" [placeholder]="t('countdown.look.doneTextPlaceholder')" maxlength="100"
                         (input)="doneText.set(read($event))" (change)="saveDoneText()" (keydown.enter)="saveDoneText()" />
                </div>
              </div>
            }
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('countdown.look.doneHide') }}</div>
                <div class="hint">{{ t('countdown.look.doneHideHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.doneSeconds > 0" [label]="t('countdown.look.doneHide')" (checkedChange)="settings.update({ doneSeconds: $event ? 30 : 0 })" /></div>
            </div>
            @if (s.doneSeconds > 0) {
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.doneSeconds') }}</div>
                  <div class="hint">{{ t('countdown.look.doneSecondsHint') }}</div>
                </div>
                <div class="control wide"><stz-slider [value]="s.doneSeconds" [min]="5" [max]="600" [step]="5" [format]="seconds" [label]="t('countdown.look.doneSeconds')" (changed)="settings.update({ doneSeconds: $event })" /></div>
              </div>
            }

            @if (s.output !== 'file') {
              <div class="divider"></div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.fontSize') }}</div>
                  <div class="hint">{{ t('countdown.look.fontSizeHint') }}</div>
                </div>
                <div class="control wide"><stz-slider [value]="s.fontSize" [min]="24" [max]="400" [step]="4" [format]="pixels" [label]="t('countdown.look.fontSize')" (changed)="settings.update({ fontSize: $event })" /></div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.font') }}</div>
                  <div class="hint">{{ t('countdown.look.fontHint') }}</div>
                </div>
                <div class="control">
                  <select class="input select" [value]="s.fontFamily" (change)="setFont($event)">
                    @for (font of fonts; track font) {
                      <option [value]="font" [selected]="font === s.fontFamily">{{ t(fontLabel(font)) }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.color') }}</div>
                </div>
                <div class="control color-control">
                  <input type="color" class="color" [value]="s.color" [attr.aria-label]="t('countdown.look.color')" (change)="settings.update({ color: read($event) })" />
                  <code class="mono small">{{ s.color }}</code>
                </div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.align') }}</div>
                </div>
                <div class="control"><stz-segmented [options]="aligns()" [value]="s.align" (valueChange)="settings.update({ align: $event })" /></div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.shadow') }}</div>
                  <div class="hint">{{ t('countdown.look.shadowHint') }}</div>
                </div>
                <div class="control"><stz-toggle [checked]="s.shadow" [label]="t('countdown.look.shadow')" (checkedChange)="settings.update({ shadow: $event })" /></div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('countdown.look.showLabel') }}</div>
                  <div class="hint">{{ t('countdown.look.showLabelHint') }}</div>
                </div>
                <div class="control"><stz-toggle [checked]="s.showLabel" [label]="t('countdown.look.showLabel')" (checkedChange)="settings.update({ showLabel: $event })" /></div>
              </div>
              @if (s.showLabel) {
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('countdown.look.labelSize') }}</div>
                  </div>
                  <div class="control wide"><stz-slider [value]="s.labelSize" [min]="12" [max]="200" [step]="2" [format]="pixels" [label]="t('countdown.look.labelSize')" (changed)="settings.update({ labelSize: $event })" /></div>
                </div>
              }
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .start-row { display: flex; gap: 10px; align-items: stretch; }
    .input.big { flex: 1; min-width: 0; height: 48px; font-size: 18px; padding: 0 16px; }
    .feedback { margin-top: 10px; }
    .examples { margin: 10px 0 0; max-width: 720px; }
    .empty { margin-top: 18px; }
    .timers { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
    .timer {
      display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 14px 18px; border-radius: 14px;
      background: var(--bg-elevated); border: 1px solid var(--border);
    }
    .timer .info { flex: 1; min-width: 160px; }
    .timer .label { font-weight: 650; font-size: 16px; overflow-wrap: anywhere; }
    .timer .meta { margin-top: 4px; min-height: 20px; }
    .timer .time { font-size: 40px; font-weight: 750; letter-spacing: 0.01em; line-height: 1; min-width: 140px; text-align: right; }
    .timer.paused .time { color: var(--text-3); }
    .timer.done .time { color: var(--accent); }
    .timer .buttons { display: flex; gap: 6px; flex-wrap: wrap; }
    .mode-hint { margin: 8px 0 14px; max-width: 680px; }
    .status { margin-bottom: 12px; }
    .copy-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .url { padding: 6px 10px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border-strong); max-width: 100%; overflow-wrap: anywhere; }
    .field { margin-bottom: 16px; }
    .field .banner { margin: 10px 0; }
    .after-overlay { margin-top: 20px; }
    .steps b { display: block; }
    .steps p { margin: 2px 0 0; max-width: 640px; }
    .select { min-width: 240px; max-width: 360px; }
    .done-text { width: 280px; max-width: 100%; }
    .color-control { display: flex; align-items: center; gap: 10px; }
    .color { width: 48px; height: 36px; padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg-elevated); cursor: pointer; }
    .divider { margin: 6px 0; }
  `,
})
export class CountdownPage {
  protected readonly settings = inject(CountdownSettingsStore);
  protected readonly store = inject(CountdownStore);
  protected readonly output = inject(OutputStore);
  protected readonly stz = inject(STZ);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly phrase = signal('');
  protected readonly starting = signal(false);
  protected readonly copied = signal(false);
  /** Follows the setting until the user types; saved when they leave the field or press Enter. */
  protected readonly doneText = linkedSignal(() => this.settings.settings()?.doneText ?? '');

  protected readonly minute = MINUTE_MS;
  protected readonly isPaused = isPaused;
  protected readonly isDone = isDone;
  protected readonly formats: readonly TimeFormat[] = ['auto', 'mm:ss', 'hh:mm:ss', 'minutes'];
  protected readonly fonts: readonly FontFamily[] = ['sans', 'mono', 'serif', 'rounded'];
  protected readonly outputs = computed<SegmentOption<Output>[]>(() => [
    { value: 'overlay', label: this.t('countdown.output.overlay') },
    { value: 'file', label: this.t('countdown.output.file') },
    { value: 'both', label: this.t('countdown.output.both') },
  ]);
  protected readonly aligns = computed<SegmentOption<Align>[]>(() => [
    { value: 'left', label: this.t('countdown.look.align.left') },
    { value: 'center', label: this.t('countdown.look.align.center') },
    { value: 'right', label: this.t('countdown.look.align.right') },
  ]);
  protected readonly seconds = (value: number) => `${value} s`;
  protected readonly pixels = (value: number) => `${value} px`;

  protected read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** The same text OBS shows (the format from the settings), counted down by the page's own clock. */
  protected remaining(timer: Timer): string {
    return formatRemaining(remainingMs(timer, this.store.now()), this.settings.settings()?.format ?? 'auto');
  }

  protected endsAt(timer: Timer): string {
    return clock(timer.endsAt, this.i18n.locale());
  }

  protected outputHint(output: Output): TextKey {
    return output === 'overlay' ? 'countdown.output.overlayHint' : output === 'file' ? 'countdown.output.fileHint' : 'countdown.output.bothHint';
  }

  protected formatLabel(format: TimeFormat): TextKey {
    return format === 'auto' ? 'countdown.look.format.auto' : format === 'mm:ss' ? 'countdown.look.format.mmss' : format === 'hh:mm:ss' ? 'countdown.look.format.hhmmss' : 'countdown.look.format.minutes';
  }

  protected fontLabel(font: FontFamily): TextKey {
    return font === 'sans' ? 'countdown.look.font.sans' : font === 'mono' ? 'countdown.look.font.mono' : font === 'serif' ? 'countdown.look.font.serif' : 'countdown.look.font.rounded';
  }

  protected async start(): Promise<void> {
    const phrase = this.phrase().trim();
    if (!phrase || this.starting()) return;
    this.starting.set(true);
    try {
      if (await this.store.start(phrase)) this.phrase.set('');
    } finally {
      this.starting.set(false);
    }
  }

  protected setFormat(event: Event): void {
    const value = this.read(event);
    if (this.formats.includes(value as TimeFormat)) void this.settings.update({ format: value as TimeFormat });
  }

  protected setFont(event: Event): void {
    const value = this.read(event);
    if (this.fonts.includes(value as FontFamily)) void this.settings.update({ fontFamily: value as FontFamily });
  }

  protected saveDoneText(): void {
    const value = this.doneText().trim();
    if (value !== (this.settings.settings()?.doneText ?? '')) void this.settings.update({ doneText: value });
  }

  protected async copy(): Promise<void> {
    await this.stz.countdown.copyUrl();
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
