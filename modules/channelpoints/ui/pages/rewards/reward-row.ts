import { Component, computed, inject, input, output } from '@angular/core';
import type { RewardSettings } from '@stz/api';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';

/** A reward as the page shows it: Twitch's listing merged with the settings. */
export interface RewardRowModel {
  id: string;
  title: string;
  /** Points, when Twitch listed the reward. */
  cost?: number;
  /** Listed by Twitch right now; undefined until the rewards were loaded. */
  onTwitch?: boolean;
  /** Viewers can redeem it (switched on in the Twitch dashboard). */
  twitchEnabled: boolean;
  config: RewardSettings;
}

/** One reward: on/off, its sound, volume, cooldown and a test. */
@Component({
  selector: 'stz-reward-row',
  imports: [Icon, Slider, Toggle],
  template: `
    @let r = reward();
    <div class="reward" [class.gone]="r.onTwitch === false" [class.off]="!r.config.enabled">
      <div class="head">
        <stz-toggle [checked]="r.config.enabled" [label]="t('channelpoints.rewards.enabled')" [disabled]="r.onTwitch === false" (checkedChange)="changed.emit({ enabled: $event })" />
        <div class="name">
          <b>{{ r.title || r.id }}</b>
          <span class="meta faint small">
            @if (r.cost !== undefined) { {{ t('channelpoints.rewards.cost', { cost: r.cost }) }} }
            @if (r.onTwitch === false) { <span class="chip warn">{{ t('channelpoints.rewards.gone') }}</span> }
            @else if (!r.twitchEnabled) { <span class="chip">{{ t('channelpoints.rewards.twitchOff') }}</span> }
          </span>
        </div>
        <span class="spacer"></span>
        @if (r.onTwitch === false) {
          <button type="button" class="btn sm ghost" (click)="remove.emit()"><stz-icon name="trash" [size]="14" />{{ t('channelpoints.rewards.remove') }}</button>
        } @else {
          <button type="button" class="btn sm" [disabled]="!r.config.sound" [title]="t('channelpoints.rewards.testHint')" (click)="test.emit()"><stz-icon name="play" [size]="14" />{{ t('channelpoints.rewards.test') }}</button>
        }
      </div>
      <div class="controls">
        <label class="field">
          <span class="label">{{ t('channelpoints.rewards.sound') }}</span>
          <span class="row">
            <select class="input select" [value]="r.config.sound" (change)="setSound($event)">
              <option value="">{{ t('channelpoints.rewards.noSound') }}</option>
              @if (missing()) {
                <option [value]="r.config.sound" selected>{{ t('channelpoints.rewards.missingSound', { name: r.config.sound }) }}</option>
              }
              @for (name of sounds(); track name) {
                <option [value]="name" [selected]="name === r.config.sound">{{ name }}</option>
              }
            </select>
            <button type="button" class="btn sm icon-only ghost" [disabled]="!r.config.sound || missing()" [title]="t('channelpoints.rewards.preview')" (click)="preview.emit(r.config.sound)"><stz-icon name="headphones" [size]="15" /></button>
          </span>
        </label>
        <label class="field volume">
          <span class="label">{{ t('channelpoints.rewards.volume') }}</span>
          <stz-slider [value]="r.config.volume" [min]="0" [max]="100" [step]="5" [format]="percent" [label]="t('channelpoints.rewards.volume')" (changed)="changed.emit({ volume: $event })" />
        </label>
        <label class="field cooldown">
          <span class="label">{{ t('channelpoints.rewards.cooldown') }}</span>
          <span class="row">
            <input class="input num" type="number" min="0" max="3600" step="1" [value]="r.config.cooldownSeconds" (change)="setCooldown($event)" />
            <span class="faint small">{{ t('channelpoints.rewards.seconds') }}</span>
          </span>
        </label>
      </div>
    </div>
  `,
  styles: `
    .reward { padding: 12px 0; border-top: 1px solid var(--border); }
    .reward:first-child { border-top: 0; padding-top: 0; }
    .reward.gone .name, .reward.gone .controls { opacity: .5; }
    .reward.off .controls { opacity: .7; }
    .head { display: flex; align-items: center; gap: 12px; }
    .name { display: flex; flex-direction: column; min-width: 0; }
    .name b { overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .controls { display: grid; grid-template-columns: minmax(220px, 1.4fr) minmax(180px, 1fr) auto; gap: 16px; margin-top: 10px; align-items: end; }
    @media (max-width: 900px) { .controls { grid-template-columns: 1fr; } }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .field .label { font-size: 12px; color: var(--text-3); }
    .field .row { display: flex; align-items: center; gap: 6px; }
    .select { flex: 1; min-width: 0; }
    .num { width: 90px; }
    .volume stz-slider { min-height: 34px; }
  `,
})
export class RewardRow {
  readonly reward = input.required<RewardRowModel>();
  /** The files in the sounds folder. */
  readonly sounds = input.required<string[]>();
  readonly changed = output<Partial<RewardSettings>>();
  readonly remove = output<void>();
  readonly test = output<void>();
  readonly preview = output<string>();

  protected readonly t = inject(I18n).t;
  protected readonly percent = (value: number) => `${value} %`;
  /** The set sound is no longer in the folder. */
  protected readonly missing = computed(() => {
    const sound = this.reward().config.sound;
    return !!sound && !this.sounds().includes(sound);
  });

  protected setSound(event: Event): void {
    this.changed.emit({ sound: (event.target as HTMLSelectElement).value });
  }

  protected setCooldown(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.changed.emit({ cooldownSeconds: Number.isFinite(value) ? Math.min(3600, Math.max(0, Math.round(value))) : 0 });
  }
}
