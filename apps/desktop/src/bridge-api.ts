// The contract between the UI and the main process (window.stz, see preload.ts): the shell's calls and one namespace
// per built-in module. Types only (plus a few constants from files without Node imports), so the UI can import it
// (@stz/api) without pulling in Node code.

import type { ShellApi } from '@stream-toolz/core/api';
import type { ReadMyChatApi } from '@stream-toolz/readmychat/api';
import type { CountdownApi } from '@stream-toolz/countdown/api';
import type { ChatoverlayApi } from '@stream-toolz/chatoverlay/api';
import type { AlertsApi } from '@stream-toolz/alerts/api';
import type { ChannelpointsApi } from '@stream-toolz/channelpoints/api';
import type { BotApi } from '@stream-toolz/bot/api';

export * from '@stream-toolz/core/api';
export * from '@stream-toolz/twitch/api';
export * from '@stream-toolz/speech/api';
export * from '@stream-toolz/readmychat/api';
export * from '@stream-toolz/countdown/api';
export * from '@stream-toolz/chatoverlay/api';
export * from '@stream-toolz/alerts/api';
export * from '@stream-toolz/channelpoints/api';
export * from '@stream-toolz/bot/api';

export interface StzApi extends ShellApi {
  readmychat: ReadMyChatApi;
  countdown: CountdownApi;
  chatoverlay: ChatoverlayApi;
  alerts: AlertsApi;
  channelpoints: ChannelpointsApi;
  bot: BotApi;
}
