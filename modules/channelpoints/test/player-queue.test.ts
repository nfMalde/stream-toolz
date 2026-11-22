import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlayerQueue } from '../src/player-queue';
import { DEFAULT_REWARD, DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { FakeSink, redemption, tick } from './helpers';

const SOUNDS: Record<string, string> = { 'a.wav': 'sound A', 'b.wav': 'sound B' };

function queue(sink: FakeSink, change: Partial<Settings> = {}, clock?: { now: number }) {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    rewards: {
      a: { ...DEFAULT_REWARD, title: 'A', sound: 'a.wav' },
      b: { ...DEFAULT_REWARD, title: 'B', sound: 'b.wav', volume: 50 },
      silent: { ...DEFAULT_REWARD, title: 'Silent' },
      off: { ...DEFAULT_REWARD, title: 'Off', sound: 'a.wav', enabled: false },
      cool: { ...DEFAULT_REWARD, title: 'Cool', sound: 'b.wav', cooldownSeconds: 30 },
    },
    ...change,
  };
  return new PlayerQueue({
    settings: () => settings,
    sink: () => sink,
    sound: async (name) => (name in SOUNDS ? Buffer.from(SOUNDS[name]!, 'utf8') : undefined),
    log: () => undefined,
    now: clock ? () => clock.now : undefined,
  });
}

test('each redemption plays its reward\'s sound, in order, with both volumes', async () => {
  const sink = new FakeSink();
  const q = queue(sink);
  q.receive(redemption('a'));
  q.receive(redemption('b'));
  q.receive(redemption('a'));
  await tick();
  assert.deepEqual(sink.played, ['sound A', 'sound B', 'sound A']);
  assert.deepEqual(sink.volumes, [0.8, 0.4, 0.8]);
  assert.deepEqual(
    q.log.map((e) => e.outcome),
    ['played', 'played', 'played'],
  );
  q.stop();
});

test('unknown rewards, rewards without a sound and switched-off ones are logged, not played', async () => {
  const sink = new FakeSink();
  const q = queue(sink);
  q.receive(redemption('nobody', { rewardTitle: 'Unknown' }));
  q.receive(redemption('silent'));
  q.receive(redemption('off'));
  await tick();
  assert.deepEqual(sink.played, []);
  assert.deepEqual(
    q.log.map((e) => `${e.rewardTitle}:${e.outcome}`),
    ['Unknown:no-sound', 'Reward silent:no-sound', 'Reward off:disabled'],
  );
  q.stop();
});

test('a missing file is logged as no-sound when its turn comes', async () => {
  const sink = new FakeSink();
  const q = queue(sink, { rewards: { x: { ...DEFAULT_REWARD, title: 'X', sound: 'gone.wav' } } });
  q.receive(redemption('x'));
  await tick();
  assert.deepEqual(sink.played, []);
  assert.equal(q.log[0]?.outcome, 'no-sound');
  q.stop();
});

test('the cooldown counts per reward from when a redemption was accepted', async () => {
  const sink = new FakeSink();
  const clock = { now: 100_000 };
  const q = queue(sink, {}, clock);
  q.receive(redemption('cool'));
  clock.now += 10_000;
  q.receive(redemption('cool'));
  q.receive(redemption('a'));
  clock.now += 25_000;
  q.receive(redemption('cool'));
  await tick();
  assert.deepEqual(sink.played, ['sound B', 'sound A', 'sound B']);
  assert.deepEqual(
    q.log.map((e) => e.outcome),
    ['cooldown', 'played', 'played', 'played'],
  );
  q.stop();
});

test('the same redemption id is played once', async () => {
  const sink = new FakeSink();
  const q = queue(sink);
  const r = redemption('a');
  q.receive(r);
  q.receive({ ...r });
  await tick();
  assert.deepEqual(sink.played, ['sound A']);
  assert.equal(q.log.length, 1);
  q.stop();
});

test('beyond maxQueue waiting sounds, new redemptions are skipped', async () => {
  const sink = new FakeSink(true);
  const q = queue(sink, { maxQueue: 2 });
  q.receive(redemption('a'));
  await tick();
  // "a" plays; two may wait.
  q.receive(redemption('b'));
  q.receive(redemption('a'));
  q.receive(redemption('b', { rewardTitle: 'Dropped' }));
  assert.equal(q.queued, 2);
  assert.deepEqual(
    q.log.map((e) => `${e.rewardTitle}:${e.outcome}`),
    ['Dropped:queue-full'],
  );
  sink.end();
  await tick();
  sink.end();
  await tick();
  sink.end();
  await tick();
  assert.deepEqual(sink.played, ['sound A', 'sound B', 'sound A']);
  q.stop();
});

test('a test plays ahead of the queue, regardless of cooldown and switch, and is marked', async () => {
  const sink = new FakeSink(true);
  const clock = { now: 100_000 };
  const q = queue(sink, {}, clock);
  q.receive(redemption('cool'));
  await tick();
  q.receive(redemption('a'));
  q.test('cool');
  q.test('off');
  q.test('silent');
  assert.equal(q.queued, 3);
  sink.end();
  await tick();
  sink.end();
  await tick();
  sink.end();
  await tick();
  sink.end();
  await tick();
  assert.deepEqual(sink.played, ['sound B', 'sound A', 'sound B', 'sound A']);
  assert.deepEqual(
    q.log.map((e) => `${e.name}:${e.outcome}`),
    ['Test:no-sound', 'Viewer:played', 'Test:test', 'Test:test', 'Viewer:played'],
  );
  q.stop();
});

test('stop throws the waiting sounds away and stops the one playing', async () => {
  const sink = new FakeSink(true);
  const q = queue(sink);
  q.receive(redemption('a'));
  await tick();
  q.receive(redemption('b'));
  q.receive(redemption('b'));
  assert.equal(q.queued, 2);
  q.stop();
  await tick();
  assert.equal(q.queued, 0);
  assert.ok(sink.stops >= 1);
  assert.deepEqual(sink.played, ['sound A']);
  // Nothing is accepted after stop.
  q.receive(redemption('a'));
  await tick();
  assert.deepEqual(sink.played, ['sound A']);
});

test('the log keeps the last 50 redemptions and announces changes', async () => {
  const sink = new FakeSink();
  const q = queue(sink);
  let changes = 0;
  q.on('change', () => changes++);
  for (let i = 0; i < 60; i++) q.receive(redemption('silent'));
  await tick();
  assert.equal(q.log.length, 50);
  assert.ok(changes >= 60);
  q.stop();
});
