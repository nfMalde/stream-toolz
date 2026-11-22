// The text a timer shows, in the overlay and in the text files. Seconds are rounded up, so the display reaches
// 0:00 exactly when the timer is done and never shows 0:00 while a moment is left.

import { isDone, remainingMs, type Timer } from './timer';

/** auto: m:ss under an hour, h:mm:ss above; minutes: rounded up ("15 min", "1 h 05 min"). */
export type TimeFormat = 'auto' | 'mm:ss' | 'hh:mm:ss' | 'minutes';
export const TIME_FORMATS: readonly TimeFormat[] = ['auto', 'mm:ss', 'hh:mm:ss', 'minutes'];

const two = (n: number) => String(n).padStart(2, '0');

export function formatRemaining(ms: number, format: TimeFormat): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  switch (format) {
    case 'mm:ss':
      return `${two(hours * 60 + minutes)}:${two(seconds)}`;
    case 'hh:mm:ss':
      return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
    case 'minutes': {
      const all = Math.ceil(total / 60);
      return all < 60 ? `${all} min` : `${Math.floor(all / 60)} h ${two(all % 60)} min`;
    }
    default:
      return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
  }
}

/** The timer's text now: the remaining time, or at zero the done text when that is switched on and set ('' keeps "0:00"). */
export function timerText(timer: Timer, now: number, format: TimeFormat, doneText: string, showDoneText = true): string {
  if (isDone(timer, now) && showDoneText && doneText) return doneText;
  return formatRemaining(remainingMs(timer, now), format);
}
