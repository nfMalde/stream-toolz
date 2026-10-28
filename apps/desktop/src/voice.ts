// The voices that read, one per language (German, English): each opened when first needed for the current
// settings, and again when its voice, the speed or the pauses change, when a package is installed or removed, or
// when its engine ended. A language without a voice of its own is read by the main language's voice.

import {
  availableVoices,
  defaultVoiceId,
  languageOf,
  localeOf,
  openSpeech,
  spokenTexts,
  type ChatLanguage,
  type Settings,
  type Speech,
  type VoiceChoice,
} from '@stream-toolz/runtime';

interface Slot {
  key: string;
  speech?: Speech;
  opening?: Promise<Speech | undefined>;
}

export class VoiceHolder {
  private readonly slots = new Map<ChatLanguage, Slot>();

  constructor(
    private readonly voicesDir: string,
    private readonly workDir: string,
    private readonly settings: () => Settings,
    private readonly onChange: (voice: string | undefined) => void,
    private readonly log: (line: string) => void,
  ) {}

  /** The voice for a language; undefined if none is installed or it failed to start. */
  async get(language: ChatLanguage): Promise<Speech | undefined> {
    const settings = this.settings();
    const main = languageOf(settings.speechLanguage);
    const id = await this.resolveId(language).catch(() => '');
    // No voice for this language (e.g. no English voice installed): the main language's voice reads it.
    if (!id && language !== main) return this.get(main);
    const key = JSON.stringify([id, settings.rate, settings.commaPause, settings.sentencePause]);
    const slot = this.slots.get(language);
    if (slot?.key === key && slot.speech?.alive) return slot.speech;
    if (slot?.key === key && slot.opening) return slot.opening;
    slot?.speech?.close();
    const next: Slot = { key };
    next.opening = this.open(id, language, settings).then((speech) => {
      next.speech = speech;
      next.opening = undefined;
      return speech;
    });
    this.slots.set(language, next);
    return next.opening;
  }

  /** Settings or packages changed: the next get() opens a voice again if needed. */
  invalidate(): void {
    for (const slot of this.slots.values()) slot.key = '';
  }

  close(): void {
    for (const slot of this.slots.values()) slot.speech?.close();
    this.slots.clear();
  }

  /** The id that reads a language: the chosen one, or the automatic choice ('' = none installed). */
  async resolveId(language: ChatLanguage, settings = this.settings()): Promise<string> {
    return settings.voices[language] || defaultVoiceId(localeOf(language), await this.voices());
  }

  voices(): Promise<VoiceChoice[]> {
    return availableVoices(this.voicesDir);
  }

  /** Says the preview sentence with a voice (not necessarily a chosen one), into a WAV. */
  async preview(id: string): Promise<Buffer> {
    const settings = this.settings();
    const voice = (await this.voices()).find((v) => v.id === id);
    const locale = voice?.language ?? settings.speechLanguage;
    const speech = await openSpeech({ ...this.options(settings), id, locale });
    try {
      return await speech.synthesize(spokenTexts(locale).preview);
    } finally {
      speech.close();
    }
  }

  private async open(id: string, language: ChatLanguage, settings: Settings): Promise<Speech | undefined> {
    // Outside Windows there is no system voice to fall back to.
    if (!id && process.platform !== 'win32') {
      this.onChange(undefined);
      return undefined;
    }
    try {
      const speech = await openSpeech({ ...this.options(settings), id, locale: localeOf(language) });
      this.log(`VOICE     ${language}: ${speech.voiceId} (${speech.engine})`);
      this.onChange(speech.voiceId);
      return speech;
    } catch (err) {
      this.log(`VOICE     ${language}: could not open "${id}": ${(err as Error).message}`);
      this.onChange(undefined);
      return undefined;
    }
  }

  private options(settings: Settings) {
    return {
      voicesDir: this.voicesDir,
      workDir: this.workDir,
      rate: settings.rate,
      pauses: { comma: settings.commaPause, sentence: settings.sentencePause },
    };
  }
}
