import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CHANNEL_EVENT_KINDS, defaultAlertText, type AlertEventSettings, type ChannelEventKind } from '@stz/api';
import { STZ } from '@shell/core/stz';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { OutputStore } from '@shell/stores/output.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon, type IconName } from '@shell/ui/icon';
import { Secret } from '@shell/ui/secret';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { AlertsStore } from '../../stores/alerts.store';
import { AlertsSettingsStore } from '../../stores/settings.store';

const KIND_ICONS: Record<ChannelEventKind, IconName> = { follow: 'heart', sub: 'sparkle', prime: 'sparkle', resub: 'sparkle', gift: 'gift', communityGift: 'gift', raid: 'live' };

/** Alerts: the overlay's address and OBS steps, one card per event (text, sound, duration, volume, a test), limits, sounds. */
@Component({
  selector: 'stz-alerts-alerts',
  imports: [Icon, RouterLink, Secret, Slider, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('alerts.alerts.eyebrow') }}</div>
          <h1>{{ t('alerts.alerts.title') }}</h1>
          <p class="muted intro">{{ t('alerts.alerts.intro') }}</p>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" [disabled]="!alerts.queued() && !alerts.current()" (click)="alerts.clear()"><stz-icon name="trash" [size]="16" />{{ t('alerts.alerts.clear') }}</button>
        </div>
      </div>

      @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
        <div class="banner warn">
          <stz-icon name="plug" /><span class="spacer">{{ t('alerts.alerts.notConnected') }}</span>
          <button type="button" class="btn sm" (click)="app.openGuide()">{{ t('alerts.alerts.openGuide') }}</button>
        </div>
      } @else if (chat() === 'needs-login') {
        <div class="banner warn">
          <stz-icon name="key" /><span class="spacer">{{ t('alerts.alerts.chatNeedsLogin') }}</span>
          <button type="button" class="btn sm" (click)="relogin()">{{ t('alerts.alerts.relogin') }}</button>
        </div>
      } @else if (twitch.stage() === 'error') {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('alerts.alerts.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('alerts.alerts.toTwitch') }}</a></div>
      }
      @if (s?.events?.follow?.enabled && follows() === 'needs-login') {
        <div class="banner warn">
          <stz-icon name="heart" /><span class="spacer">{{ t('alerts.alerts.followsNeedsLogin') }}</span>
          <button type="button" class="btn sm" (click)="relogin()">{{ t('alerts.alerts.relogin') }}</button>
        </div>
      } @else if (s?.events?.follow?.enabled && follows() === 'unavailable') {
        <div class="banner info"><stz-icon name="heart" /><span class="spacer">{{ t('alerts.alerts.followsUnavailable') }}</span></div>
      }
      @if (output.portInUse()) {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('alerts.alerts.portInUse') }}</span><a class="btn sm" routerLink="/settings">{{ t('alerts.alerts.toSettings') }}</a></div>
      }

      @if (s) {
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="broadcast" /></div>
              <h2>{{ t('alerts.alerts.output') }}</h2>
              <span class="spacer"></span>
              @if (alerts.pages() > 0) {
                <span class="chip ok"><span class="dot"></span>{{ t('alerts.alerts.connected', { count: alerts.pages() }) }}</span>
              } @else {
                <span class="chip warn"><span class="dot pulse"></span>{{ t('alerts.alerts.waiting') }}</span>
              }
            </div>
            @if (!alerts.pages() && !output.portInUse()) {
              <p class="faint small waiting-hint">{{ t('alerts.alerts.waitingHint') }}</p>
            }
            <div class="field">
              <span class="label">{{ t('alerts.alerts.url') }}</span>
              <div class="copy-row">
                <code class="url selectable"><stz-secret [value]="alerts.url()" /></code>
                <button type="button" class="btn sm" (click)="copy()"><stz-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? t('common.copied') : t('common.copy') }}</button>
                <button type="button" class="btn sm ghost" (click)="alerts.openUrl()"><stz-icon name="external" [size]="14" />{{ t('alerts.alerts.open') }}</button>
              </div>
              <p class="faint small">{{ t('alerts.alerts.urlHint') }}</p>
            </div>
            <ol class="steps">
              <li><div><b>{{ t('alerts.alerts.step1') }}</b><p class="faint small">{{ t('alerts.alerts.step1Hint') }}</p></div></li>
              <li><div><b>{{ t('alerts.alerts.step2') }}</b><p class="faint small">{{ t('alerts.alerts.step2Hint') }}</p></div></li>
              <li><div><b>{{ t('alerts.alerts.step3') }}</b><p class="faint small">{{ t('alerts.alerts.step3Hint') }}</p></div></li>
            </ol>
            <div class="now" [class.active]="!!alerts.current()">
              <span class="label">{{ t('alerts.alerts.queue') }}</span>
              @if (alerts.current(); as current) {
                <p class="selectable"><span class="lang">{{ t(kindKey(current.kind)) }}</span> {{ current.title }}</p>
              } @else {
                <p class="faint">{{ t('alerts.alerts.nothing') }}</p>
              }
              @if (alerts.queued()) {
                <span class="chip live">{{ t('alerts.alerts.queued', { count: alerts.queued() }) }}</span>
              }
            </div>
          </section>

          @for (kind of kinds; track kind) {
            @let e = s.events[kind];
            <section class="card span-6" [class.off]="!e.enabled">
              <div class="card-header">
                <div class="card-icon accent"><stz-icon [name]="icons[kind]" /></div>
                <h2 class="spacer">{{ t(kindKey(kind)) }}</h2>
                <stz-toggle [checked]="e.enabled" [label]="t(kindKey(kind))" (checkedChange)="setEvent(kind, { enabled: $event })" />
              </div>
              <div class="field">
                <span class="label">{{ t('alerts.alerts.text') }}</span>
                <input class="input" maxlength="160" [value]="e.text" [placeholder]="placeholder(kind)" [title]="e.text || placeholder(kind)" [attr.aria-label]="t('alerts.alerts.text')"
                       (change)="saveText(kind, $event)" (keydown.enter)="saveText(kind, $event)" />
              </div>
              <div class="field">
                <span class="label">{{ t('alerts.alerts.sound') }}</span>
                <div class="row">
                  <select class="input select spacer" [value]="e.sound" [attr.aria-label]="t('alerts.alerts.sound')" (change)="setEvent(kind, { sound: value($event) })">
                    <option value="">{{ t('alerts.alerts.noSound') }}</option>
                    @for (sound of alerts.sounds(); track sound) {
                      <option [value]="sound" [selected]="sound === e.sound">{{ sound }}</option>
                    }
                    @if (e.sound && !alerts.sounds().includes(e.sound)) {
                      <option [value]="e.sound" selected>{{ e.sound }}</option>
                    }
                  </select>
                  <button type="button" class="btn sm icon-only" [disabled]="!e.sound" [title]="t('alerts.alerts.previewHint')" [attr.aria-label]="t('alerts.alerts.preview')" (click)="alerts.preview(e.sound)"><stz-icon name="headphones" [size]="15" /></button>
                  <button type="button" class="btn sm ghost" [title]="t('alerts.alerts.addSoundsHint')" (click)="alerts.pickSounds()"><stz-icon name="folder" [size]="14" />{{ t('alerts.alerts.addSounds') }}</button>
                </div>
              </div>
              <div class="setting">
                <div class="text"><div class="title">{{ t('alerts.alerts.duration') }}</div></div>
                <div class="control wide"><stz-slider [value]="e.durationSeconds" [min]="2" [max]="60" [step]="1" [format]="seconds" [label]="t('alerts.alerts.duration')" (changed)="setEvent(kind, { durationSeconds: $event })" /></div>
              </div>
              <div class="setting">
                <div class="text"><div class="title">{{ t('alerts.alerts.volume') }}</div></div>
                <div class="control wide"><stz-slider [value]="e.volume" [min]="0" [max]="100" [step]="5" [format]="percent" [label]="t('alerts.alerts.volume')" (changed)="setEvent(kind, { volume: $event })" /></div>
              </div>
              <div class="row test">
                <button type="button" class="btn" [title]="t('alerts.alerts.testHint')" (click)="alerts.test(kind)"><stz-icon name="play" [size]="15" />{{ t('alerts.alerts.test') }}</button>
              </div>
            </section>
          }

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="filter" /></div>
              <h2>{{ t('alerts.alerts.limits') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('alerts.alerts.followLimit') }}</div>
                <div class="hint">{{ t('alerts.alerts.followLimitHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.followLimitPerMinute" [min]="0" [max]="60" [step]="1" [format]="limit" [label]="t('alerts.alerts.followLimit')" (changed)="settings.update({ followLimitPerMinute: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('alerts.alerts.minRaidViewers') }}</div>
                <div class="hint">{{ t('alerts.alerts.minRaidViewersHint') }}</div>
              </div>
              <div class="control">
                <input class="input number" type="number" min="0" max="10000" step="1" [value]="s.minRaidViewers" [attr.aria-label]="t('alerts.alerts.minRaidViewers')" (change)="saveRaidMinimum($event)" />
                <span class="faint small">{{ t('alerts.alerts.viewers') }}</span>
              </div>
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="headphones" /></div>
              <h2 class="spacer">{{ t('alerts.alerts.device') }}</h2>
              <stz-toggle [checked]="s.deviceOutput" [label]="t('alerts.alerts.device')" (checkedChange)="settings.update({ deviceOutput: $event })" />
            </div>
            <p class="faint small device-hint">{{ t('alerts.alerts.deviceHint') }}</p>
            <div class="setting">
              <div class="text"><div class="title">{{ t('alerts.alerts.deviceChoose') }}</div></div>
              <div class="control">
                <select class="input select" [value]="s.deviceId" [disabled]="!s.deviceOutput" [attr.aria-label]="t('alerts.alerts.deviceChoose')" (change)="settings.update({ deviceId: value($event) })">
                  <option value="">{{ t('alerts.alerts.defaultDevice') }}</option>
                  @for (device of devices.value() ?? []; track device.id) {
                    <option [value]="device.id" [selected]="device.id === s.deviceId">{{ device.label }}</option>
                  }
                </select>
                <button type="button" class="btn icon-only ghost" [title]="t('alerts.alerts.refresh')" (click)="devices.reload()"><stz-icon name="refresh" [size]="16" /></button>
              </div>
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="volume" /></div>
              <div class="spacer">
                <h2>{{ t('alerts.alerts.sounds') }}</h2>
                <p class="faint small">{{ t('alerts.alerts.soundsHint') }}</p>
              </div>
              <button type="button" class="btn sm" (click)="alerts.pickSounds()"><stz-icon name="folder" [size]="14" />{{ t('alerts.alerts.addSounds') }}</button>
            </div>
            <div class="sounds">
              @for (sound of alerts.sounds(); track sound) {
                <div class="sound">
                  <span class="name selectable">{{ sound }}</span>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('alerts.alerts.preview')" (click)="alerts.preview(sound)"><stz-icon name="play" [size]="14" /></button>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('alerts.alerts.remove')" (click)="alerts.removeSound(sound)"><stz-icon name="trash" [size]="14" /></button>
                </div>
              } @empty {
                <p class="faint">{{ t('alerts.alerts.soundsEmpty') }}</p>
              }
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="info" /></div>
              <h2>{{ t('alerts.alerts.placeholders') }}</h2>
            </div>
            <ul class="placeholders">
              @for (item of placeholders; track item) {
                <li><code>{{ '{' + item + '}' }}</code><span class="muted">{{ t(placeholderKey(item)) }}</span></li>
              }
            </ul>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .intro { max-width: 760px; margin-top: 6px; }
    .waiting-hint { margin: -4px 0 14px; max-width: 680px; }
    .copy-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .url { padding: 6px 10px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border-strong); max-width: 100%; overflow-wrap: anywhere; }
    .field { margin-bottom: 14px; }
    .steps b { display: block; }
    .steps p { margin: 2px 0 0; max-width: 640px; }
    .now { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .now.active { border-color: rgba(var(--accent-rgb), .45); }
    .now p { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .lang { margin-right: 4px; padding: 0 5px; border-radius: 5px; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: var(--accent); border: 1px solid rgba(var(--accent-rgb), .45); vertical-align: 1px; }
    .card.off .field, .card.off .setting, .card.off .test { opacity: .5; }
    .select { min-width: 160px; max-width: 360px; }
    .number { width: 110px; }
    .test { margin-top: 12px; }
    .device-hint { margin: -6px 0 10px; }
    .sounds { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
    .sound { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border); }
    .sound .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .placeholders { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; }
    .placeholders li { display: contents; }
    .placeholders code { padding: 1px 6px; border-radius: 6px; background: var(--bg-elevated); border: 1px solid var(--border); justify-self: start; }
  `,
})
export class AlertsPage {
  protected readonly settings = inject(AlertsSettingsStore);
  protected readonly alerts = inject(AlertsStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly app = inject(SettingsStore);
  protected readonly output = inject(OutputStore);
  private readonly stz = inject(STZ);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly kinds = CHANNEL_EVENT_KINDS;
  protected readonly icons = KIND_ICONS;
  protected readonly placeholders = ['name', 'count', 'months', 'recipient', 'tier'];
  protected readonly chat = computed(() => this.twitch.status()?.features?.chat);
  protected readonly follows = computed(() => this.twitch.status()?.features?.follows);
  protected readonly devices = resource({ loader: () => this.stz.audioDevices() });
  protected readonly copied = signal(false);

  protected readonly seconds = (value: number) => this.t('alerts.alerts.seconds', { n: value });
  protected readonly percent = (value: number) => `${value} %`;
  protected readonly limit = (value: number) => (value === 0 ? this.t('alerts.alerts.noLimit') : String(value));

  /** The default words in the app language; with a count, the form for several. */
  protected placeholder(kind: ChannelEventKind): string {
    return defaultAlertText(kind, this.i18n.lang(), 2);
  }

  protected kindKey(kind: ChannelEventKind): TextKey {
    return `alerts.kind.${kind}` as TextKey;
  }

  protected placeholderKey(name: string): TextKey {
    return `alerts.alerts.placeholder.${name}` as TextKey;
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected setEvent(kind: ChannelEventKind, change: Partial<AlertEventSettings>): void {
    const events = this.settings.settings()?.events;
    if (events) void this.settings.update({ events: { ...events, [kind]: { ...events[kind], ...change } } });
  }

  protected saveText(kind: ChannelEventKind, event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (this.settings.settings()?.events[kind].text !== text) this.setEvent(kind, { text });
  }

  protected saveRaidMinimum(event: Event): void {
    const minRaidViewers = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(minRaidViewers)) void this.settings.update({ minRaidViewers });
  }

  protected async copy(): Promise<void> {
    await this.alerts.copyUrl();
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /** A new login asks for the missing permission too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
