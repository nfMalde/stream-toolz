// Optional voice packages (engines, models, voices) from packages/runtime/voice-packages.json.
// Nothing is downloaded unless the user picks a package. Downloads come from the original sources,
// are pinned and checked against SHA-256. Windows voices need no package. (From GT Toolz.)

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import manifestFile from '../../voice-packages.json' with { type: 'json' };
import type { InstallProgress } from '../app-api';
import type { PiperInference } from './piper';
import type { SherpaFormat } from './sherpa';

export type { InstallProgress } from '../app-api';

export type EngineId = 'piper' | 'sherpa';

export interface PackageFile {
  /** Only for this platform ("win32-x64", "linux-x64": Node's platform and arch); none: every platform. */
  platform?: string;
  url: string;
  sha256: string;
  /** Download size in bytes. */
  size: number;
  /** Plain file: target path below the voices directory. */
  to?: string;
  /** Archive: which folder inside it goes where; with keep, only these files of it (nothing else lands on disk). */
  archive?: 'zip' | 'tar.gz' | 'tar.bz2';
  extract?: { from: string; to: string; keep?: string[] };
}

/** One voice of a multi-speaker model (Kokoro, Piper MLS). */
export interface ModelVoice {
  id: string;
  /** Speaker id in the model. */
  sid: number;
  language: string;
  gender: string;
  /** Display name, if the id is not readable. */
  name?: string;
}

export interface VoicePackage {
  id: string;
  kind: 'engine' | 'model' | 'voice';
  engine: EngineId;
  requires?: string;
  name: string;
  license: string;
  source: string;
  language?: string;
  gender?: string;
  dataset?: string;
  files: PackageFile[];
  /** Voices a model provides (Kokoro, Piper MLS). */
  voices?: ModelVoice[];
  /** sherpa-onnx models: how the model is run (default 'kokoro'). */
  format?: SherpaFormat;
  /** Piper model settings (e.g. noiseW 0: no random phoneme lengths). */
  inference?: PiperInference;
  /** App languages for which the first-start dialog preselects this package (the user can deselect it). */
  preselectedFor?: string[];
}

export interface VoicePackageManifest {
  format: 'readmychat-voice-packages';
  version: 1;
  notes: string[];
  packages: VoicePackage[];
}

/** Relative to the working directory (developer tools); the app passes its own folder. */
export const DEFAULT_VOICES_DIR = path.join('.cache', 'tts');

/** The running platform as the manifest names it ("win32-x64", "linux-x64", "darwin-arm64"). */
export function currentPlatform(): string {
  return `${process.platform}-${process.arch}`;
}

/**
 * The manifest for a platform: files for other platforms left out, and packages without a file for it
 * (or whose engine has none) not offered at all.
 */
export function readVoicePackages(platform = currentPlatform()): VoicePackageManifest {
  const manifest = manifestFile as VoicePackageManifest;
  const packages = manifest.packages
    .map((pkg) => ({ ...pkg, files: pkg.files.filter((f) => !f.platform || f.platform === platform) }))
    .filter((pkg) => pkg.files.length > 0);
  const available = new Set(packages.map((p) => p.id));
  return { ...manifest, packages: packages.filter((p) => !p.requires || available.has(p.requires)) };
}

