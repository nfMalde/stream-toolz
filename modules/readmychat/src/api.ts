// The ReadMyChat part of the contract between the UI and the main process (window.stz.readmychat): its settings, the
// reader's status, its queue and chat history, and the loaded language packs. Types only (plus a few constants and
// pure helpers), so the UI can import it without Node code.

import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { ChannelEventKind } from '@stream-toolz/twitch/api';
import type { ChatLanguage } from './language';
import type { LanguagePackInfo } from './language-pack';
import type { Settings } from './settings';

/** The module's id: its key in config.json, its IPC namespace, window.stz.readmychat. */
export const READMYCHAT = 'readmychat';

export type { ChatLanguage } from './language';
export type { LanguagePack, LanguagePackInfo, SpokenTexts } from './language-pack';
export type { Audience, HotkeyAction, LinkHandling, OutputMode, ReadNames, Settings } from './settings';
/** Pure checks and texts the UI shares with the main process (these files have no Node imports). */
export { HOTKEY_ACTIONS } from './settings';
export { defaultEventText } from './spoken';
export { mainLanguage } from './language';
export { packFor, primaryLanguage } from './language-pack';

export type ReaderState = 'off' | 'idle' | 'reading' | 'paused' | 'waiting-output' | 'no-voice';

export interface QueuedItem {
  id: string;
  name: string;
  /** The message as it was written. */
  text: string;
  /** What the voice says. */
  spoken: string;
  /** Read in this language (a pack id). */
  language: ChatLanguage;
  /** When the message may be read (mod delay). */
  readyAt: number;
  test?: boolean;
  /** A follow, sub, raid, …: `spoken` is the whole announcement. */
  event?: ChannelEventKind;
}

export interface ReaderStatus {
  state: ReaderState;
  current?: QueuedItem;
  queued: QueuedItem[];
  /** The voice that reads (display id), if one is ready. */
  voice?: string;
  /** The reward is being learned: the next channel points message with text sets it. */
  learningReward: boolean;
}

export type SkipReason =
  | 'command'
  | 'ignored-user'
  | 'own-message'
  | 'audience'
  | 'reward'
  | 'duplicate'
  | 'user-limit'
  | 'blocked-word'
  | 'link'
  | 'emote-only'
  | 'empty'
  | 'shared-chat'
  | 'deleted'
  | 'user-cleared'
  | 'chat-cleared'
  | 'queue-full'
  | 'cleared'
  | 'removed'
  | 'speech-failed'
  | 'event-off'
  | 'follow-limit';

export interface ChatLogEntry {
  id: string;
  at: number;
  name: string;
  text: string;
  outcome: 'queued' | 'read' | 'skipped';
  reason?: SkipReason;
  test?: boolean;
  event?: ChannelEventKind;
}

export interface ReadMyChatApi extends ModuleSettingsApi<Settings> {
  readerStatus(): Promise<ReaderStatus>;
  onReaderStatus(listener: (status: ReaderStatus) => void): Unsubscribe;
  chatLog(): Promise<ChatLogEntry[]>;
  onChatLog(listener: (entry: ChatLogEntry) => void): Unsubscribe;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  clearQueue(): Promise<void>;
  removeQueued(id: string): Promise<void>;
  /** Reads a text as if it came from the chat (filters included). */
  testMessage(text: string): Promise<void>;
  /** Reads an example of the event with its current text (also when the event is switched off). */
  testEvent(kind: ChannelEventKind): Promise<void>;
  /** The next channel points message with text sets the reward to read. */
  learnReward(): Promise<void>;
  cancelLearnReward(): Promise<void>;
  /** A short test sentence on the chosen output. */
  testOutput(): Promise<void>;
  /** The preview sentence with a voice, on the audio device (for the user's own ears, never on the stream). */
  previewVoice(id: string): Promise<void>;
  /** The loaded language packs (built in and from the language-packs folder), in the order they are shown. */
  languagePacks(): Promise<LanguagePackInfo[]>;
  onLanguagePacks(listener: (packs: LanguagePackInfo[]) => void): Unsubscribe;
  /** Reads the language-packs folder again (a file was added or changed). */
  reloadLanguagePacks(): Promise<LanguagePackInfo[]>;
  /** The language-packs folder in the system's file manager. */
  openLanguagePacksFolder(): Promise<void>;
}
