// Which voices exist (Windows voices plus the allowed optional ones) and how to open one.

import type { VoiceChoice } from './api';
import { PiperRenderer } from './piper';
import { SherpaRenderer } from './sherpa';
import { Speech, type SpeechPauses } from './speech';
import { allowedVoiceIds, installedVoices } from './voice-packages';
import { listWindowsVoices, WindowsRenderer, type WindowsVoiceInfo } from './windows-voice';

const EXTERNAL = /^(piper|kokoro|vits):/;

export function isExternalVoice(id: string): boolean {
  return EXTERNAL.test(id);
}

let windowsVoices: Promise<WindowsVoiceInfo[]> | undefined;

/** Windows voices (listed once per process; new ones need a restart anyway) and the allowed optional voices. */
export async function availableVoices(voicesDir: string): Promise<VoiceChoice[]> {
  windowsVoices ??= listWindowsVoices();
  const installed = new Set(installedVoices(voicesDir).map((v) => v.id));
  return [
    ...allowedVoiceIds().map((v) => ({
      id: v.id,
      engine: (v.id.startsWith('piper:') ? 'piper' : 'sherpa') as VoiceChoice['engine'],
      language: v.language,
      gender: v.gender,
      installed: installed.has(v.id),
      packageId: v.packageId,
      label: v.name,
    })),
    ...(await windowsVoices).map((v) => ({ id: v.name, engine: v.engine, language: v.language, installed: true })),
  ];
}

/**
 * The voice used when the user picked none: an installed Piper voice first (fast, and the user chose to
 * download it), then a sherpa-onnx voice (none in the catalogue today), then a OneCore voice, then whatever Windows has for the language.
 */
export function defaultVoiceId(language: string, voices: VoiceChoice[]): string {
  const lang = language.split('-')[0]!.toLowerCase();
  const matching = voices.filter((v) => v.installed && v.language.toLowerCase().startsWith(lang));
  return (
    matching.find((v) => v.engine === 'piper')?.id ??
    matching.find((v) => v.engine === 'sherpa')?.id ??
    matching.find((v) => v.engine === 'onecore')?.id ??
    matching[0]?.id ??
    ''
  );
}

export interface OpenSpeechOptions {
  id: string;
  /** Language of the texts ("de-DE"); a Windows voice without a match picks one for it. */
  locale: string;
  voicesDir: string;
  /** Folder for the engines' temporary files. */
  workDir: string;
  /** -10 (slow) .. 10 (fast). */
  rate: number;
  pauses: SpeechPauses;
}

/** Starts the engine for a voice. Optional voices must be allowed (license) and installed. */
export async function openSpeech(options: OpenSpeechOptions): Promise<Speech> {
  const { id } = options;
  // Each rate step is about 8 % faster or slower.
  const lengthScale = Math.max(0.5, Math.min(2, 1 - options.rate * 0.08));
  if (isExternalVoice(id)) {
    if (!allowedVoiceIds().some((v) => v.id === id)) throw new Error(`Voice "${id}" is not allowed (license)`);
    const voice = installedVoices(options.voicesDir).find((v) => v.id === id);
    if (!voice) throw new Error(`Voice "${id}" is not installed`);
    const renderer =
      voice.engine === 'piper'
        ? new PiperRenderer(voice.exe, voice.model, lengthScale, voice.speaker, voice.inference)
        : new SherpaRenderer(voice.exe, voice.modelDir, voice.format, voice.sid, voice.language, lengthScale);
    return new Speech(renderer, voice.engine, id, options.workDir, options.pauses);
  }
  // Only a voice Windows listed is named to the script; anything else gets the voice for the language.
  windowsVoices ??= listWindowsVoices();
  const known = (await windowsVoices).some((v) => v.name === id);
  const renderer = await WindowsRenderer.start(known ? id : '', options.rate, options.locale);
  return new Speech(renderer, renderer.engine, (known && id) || renderer.name, options.workDir, options.pauses);
}
