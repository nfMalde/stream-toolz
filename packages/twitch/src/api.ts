// The Twitch part of the contract between the UI and the main process: the connection's status, the streamer's
// app, the kinds of channel events, what the modules read. Types only (plus a few constants), so the UI can import it
// without Node code.

import type { FeatureState, TwitchFeature } from './features';

export type { ChannelEventKind, EventGroup } from './event-kind';
export { CHANNEL_EVENT_KINDS, EVENT_GROUPS, groupOf } from './event-kind';
export type { FeatureState, TwitchFeature } from './features';
export { FEATURE_SCOPES, scopesFor, TWITCH_FEATURES, WRITING_FEATURES } from './features';
export type { CustomReward, Redemption } from './redemption';
export { cleanLogin, LOGIN_NAME } from './names';

export type TwitchStage = 'no-app' | 'logged-out' | 'logging-in' | 'connecting' | 'connected' | 'error';

export type TwitchError =
  | 'invalid-client'
  | 'login-denied'
  | 'login-timeout'
  | 'token-invalid'
  | 'channel-unknown'
  | 'subscription-failed'
  | 'network'
  | 'unknown';

export interface TwitchAccount {
  id: string;
  login: string;
  name: string;
}

export interface TwitchStatus {
  stage: TwitchStage;
  /** The Client ID of the streamer's own app (type "Public") is stored. */
  hasApp: boolean;
  /** The last characters of the Client ID, so the user can tell which app is stored. */
  clientIdHint?: string;
  /** The account that logged in. */
  user?: TwitchAccount;
  /** The channel whose chat is read (the own one unless another is set). */
  channel?: TwitchAccount;
  /** While logging in: the code to confirm on Twitch, and the page (code filled in). */
  login?: { userCode: string; verificationUri: string; expiresAt: number };
  error?: TwitchError;
  /** Twitch's own message for an error, if it sent one. */
  message?: string;
  /** What a new login asks for: the features of the modules that are on (their permissions, see features.ts). */
  asks: TwitchFeature[];
  /** While connected: each feature the modules that are on read, and whether its events arrive. */
  features?: Partial<Record<TwitchFeature, FeatureState>>;
}

/** The streamer's own app, registered as "Public": only its Client ID (there is no secret). */
export interface TwitchAppInput {
  clientId: string;
}