/** An engine's program name: with ".exe" on Windows. */
function program(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/** Where a package lives once installed (first file decides). */
function installedPath(dir: string, pkg: VoicePackage): string {
  const file = pkg.files[0]!;
  return path.join(dir, file.extract?.to ?? file.to ?? pkg.id);
}

export function isInstalled(dir: string, pkg: VoicePackage): boolean {
  return pkg.files.every((f) => fs.existsSync(path.join(dir, f.extract?.to ?? f.to ?? '')));
}

/** Download size of a package in bytes. */
export function packageSize(pkg: VoicePackage): number {
  return pkg.files.reduce((sum, f) => sum + f.size, 0);
}

/** A voice the reader can use, with what its renderer needs. */
export type ExternalVoice =
  | { engine: 'piper'; id: string; language: string; exe: string; model: string; speaker?: number; inference?: PiperInference }
  | { engine: 'sherpa'; id: string; language: string; exe: string; modelDir: string; format: SherpaFormat; sid: number };

/** All voices from installed packages ("piper:de_DE-ramona-low", "kokoro:af_heart"). */
export function installedVoices(dir: string, manifest = readVoicePackages()): ExternalVoice[] {
  const byId = new Map(manifest.packages.map((p) => [p.id, p]));
  const voices: ExternalVoice[] = [];
  for (const pkg of manifest.packages) {
    const engine = pkg.requires ? byId.get(pkg.requires) : undefined;
    if (!engine || !isInstalled(dir, pkg) || !isInstalled(dir, engine)) continue;
    if (pkg.engine === 'piper' && pkg.kind === 'model') {
      const onnx = pkg.files.find((f) => f.to?.endsWith('.onnx'));
      if (!onnx?.to) continue;
      for (const v of pkg.voices ?? []) {
        voices.push({ engine: 'piper', id: v.id, language: v.language, exe: path.join(installedPath(dir, engine), program('piper')), model: path.join(dir, onnx.to), speaker: v.sid, inference: pkg.inference });
      }
    }
    if (pkg.engine === 'piper' && pkg.kind === 'voice') {
      const onnx = pkg.files.find((f) => f.to?.endsWith('.onnx'));
      if (!onnx?.to) continue;
      voices.push({ engine: 'piper', id: pkg.id, language: pkg.language ?? '', exe: path.join(installedPath(dir, engine), program('piper')), model: path.join(dir, onnx.to), inference: pkg.inference });
    }
    if (pkg.engine === 'sherpa' && pkg.kind === 'model') {
      for (const v of pkg.voices ?? []) {
        voices.push({ engine: 'sherpa', id: v.id, language: v.language, exe: path.join(installedPath(dir, engine), 'bin', program('sherpa-onnx-offline-tts')), modelDir: installedPath(dir, pkg), format: pkg.format ?? 'kokoro', sid: v.sid });
      }
    }
  }
  return voices;
}

export interface AllowedVoice {
  id: string;
  language: string;
  gender?: string;
  packageId: string;
  name?: string;
}

/** Every voice id the manifest allows, installed or not. */
export function allowedVoiceIds(manifest = readVoicePackages()): AllowedVoice[] {
  return manifest.packages.flatMap((pkg) => {
    if (pkg.kind === 'voice') return [{ id: pkg.id, language: pkg.language ?? '', gender: pkg.gender, packageId: pkg.id }];
    if (pkg.kind === 'model') return (pkg.voices ?? []).map((v) => ({ id: v.id, language: v.language, gender: v.gender, packageId: pkg.id, name: v.name }));
    return [];
  });
}

/** Packages the setup assistant preselects for a language ("de", "en"); the user decides. */
export function preselectedPackages(language: string, manifest = readVoicePackages()): VoicePackage[] {
  const lang = language.split('-')[0]!;
  return manifest.packages.filter((p) => p.preselectedFor?.includes(lang));
}

/** The packages to install for a selection: dependencies first, already installed ones left out. */
export function installOrder(ids: string[], dir: string, manifest = readVoicePackages()): VoicePackage[] {
  const byId = new Map(manifest.packages.map((p) => [p.id, p]));
  const order: VoicePackage[] = [];
  const add = (id: string) => {
    const pkg = byId.get(id);
    if (!pkg) throw new Error(`Unknown or not allowed package "${id}"`);
    if (pkg.requires) add(pkg.requires);
    if (!order.includes(pkg)) order.push(pkg);
  };
  ids.forEach(add);
  return order.filter((pkg) => !isInstalled(dir, pkg));
}

// --- Install / remove ---


export interface InstallOptions {
  log?: (line: string) => void;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Windows' own bsdtar (zip, tar.gz, tar.bz2), never one that happens to be first on the PATH; elsewhere the system's tar. */
function tarExe(): string {
  return process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
}

function extract(archive: string, target: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(tarExe(), ['-xf', archive, '-C', target], { windowsHide: true, signal }, (err) => (err ? reject(err) : resolve()));
  });
}

