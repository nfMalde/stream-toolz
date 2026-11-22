// Shared parts of the release steps (docs/06-release.md): paths, version, running commands, step output.
// Plain Node, no packages: the steps run the same on a developer PC and in CI. (From GT Toolz.)

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RELEASE = path.join(ROOT, 'release');
/** What goes into the installer: the app (package.json + bundled main process) and the built UI. */
export const STAGE = path.join(RELEASE, 'stage');
export const STAGE_APP = path.join(STAGE, 'app');
export const STAGE_UI = path.join(STAGE, 'ui');
/** Icons and other build resources for electron-builder. */
export const STAGE_BUILD = path.join(STAGE, 'build');

export const PRODUCT_NAME = 'Stream Toolz';
export const APP_ID = 'com.maldoe.streamtoolz';

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The app version: the root package.json is the one place it is set. */
export const VERSION = readJson(path.join(ROOT, 'package.json')).version;
/** Installers of this version. */
export const OUT = path.join(RELEASE, VERSION);
export const ELECTRON_VERSION = readJson(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;

export const HOST = { win32: 'windows', linux: 'linux', darwin: 'mac' }[process.platform] ?? process.platform;

/** "▶ Build (Prod)". */
export function heading(text) {
  console.log(`\n▶ ${text}`);
}

export function info(text) {
  console.log(`  ${text}`);
}

export class StepError extends Error {}

let failed = false;

/**
 * Makes the process end with exit code 1. A package electron-builder uses (temp-file, through async-exit-hook) ends
 * the process with process.exit(0) once the work is done, which would turn a failed release green in CI; the
 * 'exit' listener sets the code back, and process.exit reads it after its listeners.
 */
export function markFailed() {
  failed = true;
  process.exitCode = 1;
}
process.on('exit', () => {
  if (failed) process.exitCode = 1;
});

/** Fails the step with a message meant for a person (no stack trace). */
export function fail(text) {
  throw new StepError(text);
}

/** A thing that cannot run here, e.g. the Windows installer on Linux: the orchestrator reports it as skipped. */
export class SkipStep extends Error {}

export function requireHost(host, why) {
  if (HOST !== host) throw new SkipStep(why);
}

/**
 * Runs a program and waits for it. Output goes straight to this console. npm and npx are .cmd files on Windows,
 * which Node starts only through the shell: they get one fixed command line, never user input.
 */
export function run(command, args = [], options = {}) {
  const viaShell = process.platform === 'win32' && /^(npm|npx)$/.test(command);
  const line = [command, ...args].join(' ');
  if (!options.quiet) info(`$ ${line}`);
  return new Promise((resolve, reject) => {
    const child = viaShell
      ? spawn(line, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: true })
      : spawn(command, args, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (err) => reject(new StepError(`${command}: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0 || options.allowFail) resolve({ code, stdout, stderr });
      else reject(new StepError(`${line} failed (exit code ${code})${stderr.trim() ? `\n${stderr.trim().split('\n').slice(-15).join('\n')}` : ''}`));
    });
  });
}

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** The installers of this version. */
export function installers() {
  if (!fs.existsSync(OUT)) return [];
  return fs
    .readdirSync(OUT)
    .filter((f) => /Setup.*\.exe$/.test(f))
    .map((f) => path.join(OUT, f));
}

/** SHA256SUMS.txt next to the installers, for the testers and the release page. */
export function writeChecksums() {
  const files = installers();
  const lines = files.map((f) => `${sha256(f)}  ${path.basename(f)}`);
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  for (const line of lines) info(line);
}

/** --steps=a,b --force → { steps: 'a,b', force: true } */
export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

/** Runs the step when its file is started directly (not imported by release.mjs). */
export async function runIfMain(moduleUrl, step) {
  if (!process.argv[1] || pathToFileURL(path.resolve(process.argv[1])).href !== moduleUrl) return;
  try {
    await step(parseArgs(process.argv.slice(2)));
  } catch (err) {
    if (err instanceof SkipStep) {
      console.log(`– skipped: ${err.message}`);
      return;
    }
    console.error(`\n✗ ${err instanceof StepError ? err.message : err.stack}`);
    markFailed();
  }
}
