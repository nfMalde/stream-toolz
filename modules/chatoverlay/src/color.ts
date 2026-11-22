// Colours between the settings (one CSS string) and the UI's controls (a colour picker, which knows only "#rrggbb",
// and an opacity slider). No Node imports.

import { isColor } from './settings';

export interface PickedColor {
  /** "#rrggbb", lower case. */
  hex: string;
  /** 0..100 percent. */
  opacity: number;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** A settings colour as picker value and opacity; anything unreadable is black at full opacity. */
export function parseColor(value: string): PickedColor {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { hex: '#000000', opacity: 0 };
  if (!isColor(v)) return { hex: '#000000', opacity: 100 };
  if (v.startsWith('#')) {
    const digits = v.slice(1);
    const wide = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
    const alpha = wide.length === 8 ? parseInt(wide.slice(6), 16) / 255 : 1;
    return { hex: `#${wide.slice(0, 6)}`, opacity: Math.round(alpha * 100) };
  }
  const numbers = v.match(/[\d.]+/g) ?? [];
  const [r = 0, g = 0, b = 0, a = 1] = numbers.map(Number);
  return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, opacity: Math.round(Math.max(0, Math.min(1, a)) * 100) };
}

/** The settings string for a picked colour: "#rrggbb" when opaque, "transparent" when invisible, else rgba(). */
export function colorString(picked: PickedColor): string {
  const hex = /^#[0-9a-f]{6}$/i.test(picked.hex) ? picked.hex.toLowerCase() : '#000000';
  const opacity = Math.max(0, Math.min(100, Math.round(picked.opacity)));
  if (opacity >= 100) return hex;
  if (opacity <= 0) return 'transparent';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${(opacity / 100).toFixed(2).replace(/0$/, '')})`;
}
