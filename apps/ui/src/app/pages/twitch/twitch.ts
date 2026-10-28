import { Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { TwitchStore } from '../../stores/twitch.store';
import { Icon } from '../../ui/icon';
import { AppForm } from './app-form';
import { ChannelField } from './channel-field';
import { LoginCard } from './login-card';

/** Twitch: the user's own app, the login and the channel to read. */
@Component({
  selector: 'rmc-twitch',
  imports: [Icon, AppForm, LoginCard, ChannelField],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('twitch.eyebrow') }}</div>
          <h1>{{ t('twitch.title') }}</h1>
          <p class="muted intro">{{ t('twitch.intro') }}</p>
        </div>
      </div>

      <section class="card">
        <div class="card-header">
          <div class="card-icon accent"><rmc-icon name="plug" /></div>
          <h2>{{ t('twitch.login') }}</h2>
        </div>
        <rmc-login-card />
        @if (twitch.hasApp()) {
          <div class="divider"></div>
          <rmc-channel-field />
        }
      </section>

      <section class="card">
        <div class="card-header">
          <div class="card-icon accent"><rmc-icon name="key" /></div>
          <div>
            <h2>{{ t('twitch.app') }}</h2>
            <p class="faint small">{{ t('twitch.appHint') }}</p>
          </div>
        </div>
        <rmc-app-form />
      </section>
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin-top: 6px; }
  `,
})
export class Twitch {
  protected readonly twitch = inject(TwitchStore);
  protected readonly t = inject(I18n).t;
}
