// Twitch login with the streamer's own app, registered as a "Public" client: no client secret exists. The
// app asks Twitch for a code (device code grant flow), the streamer confirms it on twitch.tv/activate, the app
// waits for the tokens. Docs: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow

export const TWITCH_ID = 'https://id.twitch.tv';
/** Reading chat over EventSub; subs, gifted subs and raids come with it (chat notifications). */
export const CHAT_SCOPE = 'user:read:chat';
/** Follows (channel.follow): only the follower list, read-only. A login from before it still reads the chat. */
export const FOLLOWS_SCOPE = 'moderator:read:followers';
/** What a login asks for. Twitch shows these on the confirmation page. */
export const TWITCH_SCOPES = [CHAT_SCOPE, FOLLOWS_SCOPE] as const;
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scopes: string[];
}

export interface TokenInfo {
  clientId: string;
  login: string;
  userId: string;
  scopes: string[];
  expiresIn: number;
}

/** A started login: the code the streamer confirms, and where. */
export interface DeviceLogin {
  deviceCode: string;
  userCode: string;
  /** twitch.tv/activate with the code filled in. */
  verificationUri: string;
  /** Epoch ms. */
  expiresAt: number;
  /** Seconds between two checks. */
  interval: number;
}

/** An error answer from Twitch, with its status and message ("invalid client", "authorization_pending" …). */
export class TwitchHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A Client ID as Twitch issues them: letters and digits (30 so far). */
export const CLIENT_ID = /^[a-z0-9]{20,64}$/i;

async function post(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${TWITCH_ID}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new TwitchHttpError(response.status, typeof json.message === 'string' ? json.message : `HTTP ${response.status}`);
  return json;
}

function tokensFrom(json: Record<string, unknown>, now: number): TwitchTokens {
  const accessToken = json.access_token;
  const refreshToken = json.refresh_token;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') throw new TwitchHttpError(500, 'Twitch sent no tokens');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000, scopes: Array.isArray(json.scope) ? json.scope.filter((s): s is string => typeof s === 'string') : [] };
}

/** Starts a login: Twitch returns the code to confirm. Throws TwitchHttpError 400 "invalid client" for an unknown Client ID. */
export async function startDeviceLogin(clientId: string, now = Date.now()): Promise<DeviceLogin> {
  const json = await post('/oauth2/device', { client_id: clientId, scopes: TWITCH_SCOPES.join(' ') });
  const deviceCode = json.device_code;
  const userCode = json.user_code;
  const uri = json.verification_uri;
  if (typeof deviceCode !== 'string' || typeof userCode !== 'string' || typeof uri !== 'string' || !uri.startsWith('https://')) throw new TwitchHttpError(500, 'Twitch sent no code');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 1800;
  const interval = typeof json.interval === 'number' && json.interval > 0 ? json.interval : 5;
  return { deviceCode, userCode, verificationUri: uri, expiresAt: now + expiresIn * 1000, interval };
}

export type DeviceLoginResult = { tokens: TwitchTokens } | { error: 'expired' | 'denied' | 'invalid-client' | 'cancelled' };

/**
 * Waits until the streamer confirmed the code (Twitch answers "authorization_pending" until then). Checks every
 * interval seconds, slower when Twitch asks for it; network trouble is retried until the code expires.
 */
export async function waitForDeviceLogin(
  clientId: string,
  login: DeviceLogin,
  signal: AbortSignal,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => number = Date.now,
): Promise<DeviceLoginResult> {
  let interval = login.interval;
  while (!signal.aborted) {
    if (now() >= login.expiresAt) return { error: 'expired' };
    await sleep(interval * 1000);
    if (signal.aborted) break;
    try {
      const json = await post('/oauth2/token', { client_id: clientId, scopes: TWITCH_SCOPES.join(' '), device_code: login.deviceCode, grant_type: DEVICE_GRANT });
      return { tokens: tokensFrom(json, now()) };
    } catch (err) {
      if (!(err instanceof TwitchHttpError)) continue;
      const message = err.message.toLowerCase();
      if (message.includes('authorization_pending')) continue;
      if (message.includes('slow_down')) {
        interval += 5;
        continue;
      }
      if (message.includes('invalid client') || message.includes('secret')) return { error: 'invalid-client' };
      if (message.includes('denied')) return { error: 'denied' };
      // "invalid device code": the code expired or was already used; anything else: start over.
      return { error: message.includes('device code') ? 'expired' : 'denied' };
    }
  }
  return { error: 'cancelled' };
}

/** Public clients refresh without a secret; the refresh token can change each time (store the new one). */
export async function refreshTokens(clientId: string, refreshToken: string, now = Date.now()): Promise<TwitchTokens> {
  return tokensFrom(await post('/oauth2/token', { client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }), now);
}

/** Twitch asks apps to validate their token at start and every hour. undefined: the token is no longer valid. */
export async function validateToken(accessToken: string): Promise<TokenInfo | undefined> {
  const response = await fetch(`${TWITCH_ID}/oauth2/validate`, { headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (response.status === 401) return undefined;
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new TwitchHttpError(response.status, typeof json.message === 'string' ? json.message : `HTTP ${response.status}`);
  return {
    clientId: String(json.client_id ?? ''),
    login: String(json.login ?? ''),
    userId: String(json.user_id ?? ''),
    scopes: Array.isArray(json.scopes) ? json.scopes.filter((s): s is string => typeof s === 'string') : [],
    expiresIn: Number(json.expires_in) || 0,
  };
}

export async function revokeToken(clientId: string, token: string): Promise<void> {
  await post('/oauth2/revoke', { client_id: clientId, token });
}
