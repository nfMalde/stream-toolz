// Which keys may be a system-wide shortcut. Shared by the UI (while a key is recorded) and the main process
// (every settings change). No Node imports.

const KEY = String.raw`(?:F(?:[1-9]|1\d|2[0-4])|[A-Z0-9]|Space|Tab|Backspace|Delete|Insert|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|num[0-9]|numadd|numsub|nummult|numdiv|numdec)`;
const ACCELERATOR = new RegExp(String.raw`^(?:(?:Control|Alt|Shift|Super)\+){0,4}${KEY}$`);
/** Keys that may be a shortcut on their own (function and number pad keys); others need a modifier, or typing would break. */
const ALONE = /^(?:F(?:[1-9]|1\d|2[0-4])|num\w+)$/;

/** An Electron accelerator the app accepts ("Control+Shift+F9", "F13", "Alt+num1"); '' = off. */
export function isValidHotkey(value: string): boolean {
  if (value === '') return true;
  if (!ACCELERATOR.test(value)) return false;
  const parts = value.split('+');
  return parts.length > 1 || ALONE.test(value);
}
