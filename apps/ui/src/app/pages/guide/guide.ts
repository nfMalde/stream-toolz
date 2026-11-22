import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import type { GuideCheck, GuideStep } from '../../core/module-ui';
import { I18n } from '../../i18n/i18n';
import { MODULE_UIS } from '../../modules';
import { SettingsStore } from '../../stores/settings.store';
import { TwitchStore } from '../../stores/twitch.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { AppForm } from '../twitch/app-form';
import { ChannelField } from '../twitch/channel-field';
import { LoginCard } from '../twitch/login-card';

/** The shell's steps; the modules that are on add theirs between login and done (core/module-ui.ts). */
type Step = Omit<GuideStep, 'component'> & Partial<Pick<GuideStep, 'component'>>;

const WELCOME: Step = { id: 'welcome', title: 'guide.welcome', icon: 'sparkle' };
const APP: Step = { id: 'app', title: 'guide.app', icon: 'key' };
const LOGIN: Step = { id: 'login', title: 'guide.login', icon: 'plug' };
const DONE: Step = { id: 'done', title: 'guide.done', icon: 'check' };

/** The setup assistant: opens by itself at first start, and from the navigation. Every step can be skipped. */
@Component({
  selector: 'stz-guide',
  imports: [NgComponentOutlet, Icon, Segmented, AppForm, LoginCard, ChannelField],
  template: `
    <div class="backdrop"></div>
    <section class="guide" role="dialog" aria-modal="true" [attr.aria-label]="t('guide.title')">
      <aside class="steps-nav">
        <div class="eyebrow">{{ t('guide.title') }}</div>
        @for (item of steps(); track item.id; let i = $index) {
          <button type="button" class="step focusable" [class.active]="item.id === step()" [class.done]="isDone(item)" (click)="step.set(item.id)">
            <span class="num">
              @if (isDone(item)) { <stz-icon name="check" [size]="13" [weight]="2.6" /> } @else { {{ i + 1 }} }
            </span>
            {{ t(item.title) }}
          </button>
        }
      </aside>

      <div class="body">
        <header class="head">
          <div class="card-icon accent"><stz-icon [name]="current().icon" /></div>
          <h2>{{ t(current().title) }}</h2>
          <span class="spacer"></span>
          <button type="button" class="btn ghost icon-only" [title]="t('common.close')" (click)="close()"><stz-icon name="x" /></button>
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
                <li><stz-icon name="pc" [size]="16" />{{ t('guide.point.local') }}</li>
                <li><stz-icon name="lock" [size]="16" />{{ t('guide.point.encrypted') }}</li>
                <li><stz-icon name="shield" [size]="16" />{{ t('guide.point.noTracking') }}</li>
                <li><stz-icon name="filter" [size]="16" />{{ t('guide.point.filters') }}</li>
              </ul>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('guide.language') }}</div>
                  <div class="hint">{{ t('guide.languageHint') }}</div>
                </div>
                <div class="control"><stz-segmented [options]="languages" [value]="language()" (valueChange)="setLanguage($event)" /></div>
              </div>
            }
            @case ('app') {
              <p class="muted intro">{{ t('guide.appText') }}</p>
              <stz-app-form />
            }
            @case ('login') {
              <p class="muted intro">{{ t('guide.loginText') }}</p>
              <stz-login-card />
              @if (twitch.hasApp()) {
                <div class="divider"></div>
                <stz-channel-field />
              }
            }
            @case ('done') {
              <p class="lead">{{ t('guide.doneText') }}</p>
              <ul class="checks">
                @for (check of checks(); track check.label) {
                  <li [class.ok]="check.ok"><stz-icon [name]="check.ok ? 'check' : 'alert'" [size]="16" />{{ t(check.label) }}</li>
                }
              </ul>
              @for (test of tests(); track test.label) {
                <div class="row">
                  <button type="button" class="btn" [disabled]="tested()" (click)="runTest(test.run)"><stz-icon name="send" [size]="15" />{{ t(test.label) }}</button>
                  <span class="faint small">{{ t(test.hint) }}</span>
                </div>
              }
            }
            @default {
              <!-- A module's step. -->
              @if (current().component; as component) {
                <ng-container *ngComponentOutlet="component" />
              }
            }
          }
        </div>

        <footer class="foot">
          @if (index() > 0) {
            <button type="button" class="btn ghost" (click)="go(-1)"><stz-icon name="chevronLeft" [size]="16" />{{ t('common.back') }}</button>
          }
          <span class="spacer"></span>
          @if (step() === 'done') {
            <button type="button" class="btn primary" (click)="close()">{{ t('guide.finish') }}</button>
          } @else {
            <button type="button" class="btn primary" (click)="go(1)">{{ t('common.next') }}<stz-icon name="chevronRight" [size]="16" /></button>
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
    .intro { max-width: 680px; margin-bottom: 16px; }
    .points, .checks { list-style: none; padding: 0; margin: 18px 0; display: flex; flex-direction: column; gap: 10px; }
    .points li, .checks li { display: flex; align-items: center; gap: 10px; }
    .points stz-icon { color: var(--accent); }
    .checks li { color: var(--warn); }
    .checks li.ok { color: var(--ok); }
  `,
})
export class Guide {
  private readonly settings = inject(SettingsStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly t = inject(I18n).t;

  /** Every module's part, created once here (its injection context); shown only while the module is on. */
  private readonly moduleGuides = MODULE_UIS.map((module) => ({ id: module.id, guide: module.guide?.() }));
  private readonly guides = computed(() =>
    this.moduleGuides.filter((m) => this.settings.moduleEnabled(m.id)).flatMap((m) => (m.guide ? [m.guide] : [])),
  );

  protected readonly steps = computed<Step[]>(() => [WELCOME, APP, LOGIN, ...this.guides().flatMap((guide) => guide.steps), DONE]);
  protected readonly step = linkedSignal<string>(() => {
    const wanted = this.settings.guideStep();
    return this.steps().some((s) => s.id === wanted) ? wanted! : WELCOME.id;
  });
  protected readonly index = computed(() => Math.max(0, this.steps().findIndex((s) => s.id === this.step())));
  protected readonly current = computed(() => this.steps()[this.index()]!);
  protected readonly checks = computed<GuideCheck[]>(() => [
    { ok: this.twitch.connected(), label: this.twitch.connected() ? 'guide.check.twitch' : 'guide.check.noTwitch' },
    ...this.guides().flatMap((guide) => guide.checks?.() ?? []),
  ]);
  protected readonly tests = computed(() => this.guides().flatMap((guide) => (guide.test ? [guide.test] : [])));
  protected readonly language = computed(() => this.settings.language());
  protected readonly tested = signal(false);
  protected readonly languages: SegmentOption<string>[] = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];

  protected isDone(step: Step): boolean {
    switch (step.id) {
      case APP.id:
        return this.twitch.hasApp();
      case LOGIN.id:
        return this.twitch.connected();
      default:
        return step.done?.() ?? false;
    }
  }

  /** The app's language; the modules may follow it (ReadMyChat: the chat's language). All can be changed later. */
  protected setLanguage(language: string): void {
    void this.settings.update({ language });
    for (const guide of this.guides()) guide.languageChosen?.(language);
  }

  protected go(delta: number): void {
    const next = this.steps()[this.index() + delta];
    if (next) this.step.set(next.id);
  }

  protected runTest(run: () => void): void {
    this.tested.set(true);
    run();
    setTimeout(() => this.tested.set(false), 3000);
  }

  protected close(): void {
    void this.settings.closeGuide();
  }
}
