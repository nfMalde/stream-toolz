// The speech part of the contract between the UI and the main process: the voices to choose from and the optional
// voice packages. Types only, so the UI can import it without Node code.

export type VoiceEngine = 'onecore' | 'sapi' | 'piper' | 'sherpa';

export interface VoiceChoice {
  /** Windows voice name, or "piper:…" / "kokoro:…". */
  id: string;
  engine: VoiceEngine;
  /** BCP 47 ("de-DE"). */
  language: string;
  gender?: string;
  /** Optional voices need their package; Windows voices are always installed. */
  installed: boolean;
  packageId?: string;
  /** Display name when the id is not readable ("Jan"). */
  label?: string;
}

export interface VoicePackageInfo {
  id: string;
  kind: 'engine' | 'model' | 'voice';
  engine: 'piper' | 'sherpa';
  name: string;
  license: string;
  source: string;
  language?: string;
  gender?: string;
  dataset?: string;
  requires?: string;
  /** Voice ids the package provides. */
  voices: string[];
  languages: string[];
  sizeBytes: number;
  installed: boolean;
  /** Ticked in the first-start choice for the app language (the user can untick it). */
  preselected: boolean;
}

export interface InstallProgress {
  packageId: string;
  phase: 'download' | 'extract' | 'installed';
  /** Bytes downloaded over all packages of this install, and the total. */
  receivedBytes: number;
  totalBytes: number;
}

export type InstallState =
  | { state: 'idle' }
  | { state: 'installing'; ids: string[]; progress?: InstallProgress }
  | { state: 'done'; ids: string[] }
  | { state: 'cancelled' }
  | { state: 'error'; message: string };
