import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowed, MAX_QUEUE, MIN_SEND_GAP_MS, render } from '../src/bot';
import { bot, command, flush, message, timer } from './helpers';

const roles = (change: Partial<ReturnType<typeof message>['roles']>) => ({ broadcaster: false, moderator: false, vip: false, subscriber: false, ...change });

test('the first word matches the trigger, in any case, also an alias; the rest are the arguments', async () => {
  const { bot: b, sent } = bot({ commands: [command('discord', 'Join: https://discord.gg/x {args}', { aliases: ['dc'] })] });
  b.onMessage(message('!Discord'));
  b.onMessage(message('!DC please'));
  b.onMessage(message('!discordx'));
  b.onMessage(message('discord'));
  b.onMessage(message('hey !discord'));
  b.onMessage(message('!'));
  await flush();
  assert.equal(sent.length, 1, 'the second answer waits for the gap');
  assert.equal(sent[0]!.text, 'Join: https://discord.gg/x');
  assert.deepEqual(
    b.log.map((e) => e.outcome),
    ['sent'],
  );
});

test('answers are Twitch replies to the message, or plain messages when the setting is off', async () => {
  const a = bot({ commands: [command('hi', 'Hello {user}!')] });
  a.bot.onMessage(message('!hi', { id: 'msg-7' }));
  await flush();
  assert.deepEqual(a.sent, [{ text: 'Hello Viewer!', replyTo: 'msg-7' }]);

  const p = bot({ commands: [command('hi', 'Hello {user}!')], replyInThread: false });
  p.bot.onMessage(message('!hi', { id: 'msg-8' }));
  await flush();
  assert.deepEqual(p.sent, [{ text: 'Hello Viewer!' }]);
});

test('placeholders: {user}, {channel}, {args}, {count} (any case); the count is persisted', async () => {
  const uses: [string, number][] = [];
  const { bot: b, sent, clock } = bot({ commands: [command('hug', '{User} hugs {args} in {channel}, hug #{count}', { uses: 4 })] }, { onUses: (id, n) => uses.push([id, n]) });
  b.onMessage(message('!hug Anna'));
  await clock.advance(MIN_SEND_GAP_MS);
  b.onMessage(message('!hug', { name: 'Ben', userId: 'u2' }));
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    sent.map((s) => s.text),
    ['Viewer hugs Anna in Maldö, hug #5', 'Ben hugs in Maldö, hug #6'],
  );
  assert.deepEqual(uses, [
    ['c-hug', 5],
    ['c-hug', 6],
  ]);
  b.resetUses('c-hug');
  assert.equal(b.preview(command('hug', '#{count}', { uses: 0, id: 'c-hug' }), 'X', ''), '#1');
});

test('render keeps Twitch’s limit and leaves no double spaces', () => {
  assert.equal(render('a {args} b', { user: '', channel: '', args: '', count: 0 }), 'a b');
  assert.equal(render('{unknown} {USER}', { user: 'Max', channel: '', args: '', count: 0 }), '{unknown} Max');
  assert.equal(render('x'.repeat(600), { user: '', channel: '', args: '', count: 0 }).length, 500);
});

test('the minimum role: mods include the broadcaster, vips include mods, subs include vips', () => {
  const broadcaster = roles({ broadcaster: true });
  const mod = roles({ moderator: true });
  const vip = roles({ vip: true });
  const sub = roles({ subscriber: true });
  const nobody = roles({});
  assert.deepEqual([broadcaster, mod, vip, sub, nobody].map((r) => allowed('everyone', r)), [true, true, true, true, true]);
  assert.deepEqual([broadcaster, mod, vip, sub, nobody].map((r) => allowed('subs', r)), [true, true, true, true, false]);
  assert.deepEqual([broadcaster, mod, vip, sub, nobody].map((r) => allowed('vips', r)), [true, true, true, false, false]);
  assert.deepEqual([broadcaster, mod, vip, sub, nobody].map((r) => allowed('mods', r)), [true, true, false, false, false]);
  assert.deepEqual([broadcaster, mod, vip, sub, nobody].map((r) => allowed('broadcaster', r)), [true, false, false, false, false]);
});

