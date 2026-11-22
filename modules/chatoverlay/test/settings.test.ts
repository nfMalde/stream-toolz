import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorString, parseColor } from '../src/color';
import { DEFAULT_HIDDEN_BOTS, DEFAULT_SETTINGS, isColor, normalizeSettings } from '../src/settings';
import { styleOf } from '../src/style';

test('defaults are complete and valid; nothing given keeps them', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.emotes, 'text');
  assert.equal(DEFAULT_SETTINGS.maxMessages, 12);
  assert.ok(DEFAULT_HIDDEN_BOTS.includes('nightbot'));
});

test('numbers are clamped and rounded, enums fall back, booleans must be booleans', () => {
  const s = normalizeSettings({
    maxMessages: 999,
    fadeSeconds: -5,
    fontSize: '30.4',
    width: 100,
    fontFamily: 'comic',
    nameColors: 'rainbow',
    emotes: 'images',
    direction: 'sideways',
    align: 'right',
    showBadges: 'yes',
    hideCommands: false,
    showEvents: 0,
  });
  assert.equal(s.maxMessages, 50);
  assert.equal(s.fadeSeconds, 0);
  assert.equal(s.fontSize, 30);
  assert.equal(s.width, 200);
  assert.equal(s.fontFamily, 'sans');
  assert.equal(s.nameColors, 'twitch');
  assert.equal(s.emotes, 'images');
  assert.equal(s.direction, 'up');
  assert.equal(s.align, 'right');
  assert.equal(s.showBadges, true);
  assert.equal(s.hideCommands, false);
  assert.equal(s.showEvents, true);
});

test('colours: hex, rgb(a) and transparent pass, anything else keeps the previous value', () => {
  const ok = ['#fff', '#ffff', '#ff730f', '#ff730f80', 'transparent', 'rgb(1, 2, 3)', 'rgba(1,2,3,0.5)', 'RGBA(0, 0, 0, 1)', ' #ABC '];
  for (const value of ok) assert.ok(isColor(value), value);
  const bad = ['red', 'url(x)', '#ff730f; color: red', 'rgba(1,2,3,0.5) !important', 'rgb(1,2)', 'hsl(1,2%,3%)', '', 42];
  for (const value of bad) assert.equal(isColor(value), false, String(value));
  const s = normalizeSettings({ textColor: 'red', background: 'RGBA(10, 20, 30, 0.25)', nameColor: '#ABC' });
  assert.equal(s.textColor, DEFAULT_SETTINGS.textColor);
  assert.equal(s.background, 'rgba(10, 20, 30, 0.25)');
  assert.equal(s.nameColor, '#abc');
});

test('hidden bots are cleaned login names, unique, at most 200', () => {
  const s = normalizeSettings({ hideBots: ['@NightBot', 'twitch.tv/StreamElements', 'nightbot', 'bad name', '', 7] });
  assert.deepEqual(s.hideBots, ['nightbot', 'streamelements']);
  assert.equal(normalizeSettings({ hideBots: 'nightbot' }).hideBots, DEFAULT_SETTINGS.hideBots);
  assert.equal(normalizeSettings({ hideBots: Array.from({ length: 300 }, (_, i) => `bot${i}`) }).hideBots.length, 200);
});

test('the style for the page comes from the settings', () => {
  const style = styleOf({ ...DEFAULT_SETTINGS, fontFamily: 'mono', nameColors: 'single', width: 420 });
  assert.match(style.fontFamily, /monospace/);
  assert.equal(style.twitchColors, false);
  assert.equal(style.width, 420);
  assert.equal(style.emotes, 'text');
  assert.equal(style.maxMessages, 12);
});

test('colours go to the picker and back', () => {
  assert.deepEqual(parseColor('#ff730f'), { hex: '#ff730f', opacity: 100 });
  assert.deepEqual(parseColor('#abc'), { hex: '#aabbcc', opacity: 100 });
  assert.deepEqual(parseColor('#ff730f80'), { hex: '#ff730f', opacity: 50 });
  assert.deepEqual(parseColor('rgba(255, 115, 15, 0.25)'), { hex: '#ff730f', opacity: 25 });
  assert.deepEqual(parseColor('rgb(0, 0, 0)'), { hex: '#000000', opacity: 100 });
  assert.deepEqual(parseColor('transparent'), { hex: '#000000', opacity: 0 });
  assert.deepEqual(parseColor('nonsense'), { hex: '#000000', opacity: 100 });
  assert.equal(colorString({ hex: '#FF730F', opacity: 100 }), '#ff730f');
  assert.equal(colorString({ hex: '#ff730f', opacity: 0 }), 'transparent');
  assert.equal(colorString({ hex: '#ff730f', opacity: 50 }), 'rgba(255, 115, 15, 0.5)');
  assert.equal(colorString({ hex: '#000000', opacity: 25 }), 'rgba(0, 0, 0, 0.25)');
  assert.equal(colorString({ hex: 'junk', opacity: 100 }), '#000000');
  // Every string the picker produces passes the settings check.
  for (const opacity of [0, 5, 50, 95, 100]) assert.ok(isColor(colorString({ hex: '#123456', opacity })));
});
