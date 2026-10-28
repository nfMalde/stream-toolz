import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import type { ChatLanguage } from '@rmc/api';
import { I18n, type TextKey } from '../../i18n/i18n';
import { ReaderStore } from '../../stores/reader.store';
import { SettingsStore } from '../../stores/settings.store';
import { TwitchStore } from '../../stores/twitch.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon, type IconName } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { OutputSetup } from '../output/output-setup';
import { AppForm } from '../twitch/app-form';
import { ChannelField } from '../twitch/channel-field';
import { LoginCard } from '../twitch/login-card';
import { VoicePackages } from '../voices/voice-packages';
import { VoicePicker } from '../voices/voice-picker';

type StepId = 'welcome' | 'app' | 'login' | 'voice' | 'output' | 'done';

const STEPS: { id: StepId; title: TextKey; icon: IconName }[] = [
  { id: 'welcome', title: 'guide.welcome', icon: 'sparkle' },
  { id: 'app', title: 'guide.app', icon: 'key' },
  { id: 'login', title: 'guide.login', icon: 'plug' },
  { id: 'voice', title: 'guide.voice', icon: 'mic' },
  { id: 'output', title: 'guide.output', icon: 'broadcast' },
  { id: 'done', title: 'guide.done', icon: 'check' },
];

