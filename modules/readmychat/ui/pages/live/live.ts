import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ChannelEventKind, ChatLogEntry } from '@stz/api';
import { clock } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { OutputStore } from '@shell/stores/output.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon } from '@shell/ui/icon';
import { ReaderStore } from '../../stores/reader.store';
import { ReadMyChatSettingsStore } from '../../stores/settings.store';
import { VoicesStore } from '../../stores/voices.store';

/** Live: what is read now, what waits, what was read or skipped (and why), and a test message. */
@Component({
  selector: 'stz-live',
  imports: [Icon, RouterLink],
  template: `
    @let status = reader.status();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('readmychat.live.eyebrow') }}</div>
          <h1>{{ t('readmychat.live.title') }}</h1>
        </div>
        <div class="actions">
          <span class="chip state" [class]="'chip state ' + stateTone()"><span class="dot" [class.pulse]="reader.state() === 'reading'"></span>{{ t(stateKey()) }}</span>
          <button type="button" class="btn" (click)="reader.togglePause()">
            <stz-icon [name]="reader.paused() ? 'play' : 'pause'" [size]="16" />{{ reader.paused() ? t('readmychat.live.resume') : t('readmychat.live.pause') }}
          </button>
          <button type="button" class="btn" [disabled]="!status?.current" (click)="reader.skip()"><stz-icon name="skip" [size]="16" />{{ t('readmychat.live.skip') }}</button>
          <button type="button" class="btn ghost" [disabled]="!reader.queued().length" (click)="reader.clear()"><stz-icon name="trash" [size]="16" />{{ t('readmychat.live.clear') }}</button>
        </div>
      </div>

      @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
        <div class="banner warn">
          <stz-icon name="plug" /><span class="spacer">{{ t('readmychat.live.notConnected') }}</span>
          <button type="button" class="btn sm" (click)="app.openGuide()">{{ t('readmychat.live.openGuide') }}</button>
        </div>
      } @else if (twitch.status()?.features?.chat === 'needs-login') {
        <div class="banner warn">
          <stz-icon name="key" /><span class="spacer">{{ t('readmychat.live.chatNeedsLogin') }}</span>
          <button type="button" class="btn sm" (click)="relogin()">{{ t('readmychat.live.relogin') }}</button>
        </div>
      } @else if (twitch.stage() === 'error') {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('readmychat.live.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('readmychat.live.toTwitch') }}</a></div>
      }
      @if (reader.state() === 'no-voice') {
        <div class="banner warn"><stz-icon name="mic" /><span class="spacer">{{ t('readmychat.live.noVoice') }}</span><a class="btn sm" routerLink="/readmychat/voices">{{ t('readmychat.live.toVoices') }}</a></div>
      }
      @if (settings.settings()?.output === 'obs' && output.portInUse()) {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('readmychat.live.portInUse') }}</span><a class="btn sm" routerLink="/settings">{{ t('readmychat.live.toSettings') }}</a></div>
      } @else if (settings.settings()?.output === 'obs' && !output.obsClients()) {
        <div class="banner info"><stz-icon name="broadcast" /><span class="spacer">{{ t('readmychat.live.obsWaiting') }}</span><a class="btn sm" routerLink="/readmychat/output">{{ t('readmychat.live.toOutput') }}</a></div>
      }
      @if (status?.learningReward) {
        <div class="banner info"><stz-icon name="gift" /><span class="spacer">{{ t('readmychat.live.learningReward') }}</span><button type="button" class="btn sm" (click)="reader.cancelLearnReward()">{{ t('common.cancel') }}</button></div>
      }

      <div class="grid">
        <div class="span-7 stack">
          <section class="card now" [class.active]="!!status?.current">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="volume" /></div>
              <h2>{{ t('readmychat.live.now') }}</h2>
            </div>
            @if (status?.current; as current) {
              <div class="message big">
                <b>{{ current.name }} @if (current.event) { <span class="lang event">{{ t(eventBadge(current.event)) }}</span> } @else { <span class="lang">{{ current.language.toUpperCase() }}</span> }</b>
                <p class="selectable">{{ current.spoken }}</p>
              </div>
            } @else {
              <p class="faint">{{ t('readmychat.live.nothing') }}</p>
            }
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="clock" /></div>
              <h2>{{ t('readmychat.live.history') }}</h2>
              <span class="spacer"></span>
              <span class="faint small">{{ t('readmychat.live.historyHint') }}</span>
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
                <p class="faint">{{ t('readmychat.live.historyEmpty') }}</p>
              }
            </div>
          </section>
        </div>

        <div class="span-5 stack">
          <section class="card">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="chat" /></div>
              <h2>{{ t('readmychat.live.queue') }}</h2>
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
                  <button type="button" class="btn sm ghost icon-only" [title]="t('readmychat.live.remove')" (click)="reader.remove(item.id)"><stz-icon name="x" [size]="14" /></button>
                </div>
              } @empty {
                <p class="faint">{{ t('readmychat.live.queueEmpty') }}</p>
              }
            </div>
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="send" /></div>
              <div>
                <h2>{{ t('readmychat.live.test') }}</h2>
                <p class="faint small">{{ t('readmychat.live.testHint') }}</p>
              </div>
            </div>
            <form class="row" (submit)="$event.preventDefault(); sendTest()">
              <input class="input spacer" maxlength="500" [value]="testText()" (input)="testText.set(value($event))" [placeholder]="t('readmychat.live.testPlaceholder')" />
              <button type="submit" class="btn primary" [disabled]="!testText().trim()"><stz-icon name="send" [size]="15" />{{ t('readmychat.live.testSend') }}</button>
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
  protected readonly settings = inject(ReadMyChatSettingsStore);
  protected readonly app = inject(SettingsStore);
  protected readonly output = inject(OutputStore);
  /** Loaded here too, so the "no voice" hint knows the packages. */
  protected readonly voices = inject(VoicesStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly testText = signal('');
  /** Newest first. */
  protected readonly history = computed(() => [...this.reader.log()].reverse());

  protected readonly stateKey = computed<TextKey>(() => `readmychat.live.state.${this.reader.state()}` as TextKey);
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
    if (entry.outcome === 'skipped') return this.t(`readmychat.reason.${entry.reason ?? 'removed'}` as TextKey);
    if (entry.outcome === 'queued' && this.reader.status()?.current?.id === entry.id) return this.t('readmychat.live.state.reading');
    return this.t(entry.outcome === 'read' ? 'readmychat.live.read' : 'readmychat.live.queued');
  }

  protected eventBadge(kind: ChannelEventKind): TextKey {
    return `readmychat.events.badge.${kind}` as TextKey;
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

  /** A new login asks for the chat permission too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
