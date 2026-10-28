import { Component, computed, inject } from '@angular/core';
import type { ChatLanguage } from '@rmc/api';
import { I18n } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';
import { Toggle } from '../../ui/toggle';
import { VoicePackages } from './voice-packages';
import { VoicePicker } from './voice-picker';

/** The chat's language, the voice, how it speaks, and the optional voice downloads. */
@Component({
  selector: 'rmc-voices',
  imports: [Icon, Segmented, Slider, Toggle, VoicePackages, VoicePicker],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('voices.eyebrow') }}</div>
          <h1>{{ t('voices.title') }}</h1>
          <p class="muted intro">{{ t('voices.intro') }}</p>
        </div>
      </div>

      @if (s) {
        <div class="grid">
          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="mic" /></div>
              <h2>{{ t('voices.choose') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('voices.language') }}</div>
                <div class="hint">{{ t('voices.languageHint') }}</div>
              </div>
              <div class="control">
                <rmc-segmented [options]="languages" [value]="s.speechLanguage" (valueChange)="settings.update({ speechLanguage: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('voices.detect') }}</div>
                <div class="hint">{{ t('voices.detectHint') }}</div>
              </div>
              <div class="control"><rmc-toggle [checked]="s.detectLanguage" [label]="t('voices.detect')" (checkedChange)="settings.update({ detectLanguage: $event })" /></div>
            </div>
            @for (language of pickerLanguages(); track language) {
              <h3 class="picker-title">{{ t(language === 'de' ? 'voices.voiceDe' : 'voices.voiceEn') }}</h3>
              <rmc-voice-picker [language]="language" />
            }
          </section>

          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="sliders" /></div>
              <h2>{{ t('voices.style') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('voices.rate') }}</div>
                <div class="hint">{{ t('voices.rateHint') }}</div>
              </div>
            </div>
            <rmc-slider [value]="s.rate" [min]="-10" [max]="10" [step]="1" [label]="t('voices.rate')" [format]="rate" (changed)="settings.update({ rate: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('voices.commaPause') }}</div>
                <div class="hint">{{ t('voices.commaPauseHint') }}</div>
              </div>
            </div>
            <rmc-slider [value]="s.commaPause" [min]="0" [max]="1.5" [step]="0.05" [label]="t('voices.commaPause')" [format]="seconds" (changed)="settings.update({ commaPause: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('voices.sentencePause') }}</div>
                <div class="hint">{{ t('voices.sentencePauseHint') }}</div>
              </div>
            </div>
            <rmc-slider [value]="s.sentencePause" [min]="0" [max]="1.5" [step]="0.05" [label]="t('voices.sentencePause')" [format]="seconds" (changed)="settings.update({ sentencePause: $event })" />
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="download" /></div>
              <div>
                <h2>{{ t('voices.packages') }}</h2>
                <p class="faint small">{{ t('voices.packagesIntro') }}</p>
              </div>
            </div>
            <rmc-voice-packages />
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin-top: 6px; }
    .picker-title { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-3); }
  `,
})
export class Voices {
  protected readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly languages: SegmentOption<string>[] = [
    { value: 'de-DE', label: 'Deutsch' },
    { value: 'en-US', label: 'English' },
  ];
  /** The main language's voice first; the other one only when each message is read in its own language. */
  protected readonly pickerLanguages = computed<ChatLanguage[]>(() => {
    const s = this.settings.settings();
    const main: ChatLanguage = s?.speechLanguage.startsWith('de') ? 'de' : 'en';
    return s?.detectLanguage ? [main, main === 'de' ? 'en' : 'de'] : [main];
  });
  protected readonly rate = (value: number) => (value === 0 ? this.t('voices.rateNormal') : value > 0 ? `+${value}` : String(value));
  protected readonly seconds = (value: number) => `${this.i18n.number(value, 2)} s`;
}
