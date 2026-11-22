import { Component, computed, inject } from '@angular/core';
import type { LanguagePackInfo } from '@stz/api';
import { I18n } from '@shell/i18n/i18n';
import { LanguagePacksStore } from '../../stores/language-packs.store';
import { ReadMyChatSettingsStore } from '../../stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { VoicePackages } from './voice-packages';
import { VoicePicker } from './voice-picker';

/** The chat's language, a voice per language pack, how it speaks, the language packs, and the optional voice downloads. */
@Component({
  selector: 'stz-voices',
  imports: [Icon, Segmented, Slider, Toggle, VoicePackages, VoicePicker],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('readmychat.voices.eyebrow') }}</div>
          <h1>{{ t('readmychat.voices.title') }}</h1>
          <p class="muted intro">{{ t('readmychat.voices.intro') }}</p>
        </div>
      </div>

      @if (s) {
        <div class="grid">
          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="mic" /></div>
              <h2>{{ t('readmychat.voices.choose') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.voices.language') }}</div>
                <div class="hint">{{ t('readmychat.voices.languageHint') }}</div>
              </div>
              <div class="control">
                <stz-segmented [options]="languages()" [value]="packs.main()?.locale ?? s.speechLanguage" (valueChange)="settings.update({ speechLanguage: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.voices.detect') }}</div>
                <div class="hint">{{ t('readmychat.voices.detectHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.detectLanguage" [label]="t('readmychat.voices.detect')" (checkedChange)="settings.update({ detectLanguage: $event })" /></div>
            </div>
            @for (pack of pickerPacks(); track pack.id) {
              <h3 class="picker-title">{{ t('readmychat.voices.voiceFor', { name: pack.name }) }}</h3>
              <stz-voice-picker [language]="pack.id" />
            }
          </section>

          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="sliders" /></div>
              <h2>{{ t('readmychat.voices.style') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.voices.rate') }}</div>
                <div class="hint">{{ t('readmychat.voices.rateHint') }}</div>
              </div>
            </div>
            <stz-slider [value]="s.rate" [min]="-10" [max]="10" [step]="1" [label]="t('readmychat.voices.rate')" [format]="rate" (changed)="settings.update({ rate: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.voices.commaPause') }}</div>
                <div class="hint">{{ t('readmychat.voices.commaPauseHint') }}</div>
              </div>
            </div>
            <stz-slider [value]="s.commaPause" [min]="0" [max]="1.5" [step]="0.05" [label]="t('readmychat.voices.commaPause')" [format]="seconds" (changed)="settings.update({ commaPause: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.voices.sentencePause') }}</div>
                <div class="hint">{{ t('readmychat.voices.sentencePauseHint') }}</div>
              </div>
            </div>
            <stz-slider [value]="s.sentencePause" [min]="0" [max]="1.5" [step]="0.05" [label]="t('readmychat.voices.sentencePause')" [format]="seconds" (changed)="settings.update({ sentencePause: $event })" />

            <div class="card-header packs-header">
              <div class="card-icon"><stz-icon name="folder" /></div>
              <div>
                <h2>{{ t('readmychat.voices.packs') }}</h2>
                <p class="faint small">{{ t('readmychat.voices.packsIntro') }}</p>
              </div>
            </div>
            <ul class="packs">
              @for (pack of packs.packs(); track pack.id) {
                <li>
                  <span class="name">{{ pack.name }}</span>
                  <span class="faint small num">{{ pack.locale }}</span>
                  <span class="chip" [class.ok]="!pack.builtIn">{{ t(pack.builtIn ? 'readmychat.voices.packBuiltIn' : 'readmychat.voices.packOwn') }}</span>
                </li>
              }
            </ul>
            <div class="row packs-actions">
              <button type="button" class="btn sm" (click)="packs.openFolder()"><stz-icon name="folder" [size]="14" />{{ t('readmychat.voices.packsFolder') }}</button>
              <button type="button" class="btn sm ghost" [disabled]="packs.reloading()" (click)="packs.reload()"><stz-icon name="refresh" [size]="14" />{{ t('readmychat.voices.packsReload') }}</button>
            </div>
            <p class="faint small packs-hint">{{ t('readmychat.voices.packsHint') }}</p>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="download" /></div>
              <div>
                <h2>{{ t('readmychat.voices.packages') }}</h2>
                <p class="faint small">{{ t('readmychat.voices.packagesIntro') }}</p>
              </div>
            </div>
            <stz-voice-packages />
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin-top: 6px; }
    .picker-title { margin: 16px 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-3); }
    .packs-header { margin-top: 24px; }
    .packs-header p { margin-top: 2px; }
    .packs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .packs li { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-elevated); }
    .packs .name { font-weight: 650; flex: 1; }
    .packs-actions { margin-top: 12px; gap: 8px; }
    .packs-hint { margin-top: 10px; }
  `,
})
export class Voices {
  protected readonly settings = inject(ReadMyChatSettingsStore);
  protected readonly packs = inject(LanguagePacksStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** The main language select: one entry per loaded pack, named in its own language. */
  protected readonly languages = computed<SegmentOption<string>[]>(() => this.packs.packs().map((pack) => ({ value: pack.locale, label: pack.name })));
  /** The main language's voice first; the others only when each message is read in its own language. */
  protected readonly pickerPacks = computed<LanguagePackInfo[]>(() => {
    const ordered = this.packs.ordered();
    return this.settings.settings()?.detectLanguage ? ordered : ordered.slice(0, 1);
  });
  protected readonly rate = (value: number) => (value === 0 ? this.t('readmychat.voices.rateNormal') : value > 0 ? `+${value}` : String(value));
  protected readonly seconds = (value: number) => `${this.i18n.number(value, 2)} s`;
}
