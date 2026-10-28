import { computed, inject, Injectable } from '@angular/core';
import type { Platform } from '@rmc/api';
import { SettingsStore } from '../stores/settings.store';
import { de } from './de';
import { en, type TextKey } from './en';

export type { TextKey } from './en';
export type UiLanguage = 'de' | 'en';

const TEXTS: Record<UiLanguage, Record<TextKey, string>> = { de, en };

/** Until the app's info has arrived: what the window itself reports. */
function platformFromAgent(): Platform {
  const agent = navigator.userAgent;
  return /Macintosh|Mac OS X/.test(agent) ? 'mac' : /Windows/.test(agent) ? 'windows' : 'linux';
}

/**
 * UI texts in the app language (German or English, from GT Toolz). Templates call t(): it reads the language
 * signal, so views update when the language changes. {computer} is "PC" or "Mac".
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly settings = inject(SettingsStore);

  readonly lang = computed<UiLanguage>(() => (this.settings.language().startsWith('de') ? 'de' : 'en'));
  readonly locale = computed(() => (this.lang() === 'de' ? 'de-DE' : 'en-GB'));
  readonly platform = computed<Platform>(() => this.settings.info()?.platform ?? platformFromAgent());
  private readonly platformWords = computed<Record<string, string>>(() => ({ computer: this.platform() === 'mac' ? 'Mac' : 'PC' }));

  readonly t = (key: TextKey, params?: Record<string, string | number>): string => {
    const texts = TEXTS[this.lang()];
    const text = texts[key] ?? en[key];
    const values: Record<string, string | number> = { ...this.platformWords(), ...params };
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };

  /** Formats a number in the UI language. */
  readonly number = (value: number, digits = 0): string =>
    value.toLocaleString(this.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
