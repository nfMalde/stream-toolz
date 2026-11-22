// The look of the overlay as the page gets it (the "style" event) and as the preview in the UI draws it: the settings
// turned into CSS values. The font stacks name fonts every system has; the page downloads nothing.

import type { Align, Direction, EmoteMode, FontFamily, Settings } from './settings';

export interface OverlayStyle {
  fontSize: number;
  /** A CSS font-family list. */
  fontFamily: string;
  textColor: string;
  background: string;
  /** The one colour for names, and the fallback for chatters without a Twitch colour. */
  nameColor: string;
  /** Each chatter's own Twitch colour where known. */
  twitchColors: boolean;
  showBadges: boolean;
  emotes: EmoteMode;
  direction: Direction;
  align: Align;
  width: number;
  fadeSeconds: number;
  maxMessages: number;
}

export const FONT_STACKS: Record<FontFamily, string> = {
  sans: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, Consolas, "Cascadia Mono", Menlo, monospace',
  serif: 'Georgia, "Times New Roman", Times, serif',
  rounded: '"Segoe UI Variable Display", "Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui, sans-serif',
};

/** Twitch's own emote pictures (2x, dark theme): only fetched by OBS's browser with emotes 'images'. */
export const EMOTE_CDN = 'https://static-cdn.jtvnw.net/emoticons/v2/';

export function emoteUrl(emoteId: string): string {
  return `${EMOTE_CDN}${emoteId}/default/dark/2.0`;
}

export function styleOf(settings: Settings): OverlayStyle {
  return {
    fontSize: settings.fontSize,
    fontFamily: FONT_STACKS[settings.fontFamily],
    textColor: settings.textColor,
    background: settings.background,
    nameColor: settings.nameColor,
    twitchColors: settings.nameColors === 'twitch',
    showBadges: settings.showBadges,
    emotes: settings.emotes,
    direction: settings.direction,
    align: settings.align,
    width: settings.width,
    fadeSeconds: settings.fadeSeconds,
    maxMessages: settings.maxMessages,
  };
}
