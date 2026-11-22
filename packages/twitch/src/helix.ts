// The few Twitch API calls the reader needs: who is who, and the EventSub subscriptions.

import type { TwitchAccount } from './api';
import { customRewardFromApi, type CustomReward } from './redemption';
import { TwitchHttpError } from './oauth';

export const HELIX = 'https://api.twitch.tv/helix';

export interface HelixAuth {
  clientId: string;
  accessToken: string;
}

async function call(auth: HelixAuth, path: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
  const response = await fetch(`${HELIX}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Client-Id': auth.clientId,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new TwitchHttpError(response.status, typeof json.message === 'string' ? json.message : `HTTP ${response.status}`);
  return json;
}

/** Accounts by id or login name (unknown ones are left out). */
export async function getUsers(auth: HelixAuth, query: { ids?: string[]; logins?: string[] }): Promise<TwitchAccount[]> {
  const params = new URLSearchParams();
  for (const id of query.ids ?? []) params.append('id', id);
  for (const login of query.logins ?? []) params.append('login', login);
  const json = await call(auth, `/users?${params}`);
  const data = Array.isArray(json.data) ? json.data : [];
  return data.map((u: Record<string, unknown>) => ({ id: String(u.id ?? ''), login: String(u.login ?? ''), name: String(u.display_name ?? u.login ?? '') }));
}

/** The channel's custom rewards (channel points), broadcaster only. */
export async function getCustomRewards(auth: HelixAuth, broadcasterId: string): Promise<CustomReward[]> {
  const json = await call(auth, `/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(broadcasterId)}`);
  const data = Array.isArray(json.data) ? json.data : [];
  return data.map(customRewardFromApi).filter((r): r is CustomReward => !!r);
}

/** A chat message as the logged-in account (user:write:chat). Twitch drops messages it rejects (its answer says so). */
export async function sendChatMessage(auth: HelixAuth, broadcasterId: string, senderId: string, message: string, replyTo?: string): Promise<void> {
  const json = await call(auth, '/chat/messages', {
    method: 'POST',
    body: { broadcaster_id: broadcasterId, sender_id: senderId, message: message.slice(0, 500), ...(replyTo ? { reply_parent_message_id: replyTo } : {}) },
  });
  const data = Array.isArray(json.data) ? (json.data[0] as Record<string, unknown> | undefined) : undefined;
  if (data && data.is_sent === false) {
    const drop = data.drop_reason as Record<string, unknown> | undefined;
    throw new Error(typeof drop?.message === 'string' ? drop.message : 'message dropped');
  }
}

/** One EventSub subscription for the WebSocket session. */
export async function subscribe(auth: HelixAuth, type: string, condition: Record<string, string>, sessionId: string, version = '1'): Promise<void> {
  await call(auth, '/eventsub/subscriptions', {
    method: 'POST',
    body: { type, version, condition, transport: { method: 'websocket', session_id: sessionId } },
  });
}
