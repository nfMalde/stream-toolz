import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { TwitchConnection, type StoredTwitch } from '../src/connection';
import { scopesFor } from '../src/features';
import { refreshTokens, startDeviceLogin, waitForDeviceLogin, type DeviceLogin } from '../src/oauth';

// Answers as Twitch sends them (getting-tokens-oauth, device code grant flow; checked live 2026-10-22 for "invalid client").
type Reply = { status: number; body: unknown };
const realFetch = globalThis.fetch;
let requests: { url: string; body: URLSearchParams }[] = [];

function stubFetch(replies: Reply[] | ((url: string) => Reply)): void {
  requests = [];
  let i = 0;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: new URLSearchParams(String(init?.body ?? '')) });
    const reply = typeof replies === 'function' ? replies(url) : replies[Math.min(i++, replies.length - 1)]!;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const noWait = async () => undefined;
const login: DeviceLogin = {
  deviceCode: 'dc',
  userCode: 'ABCDEFGH',
  verificationUri: 'https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH',
  expiresAt: Date.now() + 60_000,
  interval: 5,
  scopes: ['user:read:chat', 'moderator:read:followers'],
};
const tokens = { access_token: 'at', refresh_token: 'rt', expires_in: 14_820, scope: ['user:read:chat'], token_type: 'bearer' };

test('a login starts with the client id and asks only for the permissions it is given', async () => {
  stubFetch([{ status: 200, body: { device_code: 'dc', expires_in: 1800, interval: 5, user_code: 'ABCDEFGH', verification_uri: login.verificationUri } }]);
  const started = await startDeviceLogin('clientid1234567890abcdef', scopesFor(['follows', 'chat']), 1_000);
  assert.equal(requests[0]!.url, 'https://id.twitch.tv/oauth2/device');
  assert.equal(requests[0]!.body.get('client_id'), 'clientid1234567890abcdef');
  assert.equal(requests[0]!.body.get('scopes'), 'user:read:chat moderator:read:followers');
  assert.equal(requests[0]!.body.get('client_secret'), null);
  assert.deepEqual(started, { ...login, expiresAt: 1_801_000 });
});

test('an unknown client id is reported as such', async () => {
  stubFetch([{ status: 400, body: { status: 400, message: 'invalid client' } }]);
  await assert.rejects(startDeviceLogin('unknownclient12345678901', ['user:read:chat']), { message: 'invalid client' });
});

test('waiting: pending, slower when asked, then the tokens', async () => {
  stubFetch([
    { status: 400, body: { status: 400, message: 'authorization_pending' } },
    { status: 400, body: { status: 400, message: 'slow_down' } },
    { status: 200, body: tokens },
  ]);
  const waits: number[] = [];
  const result = await waitForDeviceLogin('cid', login, new AbortController().signal, async (ms) => void waits.push(ms));
  assert.ok('tokens' in result && result.tokens.accessToken === 'at' && result.tokens.refreshToken === 'rt');
  assert.deepEqual(waits, [5_000, 5_000, 10_000]);
  const last = requests.at(-1)!.body;
  assert.equal(last.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
  assert.equal(last.get('device_code'), 'dc');
  assert.equal(last.get('scopes'), 'user:read:chat moderator:read:followers');
  assert.equal(last.get('client_secret'), null);
});

test('waiting ends when the code expires, is used up, or the client is unknown', async () => {
  stubFetch([{ status: 400, body: { status: 400, message: 'invalid device code' } }]);
  assert.deepEqual(await waitForDeviceLogin('cid', login, new AbortController().signal, noWait), { error: 'expired' });
  stubFetch([{ status: 400, body: { status: 400, message: 'invalid client' } }]);
  assert.deepEqual(await waitForDeviceLogin('cid', login, new AbortController().signal, noWait), { error: 'invalid-client' });
  stubFetch([{ status: 400, body: { status: 400, message: 'authorization_pending' } }]);
  let now = Date.now();
  const expired = await waitForDeviceLogin('cid', { ...login, expiresAt: now + 1 }, new AbortController().signal, async () => void (now += 10), () => now);
  assert.deepEqual(expired, { error: 'expired' });
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await waitForDeviceLogin('cid', login, controller.signal, noWait), { error: 'cancelled' });
});

