// Keyboard shortcuts as Electron accelerators ("Control+Shift+F9"): from a key press, and for display.

const NAMED: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
};

/** The key of a key press as Electron names it (by position, so the keyboard layout does not matter). */
function keyName(code: string): string | undefined {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return `num${code.slice(6)}`;
  return NAMED[code];
}

/** The accelerator of a key press; undefined for a modifier alone or a key the app does not offer. */
export function acceleratorFrom(event: KeyboardEvent): string | undefined {
  const key = keyName(event.code);
  if (!key) return undefined;
  const modifiers = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter((m): m is string => !!m);
  return [...modifiers, key].join('+');
}

const LABELS: Record<'de' | 'en', Record<string, string>> = {
  de: { Control: 'Strg', Super: 'Win', Space: 'Leertaste', Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild ↑', PageDown: 'Bild ↓', Backspace: '⌫', Enter: 'Enter', Up: '↑', Down: '↓', Left: '←', Right: '→' },
  en: { Control: 'Ctrl', Super: 'Win', Space: 'Space', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Backspace: '⌫', Enter: 'Enter', Up: '↑', Down: '↓', Left: '←', Right: '→' },
};
const NUMPAD: Record<string, string> = { add: '+', sub: '−', mult: '×', div: '÷', dec: ',' };

/** The keys of an accelerator as shown on the keyboard ("Strg", "Shift", "F9"). */
export function keyLabels(accelerator: string, language: 'de' | 'en'): string[] {
  if (!accelerator) return [];
  return accelerator.split('+').map((part) => {
    const num = /^num(\w+)$/.exec(part);
    if (num) return `Num ${NUMPAD[num[1]!] ?? num[1]}`;
    return LABELS[language][part] ?? part;
  });
}
