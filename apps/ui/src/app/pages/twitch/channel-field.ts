import { Component, inject, linkedSignal } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';

/** Which channel's chat is read: empty for the own channel (a mod can read the streamer's chat). */
@Component({
  selector: 'rmc-channel-field',
  template: `
    <div class="setting">
      <div class="text">
        <div class="title">{{ t('channel.title') }}</div>
        <div class="hint">{{ t('channel.hint') }}</div>
      </div>
      <div class="control">
        <input class="input" spellcheck="false" autocomplete="off" [value]="value()" [placeholder]="t('channel.placeholder')"
               (input)="value.set(read($event))" (change)="save()" (keydown.enter)="save()" />
      </div>
    </div>
  `,
})
export class ChannelField {
  private readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
  protected readonly value = linkedSignal(() => this.settings.settings()?.channel ?? '');

  protected read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected save(): void {
    if (this.value() !== this.settings.settings()?.channel) void this.settings.update({ channel: this.value() });
  }
}
