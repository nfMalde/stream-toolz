import { Component, computed, inject, input, resource, signal } from '@angular/core';
import type { OutputMode } from '@rmc/api';
import { RMC } from '../../core/rmc';
import { I18n } from '../../i18n/i18n';
import { ReaderStore } from '../../stores/reader.store';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Secret } from '../../ui/secret';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';

/**
 * Where the voice is heard: the OBS browser source (only in the stream, with its own mixer channel) or an
 * audio device. Used on the output page and in the setup assistant.
 */
@Component({
  selector: 'rmc-output-setup',
  imports: [Icon, Secret, Segmented, Slider],
  template: `
    @let s = settings.settings();
    @if (s) {
      <rmc-segmented [options]="modes()" [value]="s.output" (valueChange)="setOutput($event)" />
      <p class="faint small mode-hint">{{ t(s.output === 'obs' ? 'output.obsHint' : 'output.deviceHint') }}</p>

      @if (s.output === 'obs') {
        <div class="status row">
          @if (portInUse()) {
            <span class="chip danger"><span class="dot"></span>{{ t('output.portInUse') }}</span>
          } @else if (obsClients() > 0) {
            <span class="chip ok"><span class="dot"></span>{{ t('output.obsConnected', { count: obsClients() }) }}</span>
          } @else {
            <span class="chip warn"><span class="dot pulse"></span>{{ t('output.obsWaiting') }}</span>
          }
        </div>
        @if (!portInUse() && obsClients() === 0) {
          <p class="faint small waiting-hint">{{ t('output.obsWaitingHint') }}</p>
        }
        <div class="field">
          <span class="label">{{ t('output.obsUrl') }}</span>
          <div class="copy-row">
            <code class="url selectable"><rmc-secret [value]="url.value() ?? ''" /></code>
            <button type="button" class="btn sm" (click)="copy()"><rmc-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? t('common.copied') : t('common.copy') }}</button>
            @if (!compact()) {
              <button type="button" class="btn sm ghost" [title]="t('output.newKeyHint')" (click)="newKey()"><rmc-icon name="refresh" [size]="14" />{{ t('output.newKey') }}</button>
            }
          </div>
          <p class="faint small">{{ t('output.obsUrlHint') }}</p>
        </div>
        <ol class="steps">
          <li><div><b>{{ t('output.obs.step1') }}</b><p class="faint small">{{ t('output.obs.step1Hint') }}</p></div></li>
          <li><div><b>{{ t('output.obs.step2') }}</b><p class="faint small">{{ t('output.obs.step2Hint') }}</p></div></li>
          <li><div><b>{{ t('output.obs.step3') }}</b><p class="faint small">{{ t('output.obs.step3Hint') }}</p></div></li>
          <li><div><b>{{ t('output.obs.step4') }}</b><p class="faint small">{{ t('output.obs.step4Hint') }}</p></div></li>
        </ol>
      } @else {
        <div class="setting">
          <div class="text">
            <div class="title">{{ t('output.device') }}</div>
            <div class="hint">{{ t('output.deviceChoose') }}</div>
          </div>
          <div class="control">
            <select class="input select" [value]="s.deviceId" (change)="setDevice($event)">
              <option value="">{{ t('output.defaultDevice') }}</option>
              @for (device of devices.value() ?? []; track device.id) {
                <option [value]="device.id" [selected]="device.id === s.deviceId">{{ device.label }}</option>
              }
            </select>
            <button type="button" class="btn icon-only ghost" [title]="t('output.refresh')" (click)="devices.reload()"><rmc-icon name="refresh" [size]="16" /></button>
          </div>
        </div>
      }

      <div class="setting">
        <div class="text">
          <div class="title">{{ t('output.volume') }}</div>
          <div class="hint">{{ t('output.volumeHint') }}</div>
        </div>
        <div class="control wide">
          <rmc-slider [value]="s.volume" [min]="0" [max]="100" [step]="5" [label]="t('output.volume')" [format]="percent" (changed)="settings.update({ volume: $event })" />
        </div>
      </div>

      <div class="row test">
        <button type="button" class="btn" [disabled]="testing()" (click)="test()"><rmc-icon name="play" [size]="15" />{{ t('output.test') }}</button>
        @if (testError(); as error) {
          <span class="small danger-text">{{ error }}</span>
        }
      </div>
    }
  `,
  styles: `
    .mode-hint { margin: 8px 0 14px; max-width: 680px; }
    .status { margin-bottom: 12px; }
    .waiting-hint { margin: -4px 0 14px; max-width: 680px; }
    .copy-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .url { padding: 6px 10px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border-strong); max-width: 100%; overflow-wrap: anywhere; }
    .field { margin-bottom: 16px; }
    .steps b { display: block; }
    .steps p { margin: 2px 0 0; max-width: 640px; }
    .select { min-width: 280px; max-width: 360px; }
    .test { margin-top: 12px; }
    .danger-text { color: #ff8aa0; }
  `,
})
export class OutputSetup {
  /** Short version for the setup assistant (no new-key button). */
  readonly compact = input(false);

  protected readonly settings = inject(SettingsStore);
  private readonly reader = inject(ReaderStore);
  private readonly rmc = inject(RMC);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly modes = computed<SegmentOption<OutputMode>[]>(() => [
    { value: 'obs', label: this.t('output.obs') },
    { value: 'device', label: this.t('output.deviceMode') },
  ]);
  protected readonly obsClients = computed(() => this.reader.status()?.obsClients ?? 0);
  protected readonly portInUse = computed(() => this.reader.status()?.portInUse ?? false);
  protected readonly url = resource({ loader: () => this.rmc.obsUrl() });
  protected readonly devices = resource({ loader: () => this.rmc.audioDevices() });
  protected readonly copied = signal(false);
  protected readonly testing = signal(false);
  protected readonly testError = signal<string | null>(null);
  protected readonly percent = (value: number) => `${value} %`;

  protected setOutput(output: OutputMode): void {
    this.testError.set(null);
    void this.settings.update({ output });
  }

  protected setDevice(event: Event): void {
    void this.settings.update({ deviceId: (event.target as HTMLSelectElement).value });
  }

  protected async copy(): Promise<void> {
    await this.rmc.copyText('obsUrl');
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async newKey(): Promise<void> {
    await this.rmc.newObsKey();
    this.url.reload();
  }

  protected async test(): Promise<void> {
    this.testing.set(true);
    this.testError.set(null);
    try {
      await this.rmc.testOutput();
    } catch (err) {
      const message = (err as Error).message;
      this.testError.set(this.t(message.includes('obs-not-connected') ? 'output.testNoObs' : message.includes('no-voice') ? 'output.testNoVoice' : 'output.testFailed'));
    } finally {
      setTimeout(() => this.testing.set(false), 1500);
    }
  }
}
