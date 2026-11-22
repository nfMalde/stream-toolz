// The Chat Overlay part of the contract between the UI and the main process (window.stz.chatoverlay). Types only (plus a
// few constants and pure helpers), so the UI can import it without Node code. Everything exported here lands in
// @stz/api next to the other modules' exports: names carry the module's prefix.

import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { OverlayItem } from './item';
import type { Settings } from './settings';

/** The module's id: its key in config.json, its IPC namespace, window.stz.chatoverlay. */
export const CHATOVERLAY = 'chatoverlay';

export type { Settings as ChatoverlaySettings, Align as ChatoverlayAlign, Direction as ChatoverlayDirection, EmoteMode as ChatoverlayEmoteMode, FontFamily as ChatoverlayFontFamily, NameColors as ChatoverlayNameColors } from './settings';
export type { ItemPart as ChatoverlayItemPart, OverlayItem as ChatoverlayItem, Role as ChatoverlayRole } from './item';
export type { OverlayStyle as ChatoverlayStyle } from './style';
/** Pure helpers the UI shares with the main process (these files have no Node imports). */
export { FONT_FAMILIES as CHATOVERLAY_FONT_FAMILIES } from './settings';
export { styleOf as chatoverlayStyle } from './style';
export { OVERLAY_CSS as CHATOVERLAY_CSS } from './page-css';
export { colorString as chatoverlayColorString, parseColor as chatoverlayParseColor, type PickedColor as ChatoverlayPickedColor } from './color';

export interface ChatoverlayStatus {
  /** The page's address on the local server (with the key: a secret in streamer mode). */
  url: string;
  /** What the overlay shows now, oldest first. */
  items: OverlayItem[];
  /** OBS browser sources (or browser tabs) showing the page right now. */
  clients: number;
}

export interface ChatoverlayApi extends ModuleSettingsApi<Settings> {
  status(): Promise<ChatoverlayStatus>;
  /** A new line on the overlay (for the preview). */
  onItem(listener: (item: OverlayItem) => void): Unsubscribe;
  /** Lines gone (deleted, timed out, pushed out by newer ones). */
  onRemoved(listener: (ids: string[]) => void): Unsubscribe;
  onCleared(listener: (value: null) => void): Unsubscribe;
  onClients(listener: (count: number) => void): Unsubscribe;
  /** The page's address to the clipboard (the UI has no clipboard access). */
  copyUrl(): Promise<void>;
  /** The page in the browser, for a look. */
  openUrl(): Promise<void>;
  /** A few sample messages with emotes, roles and a follow, on the overlay and in the preview. */
  testMessages(): Promise<void>;
}
