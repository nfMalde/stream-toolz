import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChannelEventKind, ChatLogEntry } from '@rmc/api';
import { clock } from '../../core/format';
import { I18n, type TextKey } from '../../i18n/i18n';
import { ReaderStore } from '../../stores/reader.store';
import { SettingsStore } from '../../stores/settings.store';
import { TwitchStore } from '../../stores/twitch.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon } from '../../ui/icon';

/** Live: what is read now, what waits, what was read or skipped (and why), and a test message. */
@Component({
  selector: 'rmc-live',
  imports: [Icon, RouterLink],
  template: `
    @let status = reader.status();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('live.eyebrow') }}</div>
          <h1>{{ t('live.title') }}</h1>
        </div>
        <div class="actions">
          <span class="chip state" [class]="'chip state ' + stateTone()"><span class="dot" [class.pulse]="reader.state() === 'reading'"></span>{{ t(stateKey()) }}</span>
          <button type="button" class="btn" (click)="reader.togglePause()">
            <rmc-icon [name]="reader.paused() ? 'play' : 'pause'" [size]="16" />{{ reader.paused() ? t('live.resume') : t('live.pause') }}
          </button>
          <button type="button" class="btn" [disabled]="!status?.current" (click)="reader.skip()"><rmc-icon name="skip" [size]="16" />{{ t('live.skip') }}</button>
          <button type="button" class="btn ghost" [disabled]="!reader.queued().length" (click)="reader.clear()"><rmc-icon name="trash" [size]="16" />{{ t('live.clear') }}</button>
        </div>
      </div>

      @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
        <div class="banner warn">
          <rmc-icon name="plug" /><span class="spacer">{{ t('live.notConnected') }}</span>
          <button type="button" class="btn sm" (click)="settings.openGuide()">{{ t('live.openGuide') }}</button>
        </div>
      } @else if (twitch.stage() === 'error') {
        <div class="banner danger"><rmc-icon name="alert" /><span class="spacer">{{ t('live.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('live.toTwitch') }}</a></div>
      }
      @if (reader.state() === 'no-voice') {
        <div class="banner warn"><rmc-icon name="mic" /><span class="spacer">{{ t('live.noVoice') }}</span><a class="btn sm" routerLink="/voices">{{ t('live.toVoices') }}</a></div>
      }
      @if (settings.settings()?.output === 'obs' && status?.portInUse) {
        <div class="banner danger"><rmc-icon name="alert" /><span class="spacer">{{ t('live.portInUse') }}</span><a class="btn sm" routerLink="/settings">{{ t('live.toSettings') }}</a></div>
      } @else if (settings.settings()?.output === 'obs' && !status?.obsClients) {
        <div class="banner info"><rmc-icon name="broadcast" /><span class="spacer">{{ t('live.obsWaiting') }}</span><a class="btn sm" routerLink="/output">{{ t('live.toOutput') }}</a></div>
      }
      @if (status?.learningReward) {
        <div class="banner info"><rmc-icon name="gift" /><span class="spacer">{{ t('live.learningReward') }}</span><button type="button" class="btn sm" (click)="reader.cancelLearnReward()">{{ t('common.cancel') }}</button></div>
      }

      <div class="grid">
        <div class="span-7 stack">
          <section class="card now" [class.active]="!!status?.current">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="volume" /></div>
              <h2>{{ t('live.now') }}</h2>
            </div>
            @if (status?.current; as current) {
              <div class="message big">
                <b>{{ current.name }} @if (current.event) { <span class="lang event">{{ t(eventBadge(current.event)) }}</span> } @else { <span class="lang">{{ current.language.toUpperCase() }}</span> }</b>
                <p class="selectable">{{ current.spoken }}</p>
              </div>
            } @else {
              <p class="faint">{{ t('live.nothing') }}</p>
            }
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon"><rmc-icon name="clock" /></div>
              <h2>{{ t('live.history') }}</h2>
              <span class="spacer"></span>
              <span class="faint small">{{ t('live.historyHint') }}</span>
            </div>
            <div class="log">
              @for (entry of history(); track entry.id) {
                <div class="entry" [class.skipped]="entry.outcome === 'skipped'">
                  <span class="time faint small num">{{ time(entry.at) }}</span>
                  <div class="body">
                    <b>{{ entry.name }} @if (entry.event) { <span class="lang event">{{ t(eventBadge(entry.event)) }}</span> }</b>
                    <span class="text selectable">{{ entry.text }}</span>
                  </div>
                  <span class="chip" [class.ok]="entry.outcome === 'read'" [class.live]="entry.outcome === 'queued'">{{ outcome(entry) }}</span>
                </div>
              } @empty {
                <p class="faint">{{ t('live.historyEmpty') }}</p>
              }
            </div>
          </section>
        </div>

        <div class="span-5 stack">
          <section class="card">
            <div class="card-header">
              <div class="card-icon"><rmc-icon name="chat" /></div>
              <h2>{{ t('live.queue') }}</h2>
              <span class="spacer"></span>
              <span class="badge-number">{{ reader.queued().length }}</span>
            </div>
            <div class="queue">
              @for (item of reader.queued(); track item.id) {
                <div class="queued">
                  <div class="body">
                    <b>{{ item.name }} @if (item.event) { <span class="lang event">{{ t(eventBadge(item.event)) }}</span> } @else { <span class="lang">{{ item.language.toUpperCase() }}</span> }</b>
                    <span class="text">{{ item.spoken }}</span>
                  </div>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('live.remove')" (click)="reader.remove(item.id)"><rmc-icon name="x" [size]="14" /></button>
                </div>
              } @empty {
                <p class="faint">{{ t('live.queueEmpty') }}</p>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon"><rmc-icon name="send" /></div>
              <div>
                <h2>{{ t('live.test') }}</h2>
                <p class="faint small">{{ t('live.testHint') }}</p>
              </div>
            </div>
            <form class="row" (submit)="$event.preventDefault(); sendTest()">
              <input class="input spacer" maxlength="500" [value]="testText()" (input)="testText.set(value($event))" [placeholder]="t('live.testPlaceholder')" />
              <button type="submit" class="btn primary" [disabled]="!testText().trim()"><rmc-icon name="send" [size]="15" />{{ t('live.testSend') }}</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: `
    .actions { align-items: center; }
    .state.ok { background: var(--ok-soft); color: var(--ok); }
    .state.live { background: var(--live-soft); color: var(--live); }
    .state.warn { background: var(--warn-soft); color: var(--warn); }
    .state.danger { background: var(--danger-soft); color: #ff8aa0; }
    .now.active { border-color: rgba(var(--accent-rgb), .45); box-shadow: var(--shadow), var(--accent-glow); }
    .message.big b { font-size: 13px; color: var(--accent); }
    .lang { margin-left: 4px; padding: 0 5px; border-radius: 5px; font-size: 10px; font-weight: 700; letter-spacing: .06em; color: var(--text-3); border: 1px solid var(--border-strong); vertical-align: 1px; }
    .lang.event { color: var(--accent); border-color: rgba(var(--accent-rgb), .45); }
    .message.big p { font-size: 20px; line-height: 1.4; margin-top: 4px; overflow-wrap: anywhere; }
    .log { display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; }
    .entry { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
    .entry:first-child { border-top: 0; }
    .entry.skipped .body { opacity: .55; }
    .time { padding-top: 2px; flex: none; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .body .text { overflow-wrap: anywhere; color: var(--text-2); }
    .queue { display: flex; flex-direction: column; gap: 6px; max-height: 360px; overflow-y: auto; }
    .queued { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border); }
  `,
})
export class Live {
  protected readonly reader = inject(ReaderStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly settings = inject(SettingsStore);
  /** Loaded here too, so the "no voice" hint knows the packages. */
  protected readonly voices = inject(VoicesStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly testText = signal('');
  /** Newest first. */
  protected readonly history = computed(() => [...this.reader.log()].reverse());

  protected readonly stateKey = computed<TextKey>(() => `live.state.${this.reader.state()}` as TextKey);
  protected readonly stateTone = computed(() => {
    switch (this.reader.state()) {
      case 'reading':
        return 'ok';
      case 'idle':
        return 'live';
      case 'paused':
      case 'waiting-output':
        return 'warn';
      case 'no-voice':
        return 'danger';
      default:
        return '';
    }
  });

  protected time(at: number): string {
    return clock(at, this.i18n.locale());
  }

  protected outcome(entry: ChatLogEntry): string {
    if (entry.outcome === 'skipped') return this.t(`reason.${entry.reason ?? 'removed'}` as TextKey);
    if (entry.outcome === 'queued' && this.reader.status()?.current?.id === entry.id) return this.t('live.state.reading');
    return this.t(entry.outcome === 'read' ? 'live.read' : 'live.queued');
  }

  protected eventBadge(kind: ChannelEventKind): TextKey {
    return `events.badge.${kind}` as TextKey;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected sendTest(): void {
    const text = this.testText().trim();
    if (!text) return;
    void this.reader.test(text);
    this.testText.set('');
  }
}
