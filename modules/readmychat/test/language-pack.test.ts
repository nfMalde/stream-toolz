import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { languagePacksDir, loadLanguagePacks } from '../main/language-packs';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { packFor, validateLanguagePack } from '../src/language-pack';

/** A complete, valid pack to start from. */
function good(): Record<string, unknown> {
  return {
    format: 'stream-toolz-language-pack',
    version: 1,
    id: 'fr',
    name: 'Français',
    locale: 'fr-FR',
    words: ['bonjour', 'merci', 'oui'],
    letters: 'éèàç',
    pronounce: { GG: 'bien joué' },
    texts: {
      says: '{name} dit : {message}',
      link: 'lien',
      testName: 'Read My Chat',
      outputTest: 'Bonjour !',
      preview: 'Bonjour le chat !',
      anonymous: 'Quelqu’un',
      prime: 'Prime',
      tier: 'Niveau {n}',
      events: {
        follow: '{name} suit la chaîne.',
        sub: '{name} s’est abonné.',
        prime: '{name} s’est abonné avec Prime.',
        resub: '{name} est abonné depuis {months} mois.',
        gift: '{name} offre un abonnement à {recipient}.',
        communityGift: '{name} offre {count} abonnements.',
        raid: '{name} arrive avec {count} spectateurs.',
      },
      eventsOne: { raid: '{name} arrive avec un spectateur.' },
    },
  };
}

test('a complete pack is accepted and cleaned', () => {
  const { pack, error } = validateLanguagePack(good());
  assert.equal(error, undefined);
  assert.equal(pack?.id, 'fr');
  assert.equal(pack?.builtIn, false);
  assert.deepEqual(pack?.words, ['bonjour', 'merci', 'oui']);
  assert.deepEqual(pack?.pronounce, { gg: 'bien joué' });
  assert.equal(pack?.texts.eventsOne.raid, '{name} arrive avec un spectateur.');
  assert.equal(pack?.texts.events.raid, '{name} arrive avec {count} spectateurs.');
});

test('the built-in packs pass their own check', () => {
  assert.deepEqual(
    BUILT_IN_PACKS.map((p) => [p.id, p.locale, p.builtIn]),
    [
      ['de', 'de-DE', true],
      ['en', 'en-US', true],
    ],
  );
});

test('eventsOne and pronounce are optional; letters too', () => {
  const minimal = good();
  delete minimal['letters'];
  delete minimal['pronounce'];
  delete (minimal['texts'] as Record<string, unknown>)['eventsOne'];
  const { pack, error } = validateLanguagePack(minimal);
  assert.equal(error, undefined);
  assert.deepEqual(pack?.texts.eventsOne, {});
  assert.equal(pack?.letters, '');
});

test('bad packs are rejected with a reason', () => {
  const broken = (change: (pack: Record<string, unknown>) => void): string => {
    const pack = good();
    change(pack);
    const result = validateLanguagePack(pack);
    assert.equal(result.pack, undefined);
    return result.error;
  };
  const texts = (pack: Record<string, unknown>) => pack['texts'] as Record<string, unknown>;
  assert.equal(validateLanguagePack('x').error, 'not a JSON object');
  assert.match(broken((p) => (p['format'] = 'gt-toolz-language-pack')), /"format"/);
  assert.match(broken((p) => (p['version'] = 2)), /version 2/);
  assert.match(broken((p) => (p['id'] = 'FR')), /"id"/);
  assert.match(broken((p) => (p['id'] = 'french')), /"id"/);
  assert.match(broken((p) => (p['name'] = '')), /"name"/);
  assert.match(broken((p) => (p['locale'] = 'fr_FR')), /"locale"/);
  assert.match(broken((p) => (p['words'] = 'bonjour')), /"words"/);
  assert.match(broken((p) => (p['words'] = ['Bonjour'])), /lower case/);
  assert.match(broken((p) => (p['words'] = ['two words'])), /not a word/);
  assert.match(broken((p) => (p['words'] = Array.from({ length: 2001 }, (_, i) => `w${i}`.replace(/\d/g, 'a')))), /2000/);
  assert.match(broken((p) => (p['letters'] = 'é1')), /"letters"/);
  assert.match(broken((p) => delete texts(p)['says']), /"texts.says"/);
  assert.match(broken((p) => (texts(p)['says'] = '{user} dit : {message}')), /unknown placeholder\(s\) \{user\}/);
  assert.match(broken((p) => (texts(p)['link'] = 'x'.repeat(501))), /longer than 500/);
  assert.match(broken((p) => (texts(p)['link'] = 'a\u0007b')), /control characters/);
  assert.match(broken((p) => (texts(p)['tier'] = 'Niveau {count}')), /"texts.tier"/);
  assert.match(broken((p) => delete (texts(p)['events'] as Record<string, unknown>)['raid']), /"texts.events.raid"/);
  assert.match(broken((p) => ((texts(p)['events'] as Record<string, unknown>)['raid'] = '{name} {viewers}')), /\{viewers\}/);
  assert.match(broken((p) => ((texts(p)['eventsOne'] as Record<string, unknown>)['cheer'] = 'x')), /not an event/);
  assert.match(broken((p) => (texts(p)['extra'] = 'x')), /unknown text "extra"/);
  assert.match(broken((p) => (p['pronounce'] = { 'two words': 'x' })), /"pronounce"/);
  assert.match(broken((p) => (p['pronounce'] = ['gg'])), /"pronounce"/);
});

test('packs from a folder: an own pack replaces the built-in one, a broken file is skipped and logged', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-packs-'));
  const dir = languagePacksDir(dataDir);
  const lines: string[] = [];
  try {
    // The folder is created when missing.
    assert.deepEqual(
      loadLanguagePacks(dir, BUILT_IN_PACKS, (line) => lines.push(line)).map((p) => p.id),
      ['de', 'en'],
    );
    assert.ok(fs.existsSync(dir));

    const ownGerman = { ...good(), id: 'de', name: 'Deutsch (eigene)', locale: 'de-AT', words: ['servas'] };
    fs.writeFileSync(path.join(dir, 'de.json'), JSON.stringify(ownGerman));
    fs.writeFileSync(path.join(dir, 'fr.json'), JSON.stringify(good()));
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    fs.writeFileSync(path.join(dir, 'wrong.json'), JSON.stringify({ ...good(), id: 'es', texts: {} }));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    lines.length = 0;
    const packs = loadLanguagePacks(dir, BUILT_IN_PACKS, (line) => lines.push(line));
    assert.deepEqual(
      packs.map((p) => [p.id, p.builtIn]),
      [
        ['de', false],
        ['en', true],
        ['fr', false],
      ],
    );
    assert.equal(packFor('de', packs)?.name, 'Deutsch (eigene)');
    assert.equal(packFor('de', packs)?.locale, 'de-AT');
    assert.ok(lines.some((l) => l.startsWith('READMYCHAT language pack broken.json: ')), lines.join('\n'));
    assert.ok(lines.some((l) => l.startsWith('READMYCHAT language pack wrong.json: "texts.says"')), lines.join('\n'));
    // Only file names in the log, never the folder.
    assert.ok(lines.every((l) => !l.includes(dataDir)));
    // The built-in packs are untouched.
    assert.equal(BUILT_IN_PACKS.find((p) => p.id === 'de')?.locale, 'de-DE');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
