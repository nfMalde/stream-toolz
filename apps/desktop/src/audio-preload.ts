/// <reference lib="dom" />
// The player in the hidden audio window (see audio.ts): Web Audio on the chosen device, one clip at a time.
// It also lists the audio outputs. Nothing is exposed to the page (it is empty).

import { ipcRenderer } from 'electron';

const context = new AudioContext({ latencyHint: 'playback' });
/** The device the context plays on ('' = the system's default). */
let sinkId = '';
let current: { id: number; source: AudioBufferSourceNode } | undefined;

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> };

/** A device that is gone (unplugged headset) falls back to the default. */
async function useDevice(deviceId: string): Promise<void> {
  if (deviceId === sinkId) return;
  const ctx = context as SinkContext;
  try {
    await ctx.setSinkId?.(deviceId);
    sinkId = deviceId;
  } catch (err) {
    console.error(`audio device ${deviceId}: ${String(err)}, using the default`);
    await ctx.setSinkId?.('').catch(() => undefined);
    sinkId = '';
  }
}

function stopCurrent(): void {
  const playing = current;
  current = undefined;
  if (!playing) return;
  try {
    playing.source.stop();
  } catch {
    // Already ended.
  }
  ipcRenderer.send('audio:ended', playing.id);
}

ipcRenderer.on('audio:play', async (_event, id: number, data: Uint8Array, volume: number, deviceId: string) => {
  try {
    await useDevice(deviceId);
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const buffer = await context.decodeAudioData(bytes);
    if (context.state !== 'running') await context.resume();
    stopCurrent();
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    source.onended = () => {
      if (current?.source !== source) return;
      current = undefined;
      ipcRenderer.send('audio:ended', id);
    };
    current = { id, source };
    source.start();
  } catch (err) {
    console.error(`clip ${id}: ${String(err)}`);
    ipcRenderer.send('audio:ended', id);
  }
});

ipcRenderer.on('audio:stop', () => stopCurrent());

ipcRenderer.on('audio:list-devices', async (_event, id: number) => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices
      // "default" and "communications" are aliases of real devices; '' stands for the default.
      .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Audio ${i + 1}` }));
    ipcRenderer.send('audio:devices', id, outputs);
  } catch {
    ipcRenderer.send('audio:devices', id, []);
  }
});

ipcRenderer.send('audio:ready');