test('a message from a role too low is logged and not answered, and starts no cooldown', async () => {
  const { bot: b, sent } = bot({ commands: [command('so', 'Shoutout {args}', { who: 'mods', cooldownSeconds: 60 })] });
  b.onMessage(message('!so anna'));
  b.onMessage(message('!so anna', { roles: roles({ moderator: true }), userId: 'mod1', name: 'Mod' }));
  await flush();
  assert.deepEqual(
    b.log.map((e) => [e.user, e.outcome]),
    [
      ['Viewer', 'role'],
      ['Mod', 'sent'],
    ],
  );
  assert.equal(sent.length, 1);
});

test('cooldown per command: the same command waits for everyone', async () => {
  const { bot: b, sent, clock } = bot({ commands: [command('a', 'A', { cooldownSeconds: 10 })] });
  b.onMessage(message('!a'));
  await clock.advance(5_000);
  b.onMessage(message('!a', { userId: 'u2', name: 'Other' }));
  await clock.advance(5_000);
  b.onMessage(message('!a', { userId: 'u3' }));
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    b.log.map((e) => e.outcome),
    ['sent', 'cooldown', 'sent'],
  );
  assert.equal(sent.length, 2);
});

test('cooldown per user: only the same person waits', async () => {
  const { bot: b, clock } = bot({ commands: [command('a', 'A', { userCooldownSeconds: 30 })] });
  b.onMessage(message('!a'));
  await clock.advance(MIN_SEND_GAP_MS);
  b.onMessage(message('!a'));
  b.onMessage(message('!a', { userId: 'u2' }));
  await clock.advance(30_000);
  b.onMessage(message('!a'));
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    b.log.map((e) => e.outcome),
    ['sent', 'cooldown', 'sent', 'sent'],
  );
});

test('the global cooldown keeps a gap between two answers, whatever the command', async () => {
  const { bot: b, clock } = bot({ commands: [command('a', 'A'), command('b', 'B')], globalCooldownSeconds: 2 });
  b.onMessage(message('!a'));
  b.onMessage(message('!b'));
  await clock.advance(2_000);
  b.onMessage(message('!b'));
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    b.log.map((e) => [e.trigger, e.outcome]),
    [
      ['a', 'sent'],
      ['b', 'cooldown'],
      ['b', 'sent'],
    ],
  );
});

test('the send queue: 1.5 s between sends, at most 20 waiting, the rest dropped as failed', async () => {
  const { bot: b, sent, clock } = bot({ commands: [command('a', 'A')] });
  for (let i = 0; i < 25; i++) b.onMessage(message('!a', { userId: `u${i}` }));
  await flush();
  assert.equal(sent.length, 1, 'the first goes out at once');
  assert.equal(b.queued, MAX_QUEUE);
  assert.equal(b.log.filter((e) => e.outcome === 'failed' && e.error === 'queue-full').length, 25 - 1 - MAX_QUEUE);
  await clock.advance(MIN_SEND_GAP_MS - 1);
  assert.equal(sent.length, 1);
  await clock.advance(1);
  assert.equal(sent.length, 2);
  await clock.advance(MIN_SEND_GAP_MS * 19);
  assert.equal(sent.length, 21);
  assert.equal(b.queued, 0);
  assert.equal(b.log.filter((e) => e.outcome === 'sent').length, 21);
});

test('a send Twitch rejects is logged as failed with its reason; the queue goes on', async () => {
  const { bot: b, sent, clock, failWith } = bot({ commands: [command('a', 'A')] });
  failWith('Message dropped: automod');
  b.onMessage(message('!a'));
  b.onMessage(message('!a', { userId: 'u2' }));
  await flush();
  failWith(undefined);
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    b.log.map((e) => [e.outcome, e.error]),
    [
      ['failed', 'Message dropped: automod'],
      ['sent', undefined],
    ],
  );
  assert.equal(sent.length, 1);
});

test('the own account’s messages and other channels of a shared chat are ignored', async () => {
  const { bot: b, sent } = bot({ commands: [command('a', 'A')] });
  b.onMessage(message('!a', { userId: 'me' }));
  b.onMessage(message('!a', { fromOtherChannel: true }));
  b.onMessage(message('!a', { test: true }));
  await flush();
  assert.equal(sent.length, 0);
  assert.equal(b.log.length, 0);
});

