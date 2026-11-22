// Where sound is heard: the shell's outputs (an audio device, the OBS browser source) that modules play on.

/** play() resolves when the clip has ended or was stopped. */
export interface AudioSink {
  /** Can play now (OBS: a browser source is connected). */
  readonly ready: boolean;
  play(wav: Buffer, volume: number): Promise<void>;
  stop(): void;
}
