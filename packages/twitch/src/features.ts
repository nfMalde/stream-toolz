// What modules read from Twitch. Each module names the features it reads while it is on (packages/core/src/module.ts):
// the login asks only for the permissions of those features, and the connection subscribes only to their events. A
// feature whose permission the login lacks waits for a new login; the others keep running. No Node imports: the UI
// shows each feature's state.

/**
 * chat: the messages with their notices (subs, gifted subs, raids) and moderation; follows: new followers;
 * redemptions: channel points rewards being redeemed (the streamer's own channel only); chatWrite: sending chat
 * messages as the logged-in account (the bot module), the one permission that writes.
 */
export type TwitchFeature = 'chat' | 'follows' | 'redemptions' | 'chatWrite';
export const TWITCH_FEATURES: readonly TwitchFeature[] = ['chat', 'follows', 'redemptions', 'chatWrite'];

/** The permission (scope) each feature needs. Twitch lists them on its confirmation page. */
export const FEATURE_SCOPES: Record<TwitchFeature, string> = {
  chat: 'user:read:chat',
  // Only the follower list (channel.follow).
  follows: 'moderator:read:followers',
  // Redemptions and the list of rewards (broadcaster only).
  redemptions: 'channel:read:redemptions',
  chatWrite: 'user:write:chat',
};

/** Features whose permission writes (shown differently in the login hint). */
export const WRITING_FEATURES: readonly TwitchFeature[] = ['chatWrite'];

/**
 * active: its events arrive; needs-login: the login is older than the feature's permission (log in again);
 * unavailable: the account may not see it (the follows of another channel, without being its moderator).
 */
export type FeatureState = 'active' | 'needs-login' | 'unavailable';

/** The permissions for a set of features, each once, in a fixed order. */
export function scopesFor(features: readonly TwitchFeature[]): string[] {
  return TWITCH_FEATURES.filter((feature) => features.includes(feature)).map((feature) => FEATURE_SCOPES[feature]);
}
