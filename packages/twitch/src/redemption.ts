// A channel points redemption (EventSub channel.channel_points_custom_reward_redemption.add v1), read defensively
// like chat messages: fields are checked and bounded, unknown shapes are ignored.

const MAX_TEXT = 500;
const MAX_NAME = 64;

const str = (value: unknown, max = MAX_NAME): string => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export interface Redemption {
  id: string;
  userId: string;
  /** Login name (lower case). */
  login: string;
  /** Display name as shown in chat. */
  name: string;
  rewardId: string;
  rewardTitle: string;
  cost: number;
  /** What the viewer typed, for rewards that ask for text. */
  input: string;
  receivedAt: number;
  /** From a test button. */
  test?: boolean;
}

/** A reward of the channel (Helix GET /channel_points/custom_rewards). */
export interface CustomReward {
  id: string;
  title: string;
  cost: number;
  enabled: boolean;
}

export function redemptionFromEvent(event: unknown, now = Date.now()): Redemption | undefined {
  const e = obj(event);
  const id = str(e['id']);
  const reward = obj(e['reward']);
  const rewardId = str(reward['id']);
  if (!id || !rewardId) return undefined;
  const login = str(e['user_login']).toLowerCase();
  return {
    id,
    userId: str(e['user_id']),
    login,
    name: str(e['user_name']) || login,
    rewardId,
    rewardTitle: str(reward['title'], MAX_NAME),
    cost: num(reward['cost']),
    input: str(e['user_input'], MAX_TEXT),
    receivedAt: now,
  };
}

export function customRewardFromApi(value: unknown): CustomReward | undefined {
  const r = obj(value);
  const id = str(r['id']);
  if (!id) return undefined;
  return { id, title: str(r['title'], MAX_NAME), cost: num(r['cost']), enabled: r['is_enabled'] !== false };
}
