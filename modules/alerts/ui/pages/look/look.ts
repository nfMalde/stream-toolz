import { Component, computed, inject } from '@angular/core';
import { ALERT_ANIMATIONS, ALERT_FONTS, ALERT_POSITIONS, type AlertAnimation, type AlertFont, type AlertPosition, type AlertStyle } from '@stz/api';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { AlertsStore } from '../../stores/alerts.store';
import { AlertsSettingsStore } from '../../stores/settings.store';

/** How the alerts look in OBS: font, colours, placement, animation, the resub message; a preview and a test. */
@Component({
  selector: 'stz-alerts-look',
  imports: [Icon, Segmented, Slider, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('alerts.look.eyebrow') }}</div>
          <h1>{{ t('alerts.look.title') }}</h1>
          <p class="muted intro">{{ t('alerts.look.intro') }}</p>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" [title]="t('alerts.look.testHint')" (click)="alerts.test('resub')"><stz-icon name="play" [size]="15" />{{ t('alerts.look.test') }}</button>
        </div>
      </div>

      @if (s) {
        @let st = s.style;
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="eye" /></div>
              <h2>{{ t('alerts.look.preview') }}</h2>
            </div>
            <div class="stage" [attr.data-position]="st.position">
              <div class="alert" [attr.data-font]="st.fontFamily" [style.--size]="previewSize() + 'px'" [style.--text]="st.textColor" [style.--accent]="st.accentColor" [style.--bg]="st.background">
                <div class="kind">{{ t('alerts.look.previewKind') }}</div>
                <div class="title">{{ t('alerts.look.previewTitle') }}</div>
                @if (st.showMessage) {
                  <div class="message">{{ t('alerts.look.previewMessage') }}</div>
                }
              </div>
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="sliders" /></div>
              <h2>{{ t('alerts.look.text') }}</h2>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.fontSize') }}</div></div>
              <div class="control wide"><stz-slider [value]="st.fontSize" [min]="16" [max]="120" [step]="2" [format]="px" [label]="t('alerts.look.fontSize')" (changed)="set({ fontSize: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.fontFamily') }}</div></div>
              <div class="control"><stz-segmented [options]="fonts()" [value]="st.fontFamily" (valueChange)="set({ fontFamily: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('alerts.look.showMessage') }}</div>
                <div class="hint">{{ t('alerts.look.showMessageHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="st.showMessage" [label]="t('alerts.look.showMessage')" (checkedChange)="set({ showMessage: $event })" /></div>
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="sparkle" /></div>
              <h2>{{ t('alerts.look.colors') }}</h2>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.textColor') }}</div></div>
              <div class="control"><input type="color" class="color" [value]="st.textColor" [attr.aria-label]="t('alerts.look.textColor')" (change)="set({ textColor: value($event) })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('alerts.look.accentColor') }}</div>
                <div class="hint">{{ t('alerts.look.accentColorHint') }}</div>
              </div>
              <div class="control"><input type="color" class="color" [value]="st.accentColor" [attr.aria-label]="t('alerts.look.accentColor')" (change)="set({ accentColor: value($event) })" /></div>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.background') }}</div></div>
              <div class="control"><input type="color" class="color" [value]="background().color" [attr.aria-label]="t('alerts.look.background')" (change)="setBackground(value($event), background().opacity)" /></div>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.backgroundOpacity') }}</div></div>
              <div class="control wide"><stz-slider [value]="background().opacity" [min]="0" [max]="100" [step]="5" [format]="percent" [label]="t('alerts.look.backgroundOpacity')" (changed)="setBackground(background().color, $event)" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="broadcast" /></div>
              <h2>{{ t('alerts.look.placement') }}</h2>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.position') }}</div></div>
              <div class="control"><stz-segmented [options]="positions()" [value]="st.position" (valueChange)="set({ position: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.look.animation') }}</div></div>
              <div class="control"><stz-segmented [options]="animations()" [value]="st.animation" (valueChange)="set({ animation: $event })" /></div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .intro { max-width: 760px; margin-top: 6px; }
    .stage {
      display: flex; flex-direction: column; align-items: center; justify-content: flex-start; min-height: 220px; padding: 16px;
      border-radius: 12px; border: 1px solid var(--border); background: repeating-conic-gradient(#2a2420 0% 25%, #1c1713 0% 50%) 0 0 / 24px 24px;
    }
    .stage[data-position="center"] { justify-content: center; }
    .stage[data-position="bottom"] { justify-content: flex-end; }
    .alert {
      --font: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      max-width: 100%; padding: calc(var(--size) * .45) calc(var(--size) * .7); border-radius: calc(var(--size) * .35);
      background: var(--bg); color: var(--text); font-family: var(--font); text-align: center;
      border-left: calc(var(--size) * .18) solid var(--accent); box-shadow: 0 10px 40px -10px rgba(0, 0, 0, .7);
    }
    .alert[data-font="mono"] { --font: ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace; }
    .alert[data-font="serif"] { --font: Georgia, "Times New Roman", serif; }
    .alert[data-font="rounded"] { --font: "Arial Rounded MT Bold", "Varela Round", "Nunito", "Comic Sans MS", sans-serif; }
    .alert .kind { font-size: calc(var(--size) * .4); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: calc(var(--size) * .15); }
    .alert .title { font-size: var(--size); font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; text-shadow: 0 2px 6px rgba(0, 0, 0, .5); }
    .alert .message { font-size: calc(var(--size) * .55); line-height: 1.35; margin-top: calc(var(--size) * .25); opacity: .92; }
    .color { width: 56px; height: 36px; padding: 2px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--bg-elevated); cursor: pointer; }
  `,
})
export class LookPage {
  protected readonly settings = inject(AlertsSettingsStore);
  protected readonly alerts = inject(AlertsStore);
  protected readonly t = inject(I18n).t;

  protected readonly px = (value: number) => `${value} px`;
  protected readonly percent = (value: number) => `${value} %`;
  /** The preview is smaller than the stream: half the size, so the box fits the card. */
  protected readonly previewSize = computed(() => Math.round((this.settings.settings()?.style.fontSize ?? 40) / 2));

  protected readonly fonts = computed<SegmentOption<AlertFont>[]>(() => ALERT_FONTS.map((value) => ({ value, label: this.t(`alerts.look.font.${value}` as TextKey) })));
  protected readonly positions = computed<SegmentOption<AlertPosition>[]>(() => ALERT_POSITIONS.map((value) => ({ value, label: this.t(`alerts.look.position.${value}` as TextKey) })));
  protected readonly animations = computed<SegmentOption<AlertAnimation>[]>(() => ALERT_ANIMATIONS.map((value) => ({ value, label: this.t(`alerts.look.animation.${value}` as TextKey) })));

  /** The background as the colour picker and the opacity slider show it (#rrggbbaa split in two). */
  protected readonly background = computed(() => splitBackground(this.settings.settings()?.style.background ?? '#0d0a07cc'));

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected set(change: Partial<AlertStyle>): void {
    const style = this.settings.settings()?.style;
    if (style) void this.settings.update({ style: { ...style, ...change } });
  }

  protected setBackground(color: string, opacity: number): void {
    const alpha = Math.round((Math.max(0, Math.min(100, opacity)) / 100) * 255);
    // Always as hex, also at 0 %: the colour stays in the picker when the opacity comes back.
    this.set({ background: `${color}${alpha.toString(16).padStart(2, '0')}` });
  }
}

function splitBackground(background: string): { color: string; opacity: number } {
  if (background === 'transparent') return { color: '#000000', opacity: 0 };
  const hex = background.length === 4 ? `#${[...background.slice(1)].map((c) => c + c).join('')}` : background;
  const color = hex.slice(0, 7);
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255;
  return { color, opacity: Math.round((alpha / 255) * 100) };
}
