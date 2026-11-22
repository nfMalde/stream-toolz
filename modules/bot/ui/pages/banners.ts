import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18n } from '@shell/i18n/i18n';
import { SettingsStore } from '@shell/stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon } from '@shell/ui/icon';

/**
 * The Twitch states the bot depends on, above its pages: not connected, the writing permission missing (a login
 * from before the module asked for it), a Twitch error; and the note that the bot writes as the streamer's own
 * account (the user decided 2026-10-28: no second bot account yet).
 */
@Component({
  selector: 'stz-bot-banners',
  imports: [Icon, RouterLink],
  template: `
    @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
      <div class="banner warn">
        <stz-icon name="plug" /><span class="spacer">{{ t('bot.banner.notConnected') }}</span>
        <button type="button" class="btn sm" (click)="app.openGuide()">{{ t('bot.banner.openGuide') }}</button>
      </div>
    } @else if (twitch.status()?.features?.chatWrite === 'needs-login') {
      <div class="banner warn">
        <stz-icon name="key" /><span class="spacer">{{ t('bot.banner.needsLogin') }}</span>
        <button type="button" class="btn sm" (click)="relogin()">{{ t('bot.banner.relogin') }}</button>
      </div>
    } @else if (twitch.stage() === 'error') {
      <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('bot.banner.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('bot.banner.toTwitch') }}</a></div>
    }
    <div class="banner info">
      <stz-icon name="user" />
      <span class="spacer">{{ t('bot.banner.ownAccount', { name: twitch.status()?.user?.name ?? '…' }) }}</span>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
  `,
})
export class BotBanners {
  protected readonly twitch = inject(TwitchStore);
  protected readonly app = inject(SettingsStore);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  /** A new login asks for the writing permission too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
