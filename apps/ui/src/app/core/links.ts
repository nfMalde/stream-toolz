import { computed, inject, Injectable, resource } from '@angular/core';
import type { LinkId } from '@stz/api';
import type { IconName } from '../ui/icon';
import { STZ } from './stz';

/** Donations (pure donations, no perks) and Maldö's channels, in the order they are shown (as in GT Toolz). */
export const SUPPORT_LINKS: readonly LinkId[] = ['paypal', 'patreon'];
export const CHANNEL_LINKS: readonly LinkId[] = ['twitch', 'youtube', 'facebook', 'x', 'instagram'];

/** Names as the services write them (the same in every language). */
export const LINK_NAMES: Record<LinkId, string> = {
  patreon: 'Patreon',
  paypal: 'PayPal',
  twitch: 'Twitch',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  instagram: 'Instagram',
  twitchConsole: 'Twitch Developer Console',
  twitchSecurity: 'Twitch',
  obs: 'OBS Studio',
};

export const LINK_ICONS: Record<LinkId, IconName> = {
  patreon: 'heart',
  paypal: 'heart',
  twitch: 'twitch',
  youtube: 'youtube',
  facebook: 'facebook',
  x: 'xBrand',
  instagram: 'instagram',
  twitchConsole: 'external',
  twitchSecurity: 'external',
  obs: 'external',
};

/**
 * The web pages the app may open (main process: a fixed list, https only, in the browser, only on a click; the app
 * loads nothing from them).
 */
@Injectable({ providedIn: 'root' })
export class Links {
  private readonly stz = inject(STZ);
  private readonly available = resource({ loader: () => this.stz.links() });
  readonly support = computed(() => this.present(SUPPORT_LINKS));
  readonly channels = computed(() => this.present(CHANNEL_LINKS));

  open(id: LinkId): void {
    void this.stz.openLink(id);
  }

  private present(ids: readonly LinkId[]): LinkId[] {
    const links = this.available.value() ?? {};
    return ids.filter((id) => !!links[id]);
  }
}
