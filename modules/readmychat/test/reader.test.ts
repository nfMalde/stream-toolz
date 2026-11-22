import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioSink } from '@stream-toolz/core';
import type { Speech } from '@stream-toolz/speech';
import { ChatReader } from '../src/reader';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { message } from './helpers';

/** A sink that records what was played; each clip ends when the test says so (or right away). */
class FakeSink implements AudioSink {
  ready = true;
  played: string[] = [];
  stops = 0;
  private finish: (() => void) | undefined;
  constructor(private readonly hold = false) {}
  play(wav: Buffer): Promise<void> {
    this.played.push(wav.toString('utf8'));
    if (!this.hold) return Promise.resolve();
    return new Promise((resolve) => (this.finish = resolve));
  }
  stop(): void {
    this.stops++;
    this.finish?.();
    this.finish = undefined;
  }
  end(): void {
    this.finish?.();
    this.finish = undefined;
  }
}

const speech = { synthesize: async (text: string) => Buffer.from(text, 'utf8'), alive: true } as unknown as Speech;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function reader(sink: FakeSink, change: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, pauseBetween: 0, duplicateSeconds: 0, userLimit: 0, ...change };
  const r = new ChatReader({
    settings: () => settings,
    packs: () => BUILT_IN_PACKS,
    sink: () => sink,
    speech: async () => speech,
    ownUserId: () => 'me',
    onRewardLearned: () => undefined,
    log: () => undefined,
  });
  r.start();
  return r;
}

test('names "when it changes": only when someone else wrote before', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { readNames: 'changed' });
  r.receive(message('Hallo', { receivedAt: Date.now() }));
  r.receive(message('Wie geht es?', { receivedAt: Date.now() }));
  r.receive(message('Gut!', { userId: 'u2', name: 'Anna_99', receivedAt: Date.now() }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: Hallo', 'Wie geht es?', 'Anna sagt: Gut!']);
});

test('each message is read in its own language, with that voice and its words', async () => {
  const sink = new FakeSink();
  const used: string[] = [];
  const voice = (language: string) => ({ synthesize: async (text: string) => (used.push(language), Buffer.from(text, 'utf8')), alive: true }) as unknown as Speech;
  const voices = { de: voice('de'), en: voice('en') };
  const settings: Settings = { ...DEFAULT_SETTINGS, pauseBetween: 0, duplicateSeconds: 0, userLimit: 0 };
  const r = new ChatReader({ settings: () => settings, packs: () => BUILT_IN_PACKS, sink: () => sink, speech: async (language) => voices[language as 'de' | 'en'], ownUserId: () => 'me', onRewardLearned: () => undefined, log: () => undefined });
  r.start();
  r.receive(message('Hello everyone, how are you?', { receivedAt: Date.now() }));
  r.receive(message('Wie geht es euch?', { userId: 'u2', name: 'Anna', receivedAt: Date.now() }));
  r.receive(message('gg', { userId: 'u3', name: 'Ben', receivedAt: Date.now() }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer says: Hello everyone, how are you?', 'Anna sagt: Wie geht es euch?', 'Ben sagt: gg']);
  assert.deepEqual(used, ['en', 'de', 'de']);
});

test('with detection off, everything is read in the main language', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { detectLanguage: false });
  r.receive(message('Hello everyone, how are you?', { receivedAt: Date.now() }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: Hello everyone, how are you?']);
});

test('a nickname replaces the name in front of the message', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { nicknames: { viewer: 'Vivi' } });
  r.receive(message('Hallo', { receivedAt: Date.now() }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Vivi sagt: Hallo']);
});

test('a deleted message is not read, and stopped when it is being read', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  const first = message('eins', { receivedAt: Date.now() });
  const second = message('zwei', { receivedAt: Date.now() });
  r.receive(first);
  r.receive(second);
  await tick();
  r.deleted(second.id);
  r.deleted(first.id);
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: eins']);
  assert.ok(sink.stops >= 1);
  const reasons = r.log.filter((e) => e.outcome === 'skipped').map((e) => `${e.text}:${e.reason}`);
  assert.deepEqual(reasons.sort(), ['eins:deleted', 'zwei:deleted']);
});

test('a timeout removes all messages of that person', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  r.receive(message('a', { receivedAt: Date.now() }));
  r.receive(message('b', { receivedAt: Date.now() }));
  r.receive(message('c', { userId: 'u2', receivedAt: Date.now() }));
  await tick();
  r.userCleared('u1');
  await tick();
  sink.end();
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: a', 'Viewer sagt: c']);
});