test('a public client refreshes without a secret', async () => {
  stubFetch([{ status: 200, body: tokens }]);
  await refreshTokens('cid', 'old-refresh');
  const body = requests[0]!.body;
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'old-refresh');
  assert.equal(body.get('client_secret'), null);
});

test('the connection saves a checked client id, logs in by code and drops an old secret', async () => {
  let stored: StoredTwitch = { clientSecret: 'old' } as StoredTwitch;
  const saved: StoredTwitch[] = [];
  const opened: string[] = [];
  stubFetch((url) =>
    url.endsWith('/oauth2/device')
      ? { status: 200, body: { device_code: 'dc', expires_in: 1800, interval: 0.001, user_code: 'ABCDEFGH', verification_uri: login.verificationUri } }
      : url.endsWith('/oauth2/token')
        ? { status: 200, body: tokens }
        : { status: 503, body: { message: 'later' } },
  );
  const connection = new TwitchConnection({
    store: { load: () => stored, save: (v) => void saved.push((stored = v)) },
    channel: () => '',
    features: () => ['chat', 'follows'],
    openBrowser: (url) => void opened.push(url),
    log: () => undefined,
  });
  assert.equal(saved.length, 1);
  assert.equal('clientSecret' in saved[0]!, false);
  await connection.saveApp({ clientId: ' clientid1234567890abcdef ' });
  assert.equal(stored.clientId, 'clientid1234567890abcdef');
  assert.equal(connection.status.stage, 'logged-out');
  await connection.beginLogin();
  assert.deepEqual(opened, [login.verificationUri]);
  assert.equal(stored.tokens?.accessToken, 'at');
  connection.stop();
});

test('the login asks only for what the modules that are on read; with none on, for the chat', async () => {
  stubFetch(() => ({ status: 200, body: { device_code: 'dc', expires_in: 1800, interval: 5, user_code: 'ABCDEFGH', verification_uri: login.verificationUri } }));
  let features: ('chat' | 'follows')[] = ['chat'];
  const connection = new TwitchConnection({
    store: { load: () => ({}), save: () => undefined },
    channel: () => '',
    features: () => features,
    openBrowser: () => undefined,
    log: () => undefined,
  });
  await connection.saveApp({ clientId: 'clientid1234567890abcdef' });
  assert.equal(requests.at(-1)!.body.get('scopes'), 'user:read:chat');
  features = [];
  await connection.saveApp({ clientId: 'clientid1234567890abcdef' });
  assert.equal(requests.at(-1)!.body.get('scopes'), 'user:read:chat');
  connection.stop();
});

test('a login without a permission keeps its tokens: that feature waits for a new login, nothing is dropped', async () => {
  const clientId = 'clientid1234567890abcdef';
  let stored: StoredTwitch = {
    clientId,
    tokens: { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, scopes: [] },
    user: { id: '42', login: 'maldoe', name: 'Maldoe' },
  };
  stubFetch((url) =>
    url.includes('/oauth2/validate')
      ? { status: 200, body: { client_id: clientId, login: 'maldoe', user_id: '42', scopes: [], expires_in: 3600 } }
      : url.includes('/helix/users')
        ? { status: 200, body: { data: [{ id: '42', login: 'maldoe', display_name: 'Maldoe' }] } }
        : { status: 503, body: { message: 'later' } },
  );
  const connection = new TwitchConnection({
    store: { load: () => stored, save: (v) => void (stored = v) },
    channel: () => '',
    features: () => ['chat'],
    openBrowser: () => undefined,
    log: () => undefined,
  });
  const connected = new Promise<void>((resolve) => connection.on('status', (status) => status.stage === 'connected' && resolve()));
  connection.start();
  await connected;
  assert.deepEqual(connection.status.features, { chat: 'needs-login' });
  assert.equal(connection.status.error, undefined);
  assert.equal(stored.tokens?.accessToken, 'at');
  // No socket without a subscription: nothing else was asked of Twitch.
  assert.ok(requests.every((r) => r.url.includes('/oauth2/validate') || r.url.includes('/helix/users')));
  connection.stop();
});
