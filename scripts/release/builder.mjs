// The electron-builder configuration for the Windows installer (docs/06-release.md) and the call that builds it.
// electron-builder 26.17.0, checked by the project's rules (docs/03-security.md). (From GT Toolz.)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_ID, ELECTRON_VERSION, OUT, PRODUCT_NAME, ROOT, STAGE_APP, STAGE_BUILD, STAGE_UI, fail, info, writeChecksums } from './lib.mjs';

const require = createRequire(import.meta.url);

/**
 * How the installer and the app are signed (docs/06-release.md "Code signing"):
 * - a certificate file: CSC_LINK (path or base64 .pfx) and CSC_KEY_PASSWORD, read by electron-builder itself;
 * - Azure Trusted Signing: STZ_SIGN_AZURE_ENDPOINT, STZ_SIGN_AZURE_ACCOUNT, STZ_SIGN_AZURE_PROFILE, with the Azure
 *   login in AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (read by electron-builder's Azure sign step).
 * Returns what is set, or undefined: then the installer is only built with --unsigned (a test build).
 */
export function signing() {
  const { CSC_LINK, STZ_SIGN_AZURE_ENDPOINT, STZ_SIGN_AZURE_ACCOUNT, STZ_SIGN_AZURE_PROFILE } = process.env;
  if (CSC_LINK) return { kind: 'certificate file' };
  if (STZ_SIGN_AZURE_ENDPOINT && STZ_SIGN_AZURE_ACCOUNT && STZ_SIGN_AZURE_PROFILE) {
    return {
      kind: 'Azure Trusted Signing',
      azureSignOptions: { endpoint: STZ_SIGN_AZURE_ENDPOINT, codeSigningAccountName: STZ_SIGN_AZURE_ACCOUNT, certificateProfileName: STZ_SIGN_AZURE_PROFILE },
    };
  }
  return undefined;
}

export function builderConfig(sign) {
  return {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    copyright: `Copyright © ${new Date().getFullYear()} Maldö`,
    directories: { app: STAGE_APP, output: OUT, buildResources: STAGE_BUILD },
    electronVersion: ELECTRON_VERSION,
    // Electron's zips are checked against checksums.json from the signed npm package, not against a list
    // downloaded next to them.
    electronDownload: { checksums: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'checksums.json'), 'utf8')) },
    asar: true,
    extraResources: [{ from: STAGE_UI, to: 'ui' }],
    // No native modules: nothing to rebuild, no node-gyp, no downloads of Node headers.
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    includePdb: false,
    // docs/03-security.md: no "Electron as Node", no NODE_OPTIONS or --inspect, only the checked app.asar.
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
    },
    // The app never looks for updates (no connection but Twitch and the voice downloads).
    publish: null,

    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      signAndEditExecutable: true,
      // Without a signing setup electron-builder leaves the files unsigned; the step itself refuses that unless
      // --unsigned was given (buildInstaller).
      forceCodeSigning: !!sign,
      ...(sign?.azureSignOptions ? { azureSignOptions: sign.azureSignOptions } : {}),
    },
    nsis: {
      // Per user, no admin rights: %LOCALAPPDATA%\Programs, Start menu and desktop shortcut.
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: PRODUCT_NAME,
      uninstallDisplayName: PRODUCT_NAME,
      // The login, the settings and the voices stay after an uninstall (%APPDATA%\Stream Toolz).
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
      artifactName: 'Stream-Toolz-Setup-${version}-${arch}.${ext}',
    },
  };
}

/** Builds the Windows installer into release/<version>. unsigned: allow a build without a signing setup. */
export async function buildInstaller({ unsigned = false } = {}) {
  if (!fs.existsSync(path.join(STAGE_APP, 'package.json'))) fail('nothing staged: run step 1 (Build) first');
  const sign = signing();
  if (!sign && !unsigned) fail('no code signing set up (CSC_LINK or STZ_SIGN_AZURE_*); a test build needs --unsigned (docs/06-release.md)');
  info(sign ? `signing: ${sign.kind}` : 'signing: NONE (test build; SmartScreen will warn)');
  const { build, Platform } = require('electron-builder');
  const config = builderConfig(sign);
  const artifacts = await build({ targets: Platform.WINDOWS.createTarget(), config, projectDir: ROOT, publish: 'never' });
  const installers = artifacts.filter((f) => /\.exe$/.test(f));
  if (!installers.length) fail(`electron-builder made no installer (${artifacts.join(', ') || 'nothing'})`);
  // Only the installer stays in release/<version>; the unpacked app folder and blockmaps go.
  for (const entry of fs.readdirSync(OUT)) {
    const file = path.join(OUT, entry);
    if (/-unpacked$|\.blockmap$|^builder-(debug|effective-config)\.yml$|^\.icon-/.test(entry)) fs.rmSync(file, { recursive: true, force: true });
  }
  info('Installer:');
  writeChecksums();
  return installers;
}
