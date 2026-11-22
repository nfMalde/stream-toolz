// The Twitch app (Client ID), the login tokens and the OBS key, encrypted with the system's own
// protection (Electron safeStorage: DPAPI on Windows, Keychain on macOS, Secret Service on Linux). The file
// can only be read by the same user account on the same computer. Without system encryption nothing is
// written: the data stays in memory until the app closes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { safeStorage } from 'electron';
import { writeFileAtomically } from './atomic-file';
import type { StoredTwitch, TwitchStore } from '@stream-toolz/twitch';

interface Secrets {
  twitch: StoredTwitch;
  /** Part of the OBS browser source's URL: other local programs and web pages cannot use the source without it. */
  obsKey: string;
}

const newKey = () => crypto.randomBytes(18).toString('base64url');

export class SecretFile {
  /** Encryption is available, so the secrets are kept between starts. */
  readonly persistent: boolean;
  private value: Secrets;

  constructor(
    private readonly file: string,
    private readonly log: (line: string) => void,
  ) {
    // Linux without a keyring: Electron would fall back to a fixed key ("basic_text"); that is no protection.
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : 'os';
    this.persistent = safeStorage.isEncryptionAvailable() && backend !== 'basic_text' && backend !== 'unknown';
    if (!this.persistent) log('SECRETS   no system encryption: Twitch data is kept in memory only');
    this.value = this.read();
    if (!this.value.obsKey) {
      this.value.obsKey = newKey();
      this.write();
    }
  }

  readonly twitchStore: TwitchStore = {
    load: () => this.value.twitch,
    save: (twitch) => {
      this.value = { ...this.value, twitch };
      this.write();
    },
  };

  get obsKey(): string {
    return this.value.obsKey;
  }

  newObsKey(): string {
    this.value = { ...this.value, obsKey: newKey() };
    this.write();
    return this.value.obsKey;
  }

  private read(): Secrets {
    const empty: Secrets = { twitch: {}, obsKey: '' };
    if (!this.persistent || !fs.existsSync(this.file)) return empty;
    try {
      const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.file))) as Partial<Secrets>;
      return { twitch: parsed.twitch && typeof parsed.twitch === 'object' ? parsed.twitch : {}, obsKey: typeof parsed.obsKey === 'string' ? parsed.obsKey : '' };
    } catch (err) {
      // Another user account or computer (copied file), or damaged: start over, the user logs in again.
      this.log(`SECRETS   could not be read (${(err as Error).message}), starting without`);
      return empty;
    }
  }

  private write(): void {
    if (!this.persistent) return;
    writeFileAtomically(this.file, safeStorage.encryptString(JSON.stringify(this.value)));
  }
}
