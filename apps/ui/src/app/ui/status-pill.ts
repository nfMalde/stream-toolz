import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n, type TextKey } from '../i18n/i18n';
import { TwitchStore } from '../stores/twitch.store';

/** Title bar: the Twitch connection at a glance; a click opens the Twitch page. */
@Component({
  selector: 'stz-status-pill',
  imports: [RouterLink],
  template: `
    <a routerLink="/twitch" [class]="'pill focusable ' + tone()" [title]="t('pill.open')">
      <span class="dot" [class.pulse]="tone() === 'busy' || tone() === 'ok'"></span>
      <span class="label">{{ label() }}</span>
    </a>
  `,
  styles: `
    .pill {
      display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 12px; border-radius: 99px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-2); font-size: 12px; font-weight: 600;
      text-decoration: none; white-space: nowrap; max-width: 420px;
    }
    .label { overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
    .ok { color: var(--ok); border-color: rgba(52, 211, 153, .3); background: var(--ok-soft); }
    .busy { color: var(--live); border-color: rgba(34, 211, 238, .3); background: var(--live-soft); }
    .warn { color: var(--warn); border-color: rgba(250, 204, 21, .3); background: var(--warn-soft); }
    .danger { color: #ff8aa0; border-color: rgba(251, 72, 104, .3); background: var(--danger-soft); }
    .pulse { animation: pulse 1.6s ease-in-out infinite; }
  `,
})
export class StatusPill {
  private readonly twitch = inject(TwitchStore);
  protected readonly t = inject(I18n).t;

  protected readonly tone = computed(() => {
    const status = this.twitch.status();
    if (!status) return 'busy';
    switch (status.stage) {
      case 'connected':
        return 'ok';
      case 'connecting':
      case 'logging-in':
        return 'busy';
      case 'error':
        return 'danger';
      default:
        return 'warn';
    }
  });

  protected readonly label = computed(() => {
    const status = this.twitch.status();
    if (!status) return this.t('pill.connecting');
    if (status.stage === 'connected') return this.t('pill.connected', { channel: status.channel?.name ?? '' });
    return this.t(`pill.${status.stage}` as TextKey);
  });
}
