import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_REWARD, DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';

test('defaults: device output, master volume 80, five waiting sounds, no rewards', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SETTINGS);
  // Wrong kinds keep the default; numbers out of range are clamped.
  assert.deepEqual(normalizeSettings({ output: 'tape', volume: 'loud', maxQueue: 99, deviceId: 'a/b' }), { ...DEFAULT_SETTINGS, maxQueue: 20 });
});

test('rewards: valid ids only, each field checked, the rest from the earlier settings', () => {
  const base = { ...DEFAULT_SETTINGS, rewards: { 'abc-123': { ...DEFAULT_REWARD, title: 'Hydrate', sound: 'water.wav', volume: 60 } } };
  const s = normalizeSettings(
    {
      rewards: {
        'abc-123': { sound: '../../etc/passwd', volume: 500, cooldownSeconds: -5, enabled: 'yes', title: 'Hydrate\u0007 now' },
        'new-one': { title: 'Jump', sound: 'jump.mp3', cooldownSeconds: 12.4 },
        'bad id!': { sound: 'x.wav' },
        'no-sound': { sound: '..' },
      },
    },
    base,
  );
  assert.deepEqual(s.rewards, {
    // Out-of-range numbers are clamped (the house style), a bad sound name keeps the earlier one.
    'abc-123': { title: 'Hydrate  now', sound: 'water.wav', volume: 100, cooldownSeconds: 0, enabled: true },
    'new-one': { title: 'Jump', sound: 'jump.mp3', volume: 100, cooldownSeconds: 12, enabled: true },
    'no-sound': { ...DEFAULT_REWARD },
  });
});

test('a reward is removed by leaving it out; a wrong rewards value keeps the earlier ones', () => {
  const base = { ...DEFAULT_SETTINGS, rewards: { a: { ...DEFAULT_REWARD, sound: 'a.wav' } } };
  assert.deepEqual(normalizeSettings({ rewards: {} }, base).rewards, {});
  assert.deepEqual(normalizeSettings({ rewards: [] }, base).rewards, base.rewards);
  assert.deepEqual(normalizeSettings({ rewards: 'x' }, base).rewards, base.rewards);
});

test('at most 200 rewards are kept', () => {
  const rewards = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`r${i}`, { sound: 'a.wav' }]));
  assert.equal(Object.keys(normalizeSettings({ rewards }).rewards).length, 200);
});

test('numbers are clamped and rounded, strings that are numbers count', () => {
  const s = normalizeSettings({ volume: '42.6', maxQueue: 0, output: 'obs', deviceId: 'default' });
  assert.equal(s.volume, 43);
  assert.equal(s.maxQueue, 1);
  assert.equal(s.output, 'obs');
  assert.equal(s.deviceId, 'default');
});