/** The setup assistant: opens by itself at first start, and from the navigation. Every step can be skipped. */
@Component({
  selector: 'rmc-guide',
  imports: [Icon, Segmented, AppForm, LoginCard, ChannelField, VoicePackages, VoicePicker, OutputSetup],
  template: `
    <div class="backdrop"></div>
    <section class="guide" role="dialog" aria-modal="true" [attr.aria-label]="t('guide.title')">
      <aside class="steps-nav">
        <div class="eyebrow">{{ t('guide.title') }}</div>
        @for (item of steps; track item.id; let i = $index) {
          <button type="button" class="step focusable" [class.active]="item.id === step()" [class.done]="isDone(item.id)" (click)="step.set(item.id)">
            <span class="num">
              @if (isDone(item.id)) { <rmc-icon name="check" [size]="13" [weight]="2.6" /> } @else { {{ i + 1 }} }
            </span>
            {{ t(item.title) }}
          </button>
        }
      </aside>

      <div class="body">
        <header class="head">
          <div class="card-icon accent"><rmc-icon [name]="current().icon" /></div>
          <h2>{{ t(current().title) }}</h2>
          <span class="spacer"></span>
          <button type="button" class="btn ghost icon-only" [title]="t('common.close')" (click)="close()"><rmc-icon name="x" /></button>
        </header>

        <div class="content">
          @switch (step()) {
            @case ('welcome') {
              <div class="hello">
                <img src="maldoe-256.png" alt="" width="96" height="96" />
                <div>
                  <p class="lead">{{ t('guide.welcomeText') }}</p>
                  <p class="faint small by">{{ t('guide.byMaldoe') }}</p>
                </div>
              </div>
              <ul class="points">
                <li><rmc-icon name="pc" [size]="16" />{{ t('guide.point.local') }}</li>
                <li><rmc-icon name="lock" [size]="16" />{{ t('guide.point.encrypted') }}</li>
                <li><rmc-icon name="shield" [size]="16" />{{ t('guide.point.noTracking') }}</li>
                <li><rmc-icon name="filter" [size]="16" />{{ t('guide.point.filters') }}</li>
              </ul>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('guide.language') }}</div>
                  <div class="hint">{{ t('guide.languageHint') }}</div>
                </div>
                <div class="control"><rmc-segmented [options]="languages" [value]="language()" (valueChange)="setLanguage($event)" /></div>
              </div>
            }
            @case ('app') {
              <p class="muted intro">{{ t('guide.appText') }}</p>
              <rmc-app-form />
            }
            @case ('login') {
              <p class="muted intro">{{ t('guide.loginText') }}</p>
              <rmc-login-card />
              @if (twitch.hasApp()) {
                <div class="divider"></div>
                <rmc-channel-field />
              }
            }
            @case ('voice') {
              <p class="muted intro">{{ t('guide.voiceText') }}</p>
              <rmc-voice-packages [compact]="true" />
              <div class="divider"></div>
              <rmc-voice-picker [language]="mainLanguage()" />
              <p class="faint small other">{{ t('guide.voiceOther') }}</p>
            }
            @case ('output') {
              <p class="muted intro">{{ t('guide.outputText') }}</p>
              <rmc-output-setup [compact]="true" />
            }
            @case ('done') {
              <p class="lead">{{ t('guide.doneText') }}</p>
              <ul class="checks">
                <li [class.ok]="twitch.connected()"><rmc-icon [name]="twitch.connected() ? 'check' : 'alert'" [size]="16" />{{ t(twitch.connected() ? 'guide.check.twitch' : 'guide.check.noTwitch') }}</li>
                <li [class.ok]="voices.hasInstalledVoice()"><rmc-icon [name]="voices.hasInstalledVoice() ? 'check' : 'alert'" [size]="16" />{{ t(voices.hasInstalledVoice() ? 'guide.check.voice' : 'guide.check.noVoice') }}</li>
              </ul>
              <div class="row">
                <button type="button" class="btn" [disabled]="tested()" (click)="test()"><rmc-icon name="send" [size]="15" />{{ t('guide.testMessage') }}</button>
                <span class="faint small">{{ t('guide.testHint') }}</span>
              </div>
            }
          }
        </div>

        <footer class="foot">
          @if (index() > 0) {
            <button type="button" class="btn ghost" (click)="go(-1)"><rmc-icon name="chevronLeft" [size]="16" />{{ t('common.back') }}</button>
          }
          <span class="spacer"></span>
          @if (step() === 'done') {
            <button type="button" class="btn primary" (click)="close()">{{ t('guide.finish') }}</button>
          } @else {
            <button type="button" class="btn primary" (click)="go(1)">{{ t('common.next') }}<rmc-icon name="chevronRight" [size]="16" /></button>
          }
        </footer>
      </div>
    </section>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 28px; }
    .backdrop { position: absolute; inset: 0; background: rgba(6, 5, 11, .72); backdrop-filter: blur(5px); }
    .guide {
      position: relative; width: min(1060px, 100%); height: min(760px, 100%); display: flex; overflow: hidden;
      border-radius: 20px; border: 1px solid var(--border-strong); background: linear-gradient(180deg, var(--surface-2), var(--surface));
      box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
    }
    .steps-nav { width: 220px; flex: none; padding: 22px 14px; border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; background: var(--bg-elevated); }
    .steps-nav .eyebrow { padding: 0 10px 10px; }
    .step {
      appearance: none; border: 0; background: transparent; color: var(--text-2); font: inherit; font-weight: 600; text-align: left;
      display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 10px; border-radius: 10px; cursor: pointer;
    }
    .step:hover { background: var(--surface-2); color: var(--text); }
    .step.active { background: var(--surface-3); color: var(--text); }
    .num { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font-size: 12px; background: var(--surface-3); color: var(--text-2); flex: none; }
    .step.active .num { background: var(--accent-gradient); color: var(--on-accent); }
    .step.done .num { background: var(--ok-soft); color: var(--ok); }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); }
    .content { flex: 1; overflow-y: auto; padding: 20px 22px; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 14px 22px; border-top: 1px solid var(--border); }
    .lead { font-size: 15px; max-width: 640px; }
    .hello { display: flex; align-items: center; gap: 20px; }
    .hello img { flex: none; filter: drop-shadow(0 10px 22px rgba(0, 0, 0, .5)); }
    .by { margin-top: 6px; }
    .other { margin-top: 10px; }
    .intro { max-width: 680px; margin-bottom: 16px; }
    .points, .checks { list-style: none; padding: 0; margin: 18px 0; display: flex; flex-direction: column; gap: 10px; }
    .points li, .checks li { display: flex; align-items: center; gap: 10px; }
    .points rmc-icon { color: var(--accent); }
    .checks li { color: var(--warn); }
    .checks li.ok { color: var(--ok); }
  `,
})
export class Guide {
  private readonly settings = inject(SettingsStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly voices = inject(VoicesStore);
  private readonly reader = inject(ReaderStore);
  protected readonly t = inject(I18n).t;

  protected readonly steps = STEPS;
  protected readonly step = linkedSignal<StepId>(() => (STEPS.some((s) => s.id === this.settings.guideStep()) ? (this.settings.guideStep() as StepId) : 'welcome'));
  protected readonly index = computed(() => STEPS.findIndex((s) => s.id === this.step()));
  protected readonly current = computed(() => STEPS[this.index()]!);
  protected readonly language = computed(() => this.settings.language());
  protected readonly mainLanguage = computed<ChatLanguage>(() => ((this.settings.settings()?.speechLanguage ?? 'de').startsWith('de') ? 'de' : 'en'));
  protected readonly tested = signal(false);
  protected readonly languages: SegmentOption<string>[] = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];

  protected isDone(id: StepId): boolean {
    switch (id) {
      case 'app':
        return this.twitch.hasApp();
      case 'login':
        return this.twitch.connected();
      case 'voice':
        return this.voices.hasInstalledVoice();
      default:
        return false;
    }
  }

  /** App and chat language together; both can be changed separately later. */
  protected setLanguage(language: string): void {
    void this.settings.update({ language, speechLanguage: language === 'de' ? 'de-DE' : 'en-US' });
  }

  protected go(delta: number): void {
    const next = STEPS[this.index() + delta];
    if (next) this.step.set(next.id);
  }

  protected test(): void {
    this.tested.set(true);
    void this.reader.test(this.t('guide.testText'));
    setTimeout(() => this.tested.set(false), 3000);
  }

  protected close(): void {
    void this.settings.closeGuide();
  }
}
