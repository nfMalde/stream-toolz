import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';

test('defaults when nothing is given', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings([]), DEFAULT_SETTINGS);
});

test('bounded numbers and choices keep the base value when invalid', () => {
  const s = normalizeSettings({ fontSize: 9999, doneSeconds: 1, labelSize: 'big', output: 'chat', format: 'days', fontFamily: 'comic', align: 'top' });
  assert.equal(s.fontSize, 400);
  assert.equal(s.doneSeconds, 1);
  assert.equal(normalizeSettings({ doneSeconds: -3 }).doneSeconds, 0);
  assert.equal(normalizeSettings({}).doneSeconds, 0, 'stays by default (the user, 2026-11-22)');
  assert.equal(s.labelSize, DEFAULT_SETTINGS.labelSize);
  assert.equal(s.output, 'overlay');
  assert.equal(s.format, 'auto');
  assert.equal(s.fontFamily, 'sans');
  assert.equal(s.align, 'center');
  const ok = normalizeSettings({ fontSize: 120.4, doneSeconds: 600, output: 'both', format: 'minutes', fontFamily: 'mono', align: 'right', shadow: false, showLabel: 'yes' });
  assert.equal(ok.fontSize, 120);
  assert.equal(ok.doneSeconds, 600);
  assert.equal(ok.output, 'both');
  assert.equal(ok.format, 'minutes');
  assert.equal(ok.fontFamily, 'mono');
  assert.equal(ok.align, 'right');
  assert.equal(ok.shadow, false);
  assert.equal(ok.showLabel, true);
});

test('colours are hex, lower case, six digits', () => {
  assert.equal(normalizeSettings({ color: '#FF730F' }).color, '#ff730f');
  assert.equal(normalizeSettings({ color: '#abc' }).color, '#aabbcc');
  assert.equal(normalizeSettings({ color: 'red' }).color, '#ffffff');
  assert.equal(normalizeSettings({ color: '#ff730f; background: url(x)' }).color, '#ffffff');
  assert.equal(normalizeSettings({ color: 7 }).color, '#ffffff');
});

test('the folder is absolute or empty', () => {
  assert.equal(normalizeSettings({ folder: 'C:\\Stream\\Countdown' }).folder, 'C:\\Stream\\Countdown');
  assert.equal(normalizeSettings({ folder: '/home/me/obs' }).folder, '/home/me/obs');
  assert.equal(normalizeSettings({ folder: '\\\\nas\\share\\obs' }).folder, '\\\\nas\\share\\obs');
  assert.equal(normalizeSettings({ folder: '' }).folder, '');
  assert.equal(normalizeSettings({ folder: 'relative\\path' }, { ...DEFAULT_SETTINGS, folder: 'D:\\x' }).folder, 'D:\\x');
  assert.equal(normalizeSettings({ folder: '..\\..\\up' }).folder, '');
  assert.equal(normalizeSettings({ folder: 'C:\\bad\u0000name' }).folder, '');
  assert.equal(normalizeSettings({ folder: 42 }).folder, '');
});

test('the done text is one line, at most 100 characters', () => {
  assert.equal(normalizeSettings({ doneText: '  Los!\u0007 ' }).doneText, 'Los!');
  assert.equal(normalizeSettings({ doneText: 'x'.repeat(200) }).doneText.length, 100);
  assert.equal(normalizeSettings({ doneText: 5 }).doneText, '');
  assert.equal(normalizeSettings({}).showDoneText, false, 'off by default');
  assert.equal(normalizeSettings({ showDoneText: true }).showDoneText, true);
  assert.equal(normalizeSettings({ showDoneText: 'yes' }).showDoneText, false);
});

test('timers are checked one by one', () => {
  const s = normalizeSettings({
    timers: [
      { id: 'abc123', label: ' Pause\u0000 ', endsAt: 1000.6, createdAt: 10 },
      { id: 'paused1', label: '', endsAt: 2000, createdAt: 20, pausedRemainingMs: 500 },
      { id: 'abc123', label: 'duplicate', endsAt: 3000, createdAt: 30 },
      { id: 'BAD-ID', label: '', endsAt: 3000, createdAt: 30 },
      { id: 'nonumber', label: '', endsAt: 'soon', createdAt: 30 },
      { id: 'negative', label: '', endsAt: -5, createdAt: 30 },
      { id: 'badpause', label: '', endsAt: 3000, createdAt: 30, pausedRemainingMs: 'x' },
      'nonsense',
      null,
    ],
  });
  assert.deepEqual(s.timers, [
    { id: 'abc123', label: 'Pause', endsAt: 1001, createdAt: 10 },
    { id: 'paused1', label: '', endsAt: 2000, createdAt: 20, pausedRemainingMs: 500 },
  ]);
  assert.equal(normalizeSettings({ timers: 'none' }, { ...DEFAULT_SETTINGS, timers: s.timers }).timers, s.timers);
});

test('at most ten timers', () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `t${i}`, label: '', endsAt: 100, createdAt: i }));
  assert.equal(normalizeSettings({ timers: many }).timers.length, 10);
});