async function download(file: PackageFile, target: string, options: InstallOptions, onBytes: (bytes: number) => void): Promise<void> {
  if (fs.existsSync(target) && sha256(target) === file.sha256) {
    onBytes(file.size);
    return;
  }
  options.log?.(`download  ${file.url}`);
  const response = await fetch(file.url, { signal: options.signal });
  if (!response.ok || !response.body) throw new Error(`${file.url}: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  const out = fs.createWriteStream(partial);
  const hash = crypto.createHash('sha256');
  try {
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise<void>((resolve) => out.once('drain', () => resolve()));
      onBytes(chunk.length);
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(partial, { force: true });
    throw err;
  }
  const actual = hash.digest('hex');
  if (actual !== file.sha256) {
    fs.rmSync(partial, { force: true });
    throw new Error(`${path.basename(target)}: SHA-256 mismatch (expected ${file.sha256}, got ${actual}), file deleted`);
  }
  fs.renameSync(partial, target);
  options.log?.(`verified  ${path.basename(target)}`);
}

/** Installs packages (and what they require). Already installed packages are skipped. */
export async function installPackages(ids: string[], dir: string, options: InstallOptions = {}, manifest = readVoicePackages()): Promise<void> {
  const order = installOrder(ids, dir, manifest);
  const totalBytes = order.reduce((sum, pkg) => sum + packageSize(pkg), 0);
  let receivedBytes = 0;
  const report = (packageId: string, phase: InstallProgress['phase']) => options.onProgress?.({ packageId, phase, receivedBytes, totalBytes });

  for (const pkg of order) {
    options.log?.(`install   ${pkg.id}: ${pkg.name} (${pkg.license})`);
    for (const file of pkg.files) {
      // Progress may differ a little from the manifest size; it never runs past the file's share.
      let fileBytes = 0;
      const onBytes = (bytes: number) => {
        const counted = Math.min(bytes, file.size - fileBytes);
        fileBytes += counted;
        receivedBytes += counted;
        report(pkg.id, 'download');
      };
      if (file.to) {
        await download(file, path.join(dir, file.to), options, onBytes);
        receivedBytes += file.size - fileBytes;
        continue;
      }
      const archive = path.join(dir, 'download', path.basename(new URL(file.url).pathname));
      await download(file, archive, options, onBytes);
      receivedBytes += file.size - fileBytes;
      report(pkg.id, 'extract');
      const unpacked = path.join(dir, 'download', `unpacked-${pkg.id.replace(/[^a-z0-9]/gi, '_')}`);
      fs.rmSync(unpacked, { recursive: true, force: true });
      fs.mkdirSync(unpacked, { recursive: true });
      await extract(archive, unpacked, options.signal);
      const target = path.join(dir, file.extract!.to);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const keep = file.extract!.keep;
      if (keep) {
        // Only the named files; scripts and other extras of the archive stay out.
        fs.mkdirSync(target);
        for (const name of keep) {
          if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new Error(`${pkg.id}: invalid file name "${name}" in the catalogue`);
          fs.renameSync(path.join(unpacked, file.extract!.from, name), path.join(target, name));
        }
      } else {
        fs.renameSync(path.join(unpacked, file.extract!.from), target);
      }
      fs.rmSync(unpacked, { recursive: true, force: true });
      fs.rmSync(archive);
    }
    options.log?.(`installed ${pkg.id}`);
    report(pkg.id, 'installed');
  }
}

/** Removes packages; engines are only removed if nothing installed needs them. */
export function removePackages(ids: string[], dir: string, log: (line: string) => void = () => {}, manifest = readVoicePackages()): void {
  for (const id of ids) {
    const pkg = manifest.packages.find((p) => p.id === id);
    if (!pkg) throw new Error(`Unknown package "${id}"`);
    const dependents = manifest.packages.filter((p) => p.requires === id && isInstalled(dir, p) && !ids.includes(p.id));
    if (dependents.length) {
      log(`keep      ${id}: still needed by ${dependents.map((d) => d.id).join(', ')}`);
      continue;
    }
    for (const file of pkg.files) fs.rmSync(path.join(dir, file.extract?.to ?? file.to ?? ''), { recursive: true, force: true });
    log(`removed   ${id}`);
  }
}
