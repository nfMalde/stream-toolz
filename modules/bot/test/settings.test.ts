import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT_LIMITS, cleanTrigger, DEFAULT_SETTINGS, isValidTrigger, normalizeSettings } from '../src/settings';

test('defaults: no commands, a 2 s global cooldown, replies in the thread, !commands on', () => {
  const s = normalizeSettings(undefined);
  assert.deepEqual(s, DEFAULT_SETTINGS);
  assert.equal(s.globalCooldownSeconds, 2);
  assert.equal(s.prefix, '!');
  assert.equal(s.replyInThread, true);
  assert.equal(s.listCommand, true);
});

test('triggers: lower case, without the prefix; bad ones and the built-in name are rejected', () => {
  assert.equal(cleanTrigger('  !Discord '), 'discord');
  assert.equal(cleanTrigger('Grüße'), 'grüße');
  assert.deepEqual(['discord', 'so-cool_2', 'grüße'].map(isValidTrigger), [true, true, true]);
  assert.deepEqual(['', 'with space', 'émoji', 'a'.repeat(33), 'commands', 'Upper'].map(isValidTrigger), [false, false, false, false, false, false]);
  const s = normalizeSettings({
    commands: [
      { id: 'a', trigger: '!Discord', response: 'x' },
      { id: 'b', trigger: 'bad trigger', response: 'x' },
      { id: 'c', trigger: 'commands', response: 'x' },
      { id: 'd', trigger: 'empty', response: '   ' },
      { id: 'e', trigger: 'discord', response: 'duplicate' },
      { id: 'f', trigger: 'noid', response: 'x' },
    ],
  });
  assert.deepEqual(
    s.commands.map((c) => [c.id, c.trigger]),
    [
      ['a', 'discord'],
      [s.commands[1]!.id, 'noid'],
    ],
  );
  assert.match(s.commands[1]!.id, /^[\w-]{1,64}$/);
});

test('a command keeps its uses and gets defaults for what is missing; values are clamped', () => {
  const s = normalizeSettings({
    commands: [
      { id: 'a', trigger: 'a', response: ' Hi\u0000 there  ' + 'x'.repeat(500), cooldownSeconds: 9999, userCooldownSeconds: -5, who: 'admins', enabled: 'yes', uses: 12.7 },
      { id: 'b', trigger: 'b', response: 'x', cooldownSeconds: '30', who: 'mods', enabled: false, uses: 3 },
    ],
  });
  const [a, b] = s.commands;
  assert.equal(a!.response.length, BOT_LIMITS.response);
  assert.ok(a!.response.startsWith('Hi there x'));
  assert.equal(a!.cooldownSeconds, BOT_LIMITS.cooldown);
  assert.equal(a!.userCooldownSeconds, 0);
  assert.equal(a!.who, 'everyone');
  assert.equal(a!.enabled, true);
  assert.equal(a!.uses, 13);
  assert.deepEqual(b, { id: 'b', trigger: 'b', response: 'x', cooldownSeconds: 30, userCooldownSeconds: 0, who: 'mods', enabled: false, aliases: [], uses: 3 });
});

test('aliases: cleaned, unique, never the own trigger or one another command has, at most five', () => {
  const s = normalizeSettings({
    commands: [
      { id: 'a', trigger: 'discord', response: 'x', aliases: ['!DC', 'dc', 'discord', 'bad alias', 'd1', 'd2', 'd3', 'd4', 'd5', 7] },
      { id: 'b', trigger: 'dc', response: 'taken by the alias' },
      { id: 'c', trigger: 'other', response: 'x', aliases: ['discord', 'o'] },
    ],
  });
  assert.deepEqual(
    s.commands.map((c) => [c.trigger, c.aliases]),
    [
      ['discord', ['dc', 'd1', 'd2', 'd3', 'd4']],
      ['other', ['o']],
    ],
  );
});

test('lists are cut at their limits; a missing list keeps the base', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ id: `c${i}`, trigger: `c${i}`, response: 'x' }));
  const s = normalizeSettings({ commands: many, timers: Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, text: 'x' })) });
  assert.equal(s.commands.length, BOT_LIMITS.commands);
  assert.equal(s.timers.length, BOT_LIMITS.timers);
  const kept = normalizeSettings({ globalCooldownSeconds: 99, prefix: '?', replyInThread: 'no' }, s);
  assert.equal(kept.commands.length, BOT_LIMITS.commands);
  assert.equal(kept.globalCooldownSeconds, BOT_LIMITS.globalCooldown);
  assert.equal(kept.prefix, '!');
  assert.equal(kept.replyInThread, true);
});

test('timers: a text is required, minutes 1..180, messages 0..100', () => {
  const s = normalizeSettings({
    timers: [
      { id: 't1', text: 'Follow!', everyMinutes: 0, minMessages: 500, enabled: false },
      { id: 't2', text: '' },
      { id: 't3', text: 'Default' },
    ],
  });
  assert.deepEqual(s.timers, [
    { id: 't1', text: 'Follow!', everyMinutes: 1, minMessages: BOT_LIMITS.minMessages, enabled: false },
    { id: 't3', text: 'Default', everyMinutes: 15, minMessages: 0, enabled: true },
  ]);
});
