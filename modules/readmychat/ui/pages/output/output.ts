import { Component, inject } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { OutputSetup } from './output-setup';

/** Output: OBS browser source or audio device, the volume and a test. */
@Component({
  selector: 'stz-output',
  imports: [Icon, OutputSetup],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('readmychat.output.eyebrow') }}</div>
          <h1>{{ t('readmychat.output.title') }}</h1>
          <p class="muted intro">{{ t('readmychat.output.intro') }}</p>
        </div>
      </div>
      <section class="card">
        <div class="card-header">
          <div class="card-icon accent"><stz-icon name="broadcast" /></div>
          <h2>{{ t('readmychat.output.where') }}</h2>
        </div>
        <stz-output-setup />
      </section>
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin-top: 6px; }
  `,
})
export class Output {
  protected readonly t = inject(I18n).t;
}
