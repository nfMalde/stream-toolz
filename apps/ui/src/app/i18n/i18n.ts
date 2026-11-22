import { computed, inject, Injectable } from '@angular/core';
import type { Platform } from '@stz/api';
import { de as readMyChatDe } from '@stream-toolz/readmychat/ui/i18n/de';
import { en as readMyChatEn, type ReadMyChatTextKey } from '@stream-toolz/readmychat/ui/i18n/en';
import { de as countdownDe } from '@stream-toolz/countdown/ui/i18n/de';
import { en as countdownEn, type CountdownTextKey } from '@stream-toolz/countdown/ui/i18n/en';
import { de as chatoverlayDe } from '@stream-toolz/chatoverlay/ui/i18n/de';
import { en as chatoverlayEn, type ChatoverlayTextKey } from '@stream-toolz/chatoverlay/ui/i18n/en';
import { de as alertsDe } from '@stream-toolz/alerts/ui/i18n/de';
import { en as alertsEn, type AlertsTextKey } from '@stream-toolz/alerts/ui/i18n/en';
import { de as channelpointsDe } from '@stream-toolz/channelpoints/ui/i18n/de';
import { en as channelpointsEn, type ChannelpointsTextKey } from '@stream-toolz/channelpoints/ui/i18n/en';
import { de as botDe } from '@stream-toolz/bot/ui/i18n/de';
import { en as botEn, type BotTextKey } from '@stream-toolz/bot/ui/i18n/en';
import { SettingsStore } from '../stores/settings.store';
import { de } from './de';
import { en, type ShellTextKey } from './en';

/** The shell's keys and those of every built-in module (each starts with the module's id). */
export type TextKey = ShellTextKey | ReadMyChatTextKey | CountdownTextKey | ChatoverlayTextKey | AlertsTextKey | ChannelpointsTextKey | BotTextKey;
export type UiLanguage = 'de' | 'en';

const TEXTS: Record<UiLanguage, Record<TextKey, string>> = {
  de: { ...de, ...readMyChatDe, ...countdownDe, ...chatoverlayDe, ...alertsDe, ...channelpointsDe, ...botDe },
  en: { ...en, ...readMyChatEn, ...countdownEn, ...chatoverlayEn, ...alertsEn, ...channelpointsEn, ...botEn },
};

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
    const text = texts[key] ?? TEXTS.en[key];
    const values: Record<string, string | number> = { ...this.platformWords(), ...params };
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };

  /** Formats a number in the UI language. */
  readonly number = (value: number, digits = 0): string =>
    value.toLocaleString(this.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
