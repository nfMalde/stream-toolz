import { Component, computed, inject, input } from '@angular/core';
import type { ChatLanguage, VoiceChoice } from '@stz/api';
import { voiceName } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { LanguagePacksStore } from '../../stores/language-packs.store';
import { ReadMyChatSettingsStore } from '../../stores/settings.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon } from '@shell/ui/icon';

/** The installed voices for one language pack: pick one (or automatic) and listen to each. */
@Component({
  selector: 'stz-voice-picker',
  imports: [Icon],
  template: `
    @let s = settings.settings();
    @if (s) {
      <div class="voices" role="radiogroup" [attr.aria-label]="t('readmychat.voices.choose')">
        @if (installed().length) {
          <div class="voice" [class.active]="!chosen()">
            <button type="button" role="radio" class="pick focusable" [attr.aria-checked]="!chosen()" (click)="choose('')">
              <span class="radio"></span>
              <span class="name">{{ t('readmychat.voices.auto') }}</span>
              <span class="faint small">{{ t('readmychat.voices.autoHint') }}</span>
            </button>
          </div>
        }
        @for (voice of installed(); track voice.id) {
          <div class="voice" [class.active]="chosen() === voice.id">
            <button type="button" role="radio" class="pick focusable" [attr.aria-checked]="chosen() === voice.id" (click)="choose(voice.id)">
              <span class="radio"></span>
              <span class="name">{{ label(voice) }}</span>
              <span class="chip">{{ engine(voice) }}</span>
              @if (voice.gender) { <span class="faint small">{{ t(voice.gender === 'male' ? 'readmychat.voices.male' : 'readmychat.voices.female') }}</span> }
            </button>
            <button type="button" class="btn sm ghost" [disabled]="voices.previewing() !== null" (click)="voices.preview(voice.id)">
              <stz-icon [name]="voices.previewing() === voice.id ? 'volume' : 'play'" [size]="14" />{{ t('readmychat.voices.listen') }}
            </button>
          </div>
        } @empty {
          <div class="banner warn"><stz-icon name="alert" />{{ t(isMain() ? 'readmychat.voices.none' : 'readmychat.voices.noneOther') }}</div>
        }
      </div>
    }
  `,
  styles: `
    .voices { display: flex; flex-direction: column; gap: 6px; }
    .voice { display: flex; align-items: center; gap: 10px; padding: 4px 8px 4px 4px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); }
    .voice.active { border-color: rgba(var(--accent-rgb), .5); background: linear-gradient(90deg, var(--accent-soft), transparent 70%); }
    .pick {
      flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 10px; border: 0; border-radius: 10px;
      background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer;
    }
    .radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-strong); flex: none; }
    .active .radio { border-color: var(--accent); background: radial-gradient(circle, var(--accent) 0 40%, transparent 45%); }
    .name { font-weight: 650; }
  `,
})
export class VoicePicker {
  /** The language pack (its id) whose voice is chosen here. */
  readonly language = input.required<ChatLanguage>();

  protected readonly settings = inject(ReadMyChatSettingsStore);
  protected readonly voices = inject(VoicesStore);
  private readonly packs = inject(LanguagePacksStore);
  protected readonly t = inject(I18n).t;

  protected readonly installed = computed(() => this.voices.installedFor()[this.language()] ?? []);
  protected readonly isMain = computed(() => this.packs.mainId() === this.language());
  /** The chosen voice id ('' = automatic); the setting may not have a key for this pack yet. */
  protected readonly chosen = computed(() => this.settings.settings()?.voices[this.language()] ?? '');

  protected choose(id: string): void {
    const voices = this.settings.settings()?.voices;
    if (voices) void this.settings.update({ voices: { ...voices, [this.language()]: id } });
  }

  protected label(voice: VoiceChoice): string {
    return voice.label ?? voiceName(voice.id);
  }

  protected engine(voice: VoiceChoice): string {
    if (voice.engine === 'sherpa') return voice.id.startsWith('vits:') ? 'VITS' : 'Kokoro';
    return voice.engine === 'piper' ? 'Piper' : 'Windows';
  }
}
