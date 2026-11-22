import { Component, inject, linkedSignal } from '@angular/core';
import type { AppSettings, FolderId } from '@stz/api';
import { STZ } from '../../core/stz';
import { StreamerMode } from '../../core/streamer';
import { I18n } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Toggle } from '../../ui/toggle';

/** The app's own settings: language, streamer mode, the local port, the data folders. Each module has its own page. */
@Component({
  selector: 'stz-settings',
  imports: [Icon, Segmented, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('settings.eyebrow') }}</div>
          <h1>{{ t('settings.title') }}</h1>
        </div>
      </div>

      @if (s) {
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="pc" /></div>
              <h2>{{ t('settings.app') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.language') }}</div>
                <div class="hint">{{ t('settings.languageHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="appLanguages" [value]="s.language" (valueChange)="set({ language: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.streamerMode') }}</div>
                <div class="hint">{{ t('settings.streamerModeHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="streamer.enabled()" [label]="t('settings.streamerMode')" (checkedChange)="streamer.toggle()" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.port') }}</div>
                <div class="hint">{{ t('settings.portHint') }}</div>
              </div>
              <div class="control">
                <input class="input port num" type="number" min="1024" max="65535" [value]="port()" (input)="port.set(read($event))" (change)="savePort()" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.folders') }}</div>
                <div class="hint">{{ t('settings.foldersHint') }}</div>
              </div>
              <div class="control">
                <button type="button" class="btn sm" (click)="open('data')"><stz-icon name="folder" [size]="14" />{{ t('settings.folderData') }}</button>
                <button type="button" class="btn sm" (click)="open('logs')"><stz-icon name="folder" [size]="14" />{{ t('settings.folderLogs') }}</button>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .port { width: 110px; }
  `,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsStore);
  protected readonly streamer = inject(StreamerMode);
  private readonly stz = inject(STZ);
  protected readonly t = inject(I18n).t;

  protected readonly appLanguages: SegmentOption<string>[] = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];

  /** Typed, saved on change (the main process validates and returns what it kept). */
  protected readonly port = linkedSignal(() => String(this.settings.settings()?.serverPort ?? ''));

  protected set(change: Partial<AppSettings>): void {
    void this.settings.update(change);
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected savePort(): void {
    const port = Number(this.port());
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) this.set({ serverPort: port });
    else this.port.set(String(this.settings.settings()?.serverPort ?? ''));
  }

  protected open(folder: FolderId): void {
    void this.stz.openFolder(folder);
  }
}
