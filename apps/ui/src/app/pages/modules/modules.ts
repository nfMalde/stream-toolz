import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../i18n/i18n';
import { MODULE_UIS } from '../../modules';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Toggle } from '../../ui/toggle';

/** The modules of Stream Toolz: each one switched on or off here. A module that is off does nothing and asks for nothing. */
@Component({
  selector: 'stz-modules',
  imports: [Icon, Toggle, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('modules.eyebrow') }}</div>
          <h1>{{ t('modules.title') }}</h1>
          <p class="muted intro">{{ t('modules.intro') }}</p>
        </div>
      </div>

      <div class="grid">
        @for (module of modules; track module.id) {
          @let on = settings.moduleEnabled(module.id);
          <section class="card span-6" [class.off]="!on">
            <div class="card-header">
              <div class="card-icon" [class.accent]="on"><stz-icon [name]="module.icon" /></div>
              <h2>{{ module.name }}</h2>
              <span class="spacer"></span>
              <stz-toggle [checked]="on" [label]="t(on ? 'modules.switchOff' : 'modules.switchOn', { name: module.name })" (checkedChange)="settings.setModuleEnabled(module.id, $event)" />
            </div>
            <p class="muted">{{ t(module.description) }}</p>
            <div class="foot">
              @if (on) {
                <a class="btn sm" [routerLink]="['/', module.id]">{{ t('modules.open') }}<stz-icon name="chevronRight" [size]="14" /></a>
              } @else {
                <span class="faint small">{{ t('modules.offHint') }}</span>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin-top: 6px; }
    .card.off .card-header h2 { color: var(--text-2); }
    .foot { margin-top: 14px; display: flex; align-items: center; min-height: 30px; }
  `,
})
export class ModulesPage {
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
  protected readonly modules = MODULE_UIS;
}
