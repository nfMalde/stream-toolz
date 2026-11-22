// Step 1: production build. Builds the UI (Angular, production) and the main process (esbuild), then stages exactly
// what goes into the installer: release/stage/app (package.json + the bundled main process, no source maps) and
// release/stage/ui. The installer step packages only these folders.
// Usage: node scripts/release/1-build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { APP_ID, ELECTRON_VERSION, PRODUCT_NAME, ROOT, STAGE, STAGE_APP, STAGE_BUILD, STAGE_UI, VERSION, fail, heading, info, readJson, run, runIfMain } from './lib.mjs';

const DESKTOP_DIST = path.join(ROOT, 'apps', 'desktop', 'dist');
const UI_DIST = path.join(ROOT, 'apps', 'ui', 'dist', 'ui', 'browser');
/** The main process loads these from its own folder (apps/desktop/src: main.ts, licenses.ts). */
const APP_FILES = ['main.cjs', 'app.cjs', 'app.cjs.map', 'preload.cjs', 'audio-preload.cjs', 'licenses.json'];
/** Every workspace carries the same version; a mismatch means a forgotten bump. */
const WORKSPACES = ['apps/desktop', 'apps/ui', 'packages/core', 'packages/speech', 'packages/twitch', 'modules/readmychat'];

export default async function build() {
  heading(`Build (Prod) · ${PRODUCT_NAME} ${VERSION} · Electron ${ELECTRON_VERSION}`);
  for (const dir of WORKSPACES) {
    const version = readJson(path.join(ROOT, dir, 'package.json')).version;
    if (version !== VERSION) fail(`${dir}/package.json has version ${version}, the root ${VERSION}`);
  }

  for (const dir of [DESKTOP_DIST, path.join(ROOT, 'apps', 'ui', 'dist')]) fs.rmSync(dir, { recursive: true, force: true });
  await run('npm', ['run', 'build', '-w', '@stream-toolz/ui']);
  await run('npm', ['run', 'build', '-w', '@stream-toolz/desktop']);

  heading('Stage what the installer contains');
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGE_APP, 'dist'), { recursive: true });
  for (const file of APP_FILES) {
    const source = path.join(DESKTOP_DIST, file);
    if (!fs.existsSync(source)) fail(`missing build output: apps/desktop/dist/${file}`);
    fs.copyFileSync(source, path.join(STAGE_APP, 'dist', file));
  }
  // Everything the main process needs is bundled into app.cjs; the app has no node_modules.
  const desktop = readJson(path.join(ROOT, 'apps', 'desktop', 'package.json'));
  fs.writeFileSync(
    path.join(STAGE_APP, 'package.json'),
    `${JSON.stringify(
      {
        name: 'stream-toolz',
        productName: PRODUCT_NAME,
        version: VERSION,
        description: 'Stream Toolz by Maldö: local tools for Twitch streamers (ReadMyChat reads your chat aloud)',
        author: { name: 'Maldö', email: 'nfMalde@users.noreply.github.com' },
        homepage: 'https://www.twitch.tv/maldoe',
        license: desktop.license,
        private: true,
        main: 'dist/main.cjs',
      },
      null,
      2,
    )}\n`,
  );

  if (!fs.existsSync(path.join(UI_DIST, 'index.html'))) fail('missing UI build: apps/ui/dist/ui/browser/index.html');
  fs.cpSync(UI_DIST, STAGE_UI, { recursive: true });
  // Source maps ship on purpose (docs/02-desktop-app.md "Stack traces point to TypeScript"): app.cjs.map for the
  // main process, the UI's hidden maps for stack-map.ts. Nothing is minified or obfuscated.

  // The app icon (the mascot); electron-builder makes the .ico from it.
  fs.mkdirSync(STAGE_BUILD, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'apps', 'ui', 'public', 'maldoe-512.png'), path.join(STAGE_BUILD, 'icon.png'));

  const files = listFiles(STAGE);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  info(`${APP_ID} ${VERSION}: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in release/stage`);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

await runIfMain(import.meta.url, build);
