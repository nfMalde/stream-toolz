import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCountdown } from '../src/parse';

/** A Friday afternoon, local time. */
const NOW = new Date(2026, 9, 30, 15, 0, 0, 0);
const MIN = 60_000;

/** The clock time today (or dayOffset days later), local, as epoch ms. */
function at(hour: number, minute: number, dayOffset = 0): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function duration(phrase: string, ms: number, label = '') {
  const result = parseCountdown(phrase, NOW, 'de');
  assert.ok(result, `"${phrase}" should be understood`);
  assert.equal(result.endsAt - NOW.getTime(), ms, `"${phrase}": remaining`);
  assert.equal(result.label, label, `"${phrase}": label`);
}

function clock(phrase: string, endsAt: number, label = '') {
  const result = parseCountdown(phrase, NOW, 'de');
  assert.ok(result, `"${phrase}" should be understood`);
  assert.equal(new Date(result.endsAt).toString(), new Date(endsAt).toString(), `"${phrase}": time`);
  assert.equal(result.label, label, `"${phrase}": label`);
}

test('German durations', () => {
  duration('in 15 Minuten', 15 * MIN);
  duration('15 Minuten', 15 * MIN);
  duration('15 min', 15 * MIN);
  duration('15m', 15 * MIN);
  duration('15 Min.', 15 * MIN);
  duration('in 1 Stunde', 60 * MIN);
  duration('in einer Stunde', 60 * MIN);
  duration('in anderthalb Stunden', 90 * MIN);
  duration('eine halbe Stunde', 30 * MIN);
  duration('in einer halben Stunde', 30 * MIN);
  duration("in 'ner halben Stunde", 30 * MIN);
  duration('in 2 Stunden 15 Minuten', 135 * MIN);
  duration('1 Stunde und 30 Minuten', 90 * MIN);
  duration('90 Sekunden', 90_000);
  duration('in fünf Minuten', 5 * MIN);
  duration('in zwanzig Minuten', 20 * MIN);
  duration('zweieinhalb Stunden', 150 * MIN);
  duration('eine Viertelstunde', 15 * MIN);
  duration('noch 5 Minuten', 5 * MIN);
  duration('1,5 Stunden', 90 * MIN);
  duration('2 Std. 10 Min.', 130 * MIN);
  duration('30 Sek', 30_000);
});

test('English durations', () => {
  duration('in 10 minutes', 10 * MIN);
  duration('in an hour', 60 * MIN);
  duration('half an hour', 30 * MIN);
  duration('2 hours 15 minutes', 135 * MIN);
  duration('in five minutes', 5 * MIN);
  duration('one and a half hours', 90 * MIN);
  duration('an hour and a half', 90 * MIN);
  duration('a quarter of an hour', 15 * MIN);
  duration('1.5 h', 90 * MIN);
  duration('10 mins', 10 * MIN);
  duration('45 secs', 45_000);
  duration('2 hrs', 120 * MIN);
  duration('in a minute', MIN);
});

test('compact forms', () => {
  duration('1h 30m', 90 * MIN);
  duration('1h30', 90 * MIN);
  duration('2h15min', 135 * MIN);
  duration('1h', 60 * MIN);
  duration('5s', 5_000);
});

test('case and spaces do not matter', () => {
  duration('IN 15 MINUTEN', 15 * MIN);
  duration('  in   15   Minuten  ', 15 * MIN);
  duration('In Fünf Minuten', 5 * MIN);
});

test('the label is the rest of the phrase', () => {
  duration('in 10 Minuten: Giveaway', 10 * MIN, 'Giveaway');
  duration('5 Minuten Pause', 5 * MIN, 'Pause');
  duration('Pause in 5 Minuten', 5 * MIN, 'Pause');
  duration('break for 5 minutes', 5 * MIN, 'break');
  duration('Runde 2 in 10 Minuten', 10 * MIN, 'Runde 2');
  duration('in 10 Minuten - Giveaway', 10 * MIN, 'Giveaway');
  duration('Giveaway – in 10 Minuten', 10 * MIN, 'Giveaway');
  duration('Tee trinken: in einer Stunde', 60 * MIN, 'Tee trinken');
  duration('Pause (Kaffee) in 5 min', 5 * MIN, 'Pause (Kaffee)');
  const long = `in 5 Minuten ${'x'.repeat(80)}`;
  assert.equal(parseCountdown(long, NOW, 'de')?.label.length, 60);
});

test('a duration wins over a time of day in the same phrase', () => {
  duration('5 Minuten Pause bis 20:30', 5 * MIN, 'Pause bis 20:30');
});

test('German times of day', () => {
  clock('bis 20:30', at(20, 30));
  clock('um 20:30', at(20, 30));
  clock('20:30', at(20, 30));
  clock('bis 20 Uhr', at(20, 0));
  clock('um 20.30 Uhr', at(20, 30));
  clock('um 20.30', at(20, 30));
  clock('um halb 9', at(20, 30));
  clock('halb neun', at(20, 30));
  clock('viertel vor 9', at(20, 45));
  clock('viertel nach 8', at(20, 15));
  clock('dreiviertel 9', at(20, 45));
  clock('Mitternacht', at(0, 0, 1));
  clock('bis Mittag', at(12, 0, 1));
  clock('Pause bis 20:30', at(20, 30), 'Pause');
  clock('bis 20:30 Pause', at(20, 30), 'Pause');
});

test('English times of day', () => {
  clock('until 8:30 pm', at(20, 30));
  clock('at 20:30', at(20, 30));
  clock('at 8pm', at(20, 0));
  clock('at 8 p.m.', at(20, 0));
  clock('at 8 am', at(8, 0, 1));
  clock('12 pm', at(12, 0, 1));
  clock('12 am', at(0, 0, 1));
  clock('half past 8', at(20, 30));
  clock('quarter to 9', at(20, 45));
  clock('till noon', at(12, 0, 1));
  clock('until 20:30 – back soon', at(20, 30), 'back soon');
  clock('until 20:30: back soon', at(20, 30), 'back soon');
});

test('a time already passed today means tomorrow', () => {
  clock('bis 14:00', at(14, 0, 1));
  clock('um 15:00', at(15, 0, 1));
  clock('at 2 am', at(2, 0, 1));
});

test('hours one to eleven without am/pm mean the evening when the morning is over', () => {
  clock('bis 8', at(20, 0));
  clock('bis 8:30', at(20, 30));
  clock('um 8 Uhr', at(20, 0));
  clock('bis 2', at(2, 0, 1));
  clock('at 4', at(16, 0));
  const morning = new Date(2026, 9, 30, 7, 0, 0, 0);
  assert.equal(parseCountdown('bis 8', morning, 'de')?.endsAt, new Date(2026, 9, 30, 8, 0).getTime());
});

test('24:00 is midnight', () => {
  clock('bis 24:00', at(0, 0, 1));
});

test('not understood', () => {
  for (const phrase of ['', '   ', 'Giveaway', 'in 5', '20', '1.5', '20.30', '0 Minuten', 'in 999 Stunden', '25:00', '20:75', '13 pm', 'Tee trinken', '15 minx', 'in', 'halb', 'a', 'x'.repeat(300), 'einminütig']) {
    assert.equal(parseCountdown(phrase, NOW, 'de'), undefined, `"${phrase}" should not be understood`);
  }
});

test('both grammars work in either app language', () => {
  assert.ok(parseCountdown('in 15 Minuten', NOW, 'en'));
  assert.ok(parseCountdown('in 15 minutes', NOW, 'de'));
});
