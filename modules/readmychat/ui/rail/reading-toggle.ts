import { Component, inject } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Toggle } from '@shell/ui/toggle';
import { ReaderStore } from '../stores/reader.store';

/** At the bottom of the navigation: reading on or off. Pausing keeps the queue; the chat keeps coming in. */
@Component({
  selector: 'stz-reading-toggle',
  imports: [Icon, Toggle],
  template: `
    <div class="reading" [class.paused]="reader.paused()">
      <stz-icon [name]="reader.paused() ? 'volumeOff' : 'volume'" [size]="20" />
      <div class="reading-text">
        <b>{{ t('readmychat.app.reading') }}</b>
        <span class="small">{{ reader.paused() ? t('readmychat.app.readingPaused') : t('readmychat.app.readingOn') }}</span>
      </div>
      <stz-toggle [checked]="!reader.paused()" [label]="reader.paused() ? t('readmychat.app.resume') : t('readmychat.app.pause')" (checkedChange)="reader.togglePause()" />
    </div>
  `,
  styles: `
    .reading {
      display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 12px;
      border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--ok);
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .reading-text { flex: 1; display: flex; flex-direction: column; line-height: 1.25; }
    .reading-text b { color: var(--text); }
    .reading-text span { color: var(--text-2); }
    .reading.paused { color: #ff8aa0; background: var(--danger-soft); border-color: rgba(251, 72, 104, 0.35); }
    .reading.paused .reading-text span { color: #ff8aa0; }
  `,
})
export class ReadingToggle {
  protected readonly reader = inject(ReaderStore);
  protected readonly t = inject(I18n).t;
}