test('the oldest messages are dropped when the queue is full', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink, { maxQueue: 2 });
  for (const text of ['1', '2', '3', '4']) r.receive(message(`Nachricht ${text}`, { receivedAt: Date.now() }));
  await tick();
  // 1 and 2 were dropped; 3 is being read, 4 waits.
  assert.equal(r.status.current?.text, 'Nachricht 3');
  assert.deepEqual(
    r.status.queued.map((q) => q.text),
    ['Nachricht 4'],
  );
  assert.deepEqual(
    r.log.filter((e) => e.reason === 'queue-full').map((e) => e.text),
    ['Nachricht 1', 'Nachricht 2'],
  );
  r.stop();
});

test('skip stops the current message; pause holds the queue', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  r.receive(message('eins', { receivedAt: Date.now() }));
  await tick();
  r.skip();
  await tick();
  r.pause();
  r.receive(message('zwei', { userId: 'u2', receivedAt: Date.now() }));
  await tick();
  assert.equal(r.status.state, 'paused');
  assert.deepEqual(sink.played, ['Viewer sagt: eins']);
  r.resume();
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: eins', 'Viewer sagt: zwei']);
  assert.equal(r.log.find((e) => e.text === 'eins' && e.outcome === 'skipped')?.reason, 'removed');
});

test('the next message is rendered while the current one plays, and only once', async () => {
  const sink = new FakeSink(true);
  const rendered: string[] = [];
  const counting = { synthesize: async (text: string) => (rendered.push(text), Buffer.from(text, 'utf8')), alive: true } as unknown as Speech;
  const settings: Settings = { ...DEFAULT_SETTINGS, pauseBetween: 0, duplicateSeconds: 0, userLimit: 0 };
  const r = new ChatReader({ settings: () => settings, packs: () => BUILT_IN_PACKS, sink: () => sink, speech: async () => counting, ownUserId: () => 'me', onRewardLearned: () => undefined, log: () => undefined });
  r.start();
  r.receive(message('eins', { receivedAt: Date.now() }));
  await tick();
  // Arrives while "eins" plays: rendered right away, not after "eins" ended.
  r.receive(message('zwei', { userId: 'u2', name: 'Anna', receivedAt: Date.now() }));
  await tick();
  assert.deepEqual(sink.played, ['Viewer sagt: eins']);
  assert.deepEqual(rendered, ['Viewer sagt: eins', 'Anna sagt: zwei']);
  sink.end();
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: eins', 'Anna sagt: zwei']);
  assert.equal(rendered.length, 2);
});

test('a prefetched message that is deleted is not read', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  const second = message('zwei', { userId: 'u2', receivedAt: Date.now() });
  r.receive(message('eins', { receivedAt: Date.now() }));
  r.receive(second);
  await tick();
  r.deleted(second.id);
  sink.end();
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: eins']);
});

test('every new message being read is reported to the UI', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  const current: (string | undefined)[] = [];
  r.on('status', (s) => current.push(s.current?.text));
  r.receive(message('eins', { receivedAt: Date.now() }));
  r.receive(message('zwei', { receivedAt: Date.now() }));
  await tick();
  sink.end();
  await tick();
  r.stop();
  assert.ok(current.includes('eins'));
  assert.ok(current.includes('zwei'));
});

test('nothing is played while the output is not ready (OBS not connected)', async () => {
  const sink = new FakeSink();
  sink.ready = false;
  const r = reader(sink);
  r.receive(message('warte', { receivedAt: Date.now() }));
  await tick();
  assert.equal(r.status.state, 'waiting-output');
  sink.ready = true;
  r.wake();
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Viewer sagt: warte']);
});
