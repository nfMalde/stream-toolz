import { Component, computed, effect, inject, resource, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DEFAULT_REWARD, type ChannelpointsOutputMode as OutputMode, type PickSoundsResult, type RedemptionLogEntry, type RewardsResult } from '@stz/api';
import { clock } from '@shell/core/format';
import { STZ } from '@shell/core/stz';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { OutputStore } from '@shell/stores/output.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { ChannelpointsSettingsStore } from '../../stores/settings.store';
import { ChannelpointsStatusStore } from '../../stores/status.store';
import { RewardRow, type RewardRowModel } from './reward-row';

/**
 * The channel's rewards with a sound each, the sounds folder, where the sounds play, and the last redemptions.
 * The rewards come from Twitch on a click (not on every visit): the module reads nothing but that list and the
 * redemption events.
 */
@Component({
  selector: 'stz-channelpoints-rewards',
  imports: [Icon, RouterLink, Segmented, Slider, RewardRow],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('channelpoints.rewards.eyebrow') }}</div>
          <h1>{{ t('channelpoints.rewards.title') }}</h1>
        </div>
        <div class="actions">
          @if (status.queued() > 0) {
            <span class="chip live"><span class="dot pulse"></span>{{ t('channelpoints.rewards.queued', { count: status.queued() }) }}</span>
          }
          <button type="button" class="btn primary" [disabled]="rewards.isLoading()" (click)="load()">
            <stz-icon [name]="rewards.isLoading() ? 'clock' : 'refresh'" [size]="16" />{{ t(loaded() ? 'channelpoints.rewards.reload' : 'channelpoints.rewards.load') }}
          </button>
        </div>
      </div>

      @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
        <div class="banner warn">
          <stz-icon name="plug" /><span class="spacer">{{ t('channelpoints.rewards.notConnected') }}</span>
          <button type="button" class="btn sm" (click)="app.openGuide()">{{ t('channelpoints.rewards.openGuide') }}</button>
        </div>
      } @else if (redemptions() === 'needs-login' || loadError() === 'needs-login') {
        <div class="banner warn">
          <stz-icon name="key" /><span class="spacer">{{ t('channelpoints.rewards.needsLogin') }}</span>
          <button type="button" class="btn sm" (click)="relogin()">{{ t('channelpoints.rewards.relogin') }}</button>
        </div>
      } @else if (redemptions() === 'unavailable' || loadError() === 'unavailable') {
        <div class="banner info"><stz-icon name="info" /><span class="spacer">{{ t('channelpoints.rewards.unavailable') }}</span><a class="btn sm" routerLink="/twitch">{{ t('channelpoints.rewards.toTwitch') }}</a></div>
      } @else if (twitch.stage() === 'error') {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('channelpoints.rewards.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('channelpoints.rewards.toTwitch') }}</a></div>
      } @else if (loadError(); as error) {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t(error === 'not-connected' ? 'channelpoints.rewards.notConnectedYet' : 'channelpoints.rewards.loadFailed', { message: error }) }}</span></div>
      }
      @if (s?.output === 'obs' && output.portInUse()) {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('channelpoints.output.portInUse') }}</span><a class="btn sm" routerLink="/settings">{{ t('channelpoints.output.toSettings') }}</a></div>
      } @else if (s?.output === 'obs' && !output.obsClients()) {
        <div class="banner info"><stz-icon name="broadcast" /><span class="spacer">{{ t('channelpoints.output.obsWaiting') }}</span><a class="btn sm" routerLink="/readmychat/output">{{ t('channelpoints.output.toReadMyChat') }}</a></div>
      }

      @if (s) {
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="gift" /></div>
              <div>
                <h2>{{ t('channelpoints.rewards.list') }}</h2>
                <p class="faint small">{{ t('channelpoints.rewards.intro') }}</p>
              </div>
              <span class="spacer"></span>
              <button type="button" class="btn sm" [disabled]="picking()" (click)="addSounds()"><stz-icon name="download" [size]="14" />{{ t('channelpoints.sounds.add') }}</button>
              <button type="button" class="btn sm ghost" (click)="status.openFolder()"><stz-icon name="folder" [size]="14" />{{ t('channelpoints.sounds.folder') }}</button>
            </div>
            @if (rejected(); as list) {
              <div class="banner warn compact">
                <stz-icon name="alert" />
                <span class="spacer">{{ t('channelpoints.sounds.rejected', { count: list.length }) }}
                  @for (item of list; track $index) { <span class="selectable">{{ item.name }} ({{ t(reasonKey(item.reason)) }})</span>@if (!$last) {, } }
                </span>
                <button type="button" class="btn sm ghost icon-only" (click)="rejected.set(null)"><stz-icon name="x" [size]="14" /></button>
              </div>
            }
            <div class="rows">
              @for (row of rows(); track row.id) {
                <stz-reward-row [reward]="row" [sounds]="status.sounds()" (changed)="settings.updateReward(row.id, row.config, $event)"
                                (remove)="settings.removeReward(row.id)" (test)="status.test(row.id)" (preview)="preview($event)" />
              } @empty {
                <p class="faint">{{ t(loaded() ? 'channelpoints.rewards.none' : 'channelpoints.rewards.empty') }}</p>
              }
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="volume" /></div>
              <h2>{{ t('channelpoints.output.title') }}</h2>
            </div>
            <stz-segmented [options]="modes()" [value]="s.output" (valueChange)="setOutput($event)" />
            <p class="faint small mode-hint">{{ t(s.output === 'obs' ? 'channelpoints.output.obsHint' : 'channelpoints.output.deviceHint') }}</p>
            @if (s.output === 'obs') {
              <div class="status row">
                @if (output.portInUse()) {
                  <span class="chip danger"><span class="dot"></span>{{ t('channelpoints.output.portInUse') }}</span>
                } @else if (output.obsClients() > 0) {
                  <span class="chip ok"><span class="dot"></span>{{ t('channelpoints.output.obsConnected', { count: output.obsClients() }) }}</span>
                } @else {
                  <span class="chip warn"><span class="dot pulse"></span>{{ t('channelpoints.output.obsWaiting') }}</span>
                }
                <a class="btn sm ghost" routerLink="/readmychat/output"><stz-icon name="external" [size]="14" />{{ t('channelpoints.output.toReadMyChat') }}</a>
              </div>
              <p class="faint small">{{ t('channelpoints.sounds.wavHint') }}</p>
            } @else {
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('channelpoints.output.device') }}</div>
                  <div class="hint">{{ t('channelpoints.output.deviceChoose') }}</div>
                </div>
                <div class="control">
                  <select class="input select" [value]="s.deviceId" (change)="setDevice($event)">
                    <option value="">{{ t('channelpoints.output.defaultDevice') }}</option>
                    @for (device of devices.value() ?? []; track device.id) {
                      <option [value]="device.id" [selected]="device.id === s.deviceId">{{ device.label }}</option>
                    }
                  </select>
                  <button type="button" class="btn icon-only ghost" [title]="t('channelpoints.output.refresh')" (click)="devices.reload()"><stz-icon name="refresh" [size]="16" /></button>
                </div>
              </div>
            }
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('channelpoints.output.volume') }}</div>
                <div class="hint">{{ t('channelpoints.output.volumeHint') }}</div>
              </div>
              <div class="control wide">
                <stz-slider [value]="s.volume" [min]="0" [max]="100" [step]="5" [label]="t('channelpoints.output.volume')" [format]="percent" (changed)="settings.update({ volume: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('channelpoints.output.maxQueue') }}</div>
                <div class="hint">{{ t('channelpoints.output.maxQueueHint') }}</div>
              </div>
              <div class="control wide">
                <stz-slider [value]="s.maxQueue" [min]="1" [max]="20" [step]="1" [label]="t('channelpoints.output.maxQueue')" (changed)="settings.update({ maxQueue: $event })" />
              </div>
            </div>
          </section>

          <section class="card span-6">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="headphones" /></div>
              <div>
                <h2>{{ t('channelpoints.sounds.title') }}</h2>
                <p class="faint small">{{ t('channelpoints.sounds.hint') }}</p>
              </div>
            </div>
            <div class="sounds">
              @for (name of status.sounds(); track name) {
                <div class="sound">
                  <span class="name selectable">{{ name }}</span>
                  <span class="faint small">{{ usedBy(name) }}</span>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('channelpoints.rewards.preview')" (click)="preview(name)"><stz-icon name="headphones" [size]="14" /></button>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('channelpoints.sounds.remove')" (click)="status.removeSound(name)"><stz-icon name="trash" [size]="14" /></button>
                </div>
              } @empty {
                <p class="faint">{{ t('channelpoints.sounds.none') }}</p>
              }
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="clock" /></div>
              <h2>{{ t('channelpoints.log.title') }}</h2>
              <span class="spacer"></span>
              <span class="faint small">{{ t('channelpoints.log.hint') }}</span>
            </div>
            <div class="log">
              @for (entry of status.log(); track entry.id) {
                <div class="entry" [class.skipped]="entry.outcome !== 'played' && entry.outcome !== 'test'">
                  <span class="time faint small num">{{ time(entry.at) }}</span>
                  <div class="body">
                    <b>{{ entry.name }} <span class="reward-title">{{ entry.rewardTitle }}</span></b>
                    @if (entry.input) { <span class="text selectable">{{ entry.input }}</span> }
                  </div>
                  <span class="chip" [class.ok]="entry.outcome === 'played'" [class.live]="entry.outcome === 'test'">{{ t(outcomeKey(entry)) }}</span>
                </div>
              } @empty {
                <p class="faint">{{ t('channelpoints.log.empty') }}</p>
              }
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .actions { align-items: center; }
    .banner.compact { margin-bottom: 12px; }
    .rows { display: flex; flex-direction: column; }
    .mode-hint { margin: 8px 0 14px; max-width: 680px; }
    .status { margin-bottom: 12px; align-items: center; }
    .select { min-width: 220px; max-width: 320px; }
    .sounds { display: flex; flex-direction: column; max-height: 360px; overflow-y: auto; }
    .sound { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
    .sound:first-child { border-top: 0; }
    .sound .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .log { display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; }
    .entry { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
    .entry:first-child { border-top: 0; }
    .entry.skipped .body { opacity: .55; }
    .time { padding-top: 2px; flex: none; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .body .text { overflow-wrap: anywhere; color: var(--text-2); }
    .reward-title { margin-left: 6px; padding: 0 5px; border-radius: 5px; font-size: 10px; font-weight: 700; letter-spacing: .04em; color: var(--accent); border: 1px solid rgba(var(--accent-rgb), .45); vertical-align: 1px; }
  `,
})
export class ChannelpointsPage {
  protected readonly settings = inject(ChannelpointsSettingsStore);
  protected readonly status = inject(ChannelpointsStatusStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly app = inject(SettingsStore);
  protected readonly output = inject(OutputStore);
  private readonly stz = inject(STZ);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** Counts the clicks on "Load rewards": the resource runs only once the user asked. */
  private readonly loadRequest = signal<number | undefined>(undefined);
  protected readonly rewards = resource<RewardsResult, number | undefined>({
    params: () => this.loadRequest(),
    loader: ({ params }) => (params === undefined ? Promise.resolve({ rewards: [] }) : this.stz.channelpoints.rewards()),
  });
  protected readonly loaded = computed(() => this.loadRequest() !== undefined && !!this.rewards.value()?.rewards);
  protected readonly loadError = computed(() => (this.rewards.error() ? 'failed' : this.rewards.value()?.error) ?? null);
  protected readonly redemptions = computed(() => this.twitch.status()?.features?.redemptions);
  protected readonly devices = resource({ loader: () => this.stz.audioDevices() });
  protected readonly picking = signal(false);
  protected readonly rejected = signal<PickSoundsResult['rejected'] | null>(null);
  protected readonly percent = (value: number) => `${value} %`;

  protected readonly modes = computed<SegmentOption<OutputMode>[]>(() => [
    { value: 'obs', label: this.t('channelpoints.output.obs') },
    { value: 'device', label: this.t('channelpoints.output.deviceMode') },
  ]);

  /** Twitch's rewards (with their settings or the defaults), then the configured ones Twitch no longer lists. */
  protected readonly rows = computed<RewardRowModel[]>(() => {
    const s = this.settings.settings();
    if (!s) return [];
    const listed = this.loaded() ? (this.rewards.value()?.rewards ?? []) : undefined;
    const rows: RewardRowModel[] = (listed ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      cost: r.cost,
      onTwitch: true,
      twitchEnabled: r.enabled,
      config: Object.hasOwn(s.rewards, r.id) ? s.rewards[r.id]! : { ...DEFAULT_REWARD, title: r.title },
    }));
    for (const [id, config] of Object.entries(s.rewards)) {
      if (listed?.some((r) => r.id === id)) continue;
      rows.push({ id, title: config.title, onTwitch: listed ? false : undefined, twitchEnabled: true, config });
    }
    return rows;
  });

  constructor() {
    // Twitch's titles replace the cached ones (a renamed reward keeps its sound).
    effect(() => {
      const listed = this.loaded() ? this.rewards.value()?.rewards : undefined;
      if (!listed) return;
      untracked(() => {
        const s = this.settings.settings();
        if (!s) return;
        const renamed = listed.filter((r) => Object.hasOwn(s.rewards, r.id) && s.rewards[r.id]!.title !== r.title);
        if (!renamed.length) return;
        const rewards = { ...s.rewards };
        for (const r of renamed) rewards[r.id] = { ...rewards[r.id]!, title: r.title };
        void this.settings.update({ rewards });
      });
    });
  }

  protected load(): void {
    this.loadRequest.set((this.loadRequest() ?? 0) + 1);
  }

  protected setOutput(output: OutputMode): void {
    void this.settings.update({ output });
  }

  protected setDevice(event: Event): void {
    void this.settings.update({ deviceId: (event.target as HTMLSelectElement).value });
  }

  protected async addSounds(): Promise<void> {
    this.picking.set(true);
    try {
      const result = await this.status.pickSounds();
      this.rejected.set(result.rejected.length ? result.rejected : null);
    } finally {
      this.picking.set(false);
    }
  }

  protected preview(name: string): void {
    void this.status.preview(name).catch(() => undefined);
  }

  /** Which rewards use a sound ("Hydrate, Jumpscare"). */
  protected usedBy(name: string): string {
    const rewards = this.settings.settings()?.rewards ?? {};
    const titles = Object.values(rewards)
      .filter((r) => r.sound === name)
      .map((r) => r.title)
      .filter(Boolean);
    return titles.join(', ');
  }

  protected time(at: number): string {
    return clock(at, this.i18n.locale());
  }

  protected outcomeKey(entry: RedemptionLogEntry): TextKey {
    return `channelpoints.log.outcome.${entry.outcome}` as TextKey;
  }

  protected reasonKey(reason: PickSoundsResult['rejected'][number]['reason']): TextKey {
    return `channelpoints.sounds.reason.${reason}` as TextKey;
  }

  /** A new login asks for the channel points permission too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
