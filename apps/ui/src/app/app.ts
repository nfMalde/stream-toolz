import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PRODUCT_BYLINE, PRODUCT_NAME } from '@rmc/api';
import { BRIDGE_AVAILABLE } from './core/rmc';
import { StreamerMode } from './core/streamer';
import { I18n, type TextKey } from './i18n/i18n';
import { Guide } from './pages/guide/guide';
import { ReaderStore } from './stores/reader.store';
import { SettingsStore } from './stores/settings.store';
import { Icon, type IconName } from './ui/icon';
import { LinkBar } from './ui/link-bar';
import { RevealDialog } from './ui/secret';
import { StatusPill } from './ui/status-pill';
import { Toggle } from './ui/toggle';

interface NavItem {
  path: string;
  label: TextKey;
  icon: IconName;
}

const LANGUAGES = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
];

@Component({
  selector: 'rmc-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, StatusPill, Guide, LinkBar, RevealDialog, Toggle],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly bridge = BRIDGE_AVAILABLE;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;
  protected readonly settings = inject(SettingsStore);
  protected readonly reader = inject(ReaderStore);
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;
  protected readonly languages = LANGUAGES;

  constructor() {
    inject(Title).setTitle(`${PRODUCT_NAME} ${PRODUCT_BYLINE}`);
  }

  protected readonly nav: NavItem[] = [
    { path: '/live', label: 'nav.live', icon: 'chat' },
    { path: '/events', label: 'nav.events', icon: 'gift' },
    { path: '/twitch', label: 'nav.twitch', icon: 'plug' },
    { path: '/voices', label: 'nav.voices', icon: 'mic' },
    { path: '/output', label: 'nav.output', icon: 'broadcast' },
    { path: '/settings', label: 'nav.settings', icon: 'sliders' },
  ];

  /** App language, from the title bar (also under Settings). */
  protected setLanguage(language: string): void {
    if (language !== this.settings.language()) void this.settings.update({ language });
  }
}
