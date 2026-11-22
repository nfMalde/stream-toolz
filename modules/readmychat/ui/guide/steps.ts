import { Component, inject } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { OutputSetup } from '../pages/output/output-setup';
import { VoicePackages } from '../pages/voices/voice-packages';
import { VoicePicker } from '../pages/voices/voice-picker';
import { LanguagePacksStore } from '../stores/language-packs.store';

const STYLES = `
  .intro { max-width: 680px; margin-bottom: 16px; }
  .other { margin-top: 10px; }
`;

/** Setup assistant: the voice packages to download and the voice for the chat's main language. */
@Component({
  selector: 'stz-guide-voice',
  imports: [VoicePackages, VoicePicker],
  template: `
    <p class="muted intro">{{ t('readmychat.guide.voiceText') }}</p>
    <stz-voice-packages [compact]="true" />
    <div class="divider"></div>
    <stz-voice-picker [language]="packs.mainId()" />
    <p class="faint small other">{{ t('readmychat.guide.voiceOther') }}</p>
  `,
  styles: STYLES,
})
export class VoiceStep {
  protected readonly packs = inject(LanguagePacksStore);
  protected readonly t = inject(I18n).t;
}

/** Setup assistant: the OBS browser source or an audio device. */
@Component({
  selector: 'stz-guide-output',
  imports: [OutputSetup],
  template: `
    <p class="muted intro">{{ t('readmychat.guide.outputText') }}</p>
    <stz-output-setup [compact]="true" />
  `,
  styles: STYLES,
})
export class OutputStep {
  protected readonly t = inject(I18n).t;
}