test('timed messages: after their minutes, only when enough chat came in; a new or disabled timer counts from now', async () => {
  const { bot: b, sent, clock, update } = bot({ timers: [timer('Follow me!', { everyMinutes: 10 }), timer('Quiet {channel}?', { everyMinutes: 10, minMessages: 2 })] });
  b.tick();
  await clock.advance(9 * 60_000);
  b.tick();
  await flush();
  assert.equal(sent.length, 0, 'not due yet');
  b.onMessage(message('hello'));
  b.onMessage(message('!x', { userId: 'me' }));
  await clock.advance(60_000);
  b.tick();
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    sent.map((s) => s.text),
    ['Follow me!'],
  );
  b.onMessage(message('one more'));
  b.tick();
  await clock.advance(MIN_SEND_GAP_MS);
  assert.deepEqual(
    sent.map((s) => s.text),
    ['Follow me!', 'Quiet Maldö?'],
  );
  assert.equal(b.log.filter((e) => e.kind === 'timer' && e.outcome === 'sent').length, 2);

  // Switched off: no send; switched on again: the minutes start over.
  update({ timers: [timer('Follow me!', { everyMinutes: 10, enabled: false })] });
  await clock.advance(10 * 60_000);
  b.tick();
  update({ timers: [timer('Follow me!', { everyMinutes: 10 })] });
  b.tick();
  await clock.advance(5 * 60_000);
  b.tick();
  await flush();
  assert.equal(sent.length, 2);
  await clock.advance(5 * 60_000);
  b.tick();
  await flush();
  assert.equal(sent.length, 3);
});

test('!commands lists the enabled triggers in the app’s language, and can be switched off', async () => {
  const de = bot({ commands: [command('discord', 'x', { aliases: ['dc'] }), command('off', 'x', { enabled: false }), command('socials', 'x')] });
  de.bot.onMessage(message('!Commands'));
  await flush();
  assert.deepEqual(
    de.sent.map((s) => s.text),
    ['Befehle: !discord, !socials'],
  );

  const en = bot({}, { language: () => 'en' });
  en.bot.onMessage(message('!commands'));
  await flush();
  assert.deepEqual(
    en.sent.map((s) => s.text),
    ['There are no commands yet.'],
  );

  const off = bot({ commands: [command('a', 'x')], listCommand: false });
  off.bot.onMessage(message('!commands'));
  await flush();
  assert.equal(off.sent.length, 0);
});

test('!commands stays within one Twitch message when there are many', async () => {
  const commands = Array.from({ length: 100 }, (_, i) => command(`command-number-${i}`, 'x'));
  const { bot: b, sent } = bot({ commands });
  b.onMessage(message('!commands'));
  await flush();
  assert.ok(sent[0]!.text.length <= 500);
  assert.ok(sent[0]!.text.endsWith(' …'));
});

test('preview renders without sending; a test message goes out and is logged as a test', async () => {
  const { bot: b, sent } = bot({ commands: [command('hi', 'Hi {user}, {args}!', { uses: 2 })] });
  assert.equal(b.preview(command('hi', 'Hi {user}, {args}! #{count}', { uses: 2 }), 'Zuschauer', 'wie gehts'), 'Hi Zuschauer, wie gehts! #3');
  assert.equal(sent.length, 0);
  b.sendTest('  Test \u0007 ');
  b.sendTest('   ');
  await flush();
  assert.deepEqual(sent, [{ text: 'Test' }]);
  assert.deepEqual(
    b.log.map((e) => [e.kind, e.outcome]),
    [['test', 'test']],
  );
});

test('stop drops what waits and sends nothing more', async () => {
  const { bot: b, sent, clock } = bot({ commands: [command('a', 'A')] });
  b.onMessage(message('!a'));
  b.onMessage(message('!a', { userId: 'u2' }));
  await flush();
  b.stop();
  assert.equal(b.queued, 0);
  assert.equal(clock.pending, 0);
  b.onMessage(message('!a', { userId: 'u3' }));
  await clock.advance(MIN_SEND_GAP_MS * 2);
  assert.equal(sent.length, 1);
});

test('the log keeps the last 50 actions', async () => {
  const { bot: b } = bot({ commands: [command('a', 'A', { who: 'broadcaster' })] });
  for (let i = 0; i < 60; i++) b.onMessage(message('!a'));
  assert.equal(b.log.length, 50);
  assert.ok(b.log.every((e) => e.outcome === 'role'));
});
