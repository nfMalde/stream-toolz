import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createLogger, errorText, scrub } from '../src/logger';

test('scrub masks tokens, codes, secrets and the OBS key, and leaves the rest', () => {
  assert.equal(scrub('Authorization: Bearer abcdefghij0123456789abcdefghij'), 'Authorization: Bearer ***');
  assert.equal(scrub('OAuth abcdefghij0123456789abcdefghij'), 'OAuth ***');
  assert.equal(scrub('POST https://id.twitch.tv/oauth2/token?client_id=abc&device_code=xyz123&grant_type=x'), 'POST https://id.twitch.tv/oauth2/token?client_id=abc&device_code=***&grant_type=x');
  assert.equal(scrub('access_token=abc123&refresh_token=def456 token=ghi code=jkl state=mno'), 'access_token=***&refresh_token=*** token=*** code=*** state=***');
  assert.equal(scrub('{"access_token":"abc","refresh_token": "def","client_secret":"ghi","device_code":"jkl","accessToken":"m","refreshToken":"n","clientSecret":"o","deviceCode":"p"}'), '{"access_token":"***","refresh_token": "***","client_secret":"***","device_code":"***","accessToken":"***","refreshToken":"***","clientSecret":"***","deviceCode":"***"}');
  assert.equal(scrub('source http://localhost:47391/obs/abcdefghijklmnop/'), 'source http://localhost:47391/obs/***/');
  // A bare token anywhere; logins (up to 25 characters), ids with dashes and version strings stay readable.
  assert.equal(scrub('got abcdefghij0123456789abcdefghij back'), 'got *** back');
  assert.equal(scrub('user some_very_long_login_name25 id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 v1.2.3'), 'user some_very_long_login_name25 id 3f2504e0-4f89-11d3-9a0c-0305e82c3301 v1.2.3');
  assert.equal(scrub('connected to maldoe (chat active, follows active)'), 'connected to maldoe (chat active, follows active)');
  assert.equal(scrub('code 400 from Twitch'), 'code 400 from Twitch');
});

test('errorText gives the stack of an error and the text of anything else', () => {
  assert.match(errorText(new Error('boom')), /^Error: boom\n\s+at /);
  assert.equal(errorText('plain'), 'plain');
  assert.equal(errorText(42), '42');
});

test('the logger writes a file per day, scrubbed and indented, and keeps 14 days', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-log-'));
  try {
    for (let day = 1; day <= 16; day++) fs.writeFileSync(path.join(dir, `2020-01-${String(day).padStart(2, '0')}.log`), 'old\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'kept\n');
    const log = createLogger(dir, false);
    log('TWITCH    token=abc123\nsecond line');

    const files = fs.readdirSync(dir).sort();
    assert.ok(!files.includes('2020-01-01.log') && !files.includes('2020-01-02.log'), 'the two oldest are gone');
    assert.ok(files.includes('2020-01-03.log') && files.includes('2020-01-16.log'), 'the 14 newest stay');
    assert.ok(files.includes('notes.txt'), 'other files stay');
    const today = `${new Date().toISOString().slice(0, 10)}.log`;
    assert.ok(files.includes(today));
    const text = fs.readFileSync(path.join(dir, today), 'utf8');
    assert.match(text, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z TWITCH {4}token=\*\*\*\n {25}second line\n$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the logger keeps going without a writable folder', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stz-log-')), 'a-file');
  fs.writeFileSync(file, '');
  try {
    // A folder below a file cannot exist, so neither the folder nor the log file can be written.
    const log = createLogger(path.join(file, 'logs'), false);
    assert.doesNotThrow(() => log('hello'));
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});
