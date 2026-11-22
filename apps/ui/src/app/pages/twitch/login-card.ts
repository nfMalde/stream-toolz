import { Component, computed, inject, signal } from '@angular/core';
import type { TwitchError } from '@stz/api';
import { I18n, type TextKey } from '../../i18n/i18n';
import { TwitchStore } from '../../stores/twitch.store';
import { Icon } from '../../ui/icon';

/** Login with the streamer's app by code: Twitch's page opens with the code filled in; the status follows here. */
@Component({
  selector: 'stz-login-card',
  imports: [Icon],
  template: `
    @let status = twitch.status();
    @let user = status?.user;
    @if (!twitch.hasApp()) {
      <div class="banner warn"><stz-icon name="key" />{{ t('login.needApp') }}</div>
    } @else if (status?.stage === 'logging-in') {
      <div class="code-login">
        <div class="code-text">
          <b>{{ t('login.waiting') }}</b>
          <p class="faint small">{{ t('login.waitingHint') }}</p>
          <p class="faint small scope"><stz-icon name="shield" [size]="13" /> {{ scopeHint() }}</p>
        </div>
        @if (status?.login; as login) {
          <div class="code" [title]="t('login.codeTitle')">{{ login.userCode }}</div>
        }
        <div class="row wrap actions">
          <button type="button" class="btn sm" (click)="twitch.reopenLogin()"><stz-icon name="external" [size]="14" />{{ t('login.reopen') }}</button>
          <button type="button" class="btn sm" (click)="copy()"><stz-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? t('common.copied') : t('login.copyCode') }}</button>
          <button type="button" class="btn sm ghost" (click)="twitch.cancelLogin()">{{ t('common.cancel') }}</button>
        </div>
      </div>
    } @else if (twitch.loggedIn() && user) {
      <div class="row wrap">
        <div class="card-icon" [class.ok]="twitch.connected()"><stz-icon name="user" /></div>
        <div class="spacer">
          <b>{{ t('login.as', { name: user.name }) }}</b>
          <div class="faint small">
            @if (twitch.connected()) {
              {{ t('login.reading', { channel: status?.channel?.name ?? '' }) }}
            } @else if (status?.stage === 'connecting') {
              {{ t('login.connecting') }}
            }
          </div>
        </div>
        <button type="button" class="btn" (click)="twitch.login()">{{ t('login.switch') }}</button>
        <button type="button" class="btn ghost" (click)="twitch.logout()">{{ t('login.logout') }}</button>
      </div>
    } @else {
      <div class="row wrap">
        <p class="muted spacer">{{ t('login.intro') }}</p>
        <button type="button" class="btn primary" (click)="twitch.login()"><stz-icon name="plug" [size]="16" />{{ t('login.button') }}</button>
      </div>
    }
    @if (error(); as key) {
      <div class="banner danger error">
        <stz-icon name="alert" />
        <div>
          {{ t(key) }}
          @if (status?.message) { <div class="small faint mono selectable">{{ status?.message }}</div> }
        </div>
      </div>
    }
  `,
  styles: `
    .card-icon.ok { background: var(--ok-soft); color: var(--ok); }
    .error { margin-top: 12px; }
    .code-login { display: grid; grid-template-columns: 1fr auto; gap: 10px 20px; align-items: center; }
    .code-text p { margin-top: 2px; max-width: 520px; }
    .scope { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
    .code {
      font-family: var(--font-mono); font-size: 28px; font-weight: 700; letter-spacing: .18em; padding: 10px 18px;
      border-radius: 12px; border: 1px solid rgba(var(--accent-rgb), .45); background: var(--accent-soft); color: var(--text);
      user-select: text;
    }
    .actions { grid-column: 1 / -1; }
  `,
})
export class LoginCard {
  protected readonly twitch = inject(TwitchStore);
  protected readonly t = inject(I18n).t;
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    await this.twitch.copyCode();
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /** The permissions this login asks for, as Twitch will list them. */
  protected readonly scopeHint = computed(() => {
    const features = this.twitch.status()?.asks ?? [];
    return this.t('login.scopeHint', { list: features.map((feature) => this.t(`login.feature.${feature}` as TextKey)).join(', ') });
  });

  protected readonly error = computed<TextKey | undefined>(() => {
    const error: TwitchError | undefined = this.twitch.status()?.error;
    return error ? (`twitchError.${error}` as TextKey) : undefined;
  });
}
