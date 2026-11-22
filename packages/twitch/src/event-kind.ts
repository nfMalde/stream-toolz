// The kinds of channel events that are read aloud. No other imports: the UI and the settings use these too.

/** What happened. 'sub' also covers a gifted or Prime sub that was turned into a paid one. */
export type ChannelEventKind = 'follow' | 'sub' | 'prime' | 'resub' | 'gift' | 'communityGift' | 'raid';
export const CHANNEL_EVENT_KINDS: readonly ChannelEventKind[] = ['follow', 'sub', 'prime', 'resub', 'gift', 'communityGift', 'raid'];

/** Switched on and off together, as in the settings. */
export type EventGroup = 'follow' | 'sub' | 'gift' | 'raid';
export const EVENT_GROUPS: readonly EventGroup[] = ['follow', 'sub', 'gift', 'raid'];

export function groupOf(kind: ChannelEventKind): EventGroup {
  switch (kind) {
    case 'sub':
    case 'prime':
    case 'resub':
      return 'sub';
    case 'gift':
    case 'communityGift':
      return 'gift';
    default:
      return kind;
  }
}
