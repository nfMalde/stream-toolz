import { Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../ui/icon';
import { OutputSetup } from './output-setup';

/** Output: OBS browser source or audio device, the volume and a test. */
@Component({
  selector: 'rmc-output',
  imports: [Icon, OutputSetup],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('output.eyebrow') }}</div>
          <h1>{{ t('output.title') }}</h1>
          <p class="muted intro">{{ t('output.intro') }}</p>
        </div>
      </div>
      <section class="card">
        <div class="card-header">
          <div class="card-icon accent"><rmc-icon name="broadcast" /></div>
          <h2>{{ t('output.where') }}</h2>
        </div>
        <rmc-output-setup />
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
