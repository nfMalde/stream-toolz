import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidHotkey } from '../src/hotkeys';

test('hotkeys: modifiers with a key, function and number pad keys alone, nothing that breaks typing', () => {
  for (const ok of ['', 'Control+Shift+F9', 'F13', 'F24', 'Alt+num1', 'num5', 'Control+Alt+S', 'Shift+Space', 'Super+PageDown']) assert.ok(isValidHotkey(ok), ok);
  for (const bad of ['S', 'Space', 'Enter', 'Control+', 'Control+Shift', 'Ctrl+F9', 'F25', 'Control+ü', 'Alt+F4; rm']) assert.ok(!isValidHotkey(bad), bad);
});
