import { Component, inject } from '@angular/core';
import { BOT_PREFIX, type BotLogEntry } from '@stz/api';
import { clock } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { BotStore } from '../../stores/bot.store';

/** The bot's last actions: what it answered, what it held back (cooldown, role) and what Twitch dropped. */
@Component({
  selector: 'stz-bot-log',
  imports: [Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">Chat Bot</div>
          <h1>{{ t('bot.log.title') }}</h1>
        </div>
        <div class="actions">
          <span class="chip" [class.ok]="bot.connected()" [class.warn]="!bot.connected()"><span class="dot" [class.pulse]="bot.connected()"></span>{{ bot.connected() ? t('bot.status.connected') : t('bot.status.offline') }}</span>
          @if (bot.queued()) {
            <span class="chip live">{{ t('bot.status.queued', { n: bot.queued() }) }}</span>
          }
        </div>
      </div>

      <section class="card">
        <div class="card-header">
          <div class="card-icon"><stz-icon name="clock" /></div>
          <h2>{{ t('bot.log.recent') }}</h2>
          <span class="spacer"></span>
          <span class="faint small">{{ t('bot.log.hint') }}</span>
        </div>
        <div class="log">
          @for (entry of bot.log(); track entry.id) {
            <div class="entry" [class.muted]="entry.outcome === 'cooldown' || entry.outcome === 'role'">
              <span class="time faint small num">{{ time(entry.at) }}</span>
              <div class="body">
                <b>
                  @if (entry.kind === 'command') {
                    <span class="mono">{{ prefix }}{{ entry.trigger }}</span> <span class="faint">· {{ entry.user }}</span>
                  } @else {
                    {{ t(entry.kind === 'timer' ? 'bot.log.timer' : 'bot.log.test') }}
                  }
                </b>
                <span class="text selectable">{{ entry.text }}</span>
                @if (entry.error) {
                  <span class="error small">{{ entry.error === 'queue-full' ? t('bot.log.queueFull') : entry.error }}</span>
                }
              </div>
              <span class="chip" [class.ok]="entry.outcome === 'sent' || entry.outcome === 'test'" [class.danger]="entry.outcome === 'failed'">{{ t(outcomeKey(entry)) }}</span>
            </div>
          } @empty {
            <p class="faint">{{ t('bot.log.empty') }}</p>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .actions { align-items: center; }
    .log { display: flex; flex-direction: column; max-height: 70vh; overflow-y: auto; }
    .entry { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
    .entry:first-child { border-top: 0; }
    .entry.muted .body { opacity: .55; }
    .time { padding-top: 2px; flex: none; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .body .text { overflow-wrap: anywhere; color: var(--text-2); }
    .error { color: #ff8aa0; }
  `,
})
export class BotLogPage {
  protected readonly bot = inject(BotStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly prefix = BOT_PREFIX;

  protected time(at: number): string {
    return clock(at, this.i18n.locale());
  }

  protected outcomeKey(entry: BotLogEntry): TextKey {
    return `bot.outcome.${entry.outcome}` as TextKey;
  }
}
