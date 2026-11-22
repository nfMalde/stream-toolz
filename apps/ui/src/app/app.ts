import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PRODUCT_BYLINE, PRODUCT_NAME } from '@stz/api';
import { BRIDGE_AVAILABLE } from './core/stz';
import { StreamerMode } from './core/streamer';
import { I18n } from './i18n/i18n';
import { MODULE_UIS } from './modules';
import { Guide } from './pages/guide/guide';
import { SettingsStore } from './stores/settings.store';
import { Icon } from './ui/icon';
import { LinkBar } from './ui/link-bar';
import { RevealDialog } from './ui/secret';
import { StatusPill } from './ui/status-pill';

const LANGUAGES = [
  { id: 'de', name: 'Deutsch' },
  { id: 'en', name: 'English' },
];

@Component({
  selector: 'stz-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgComponentOutlet, Icon, StatusPill, Guide, LinkBar, RevealDialog],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly bridge = BRIDGE_AVAILABLE;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;
  protected readonly settings = inject(SettingsStore);
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;
  protected readonly languages = LANGUAGES;

  /** The modules that are on: their pages in the navigation, their control at its bottom. */
  protected readonly modules = computed(() => MODULE_UIS.filter((module) => this.settings.moduleEnabled(module.id)));

  constructor() {
    inject(Title).setTitle(`${PRODUCT_NAME} ${PRODUCT_BYLINE}`);
  }

  /** App language, from the title bar (also under Settings). */
  protected setLanguage(language: string): void {
    if (language !== this.settings.language()) void this.settings.update({ language });
  }
}
