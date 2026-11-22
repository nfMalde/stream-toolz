import { Component, computed, inject, signal } from '@angular/core';
import { BOT_LIMITS, BOT_PREFIX, BOT_WHO, cleanBotTrigger, isValidBotTrigger, newBotId, type BotCommand, type BotWho } from '@stz/api';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Toggle } from '@shell/ui/toggle';
import { BotStore } from '../../stores/bot.store';
import { BotSettingsStore } from '../../stores/settings.store';
import { BotBanners } from '../banners';

/** What the form holds while a command is typed: aliases as one line, the id while an existing one is edited. */
interface Draft {
  id: string | null;
  trigger: string;
  response: string;
  aliases: string;
  who: BotWho;
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
}

const EMPTY: Draft = { id: null, trigger: '', response: '', aliases: '', who: 'everyone', cooldownSeconds: 0, userCooldownSeconds: 0, enabled: true };

/** Commands: the table, the form to add or edit one, a preview of the answer, and a test message. */
@Component({
  selector: 'stz-bot-commands',
  imports: [Icon, Segmented, Toggle, BotBanners],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">Chat Bot</div>
          <h1>{{ t('bot.commands.title') }}</h1>
        </div>
        <div class="actions">
          <span class="chip" [class.ok]="bot.connected()" [class.warn]="!bot.connected()"><span class="dot" [class.pulse]="bot.connected()"></span>{{ bot.connected() ? t('bot.status.connected') : t('bot.status.offline') }}</span>
          @if (bot.queued()) {
            <span class="chip live">{{ t('bot.status.queued', { n: bot.queued() }) }}</span>
          }
        </div>
      </div>

      <stz-bot-banners />

      @if (s) {
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="send" /></div>
              <div>
                <h2>{{ t('bot.commands.list') }}</h2>
                <p class="faint small">{{ t('bot.commands.listHint', { n: s.commands.length, max: limits.commands }) }}</p>
              </div>
            </div>
            @if (s.commands.length) {
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ t('bot.commands.trigger') }}</th>
                    <th>{{ t('bot.commands.response') }}</th>
                    <th>{{ t('bot.commands.who') }}</th>
                    <th>{{ t('bot.commands.cooldowns') }}</th>
                    <th class="num">{{ t('bot.commands.uses') }}</th>
                    <th>{{ t('bot.commands.enabled') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of s.commands; track c.id) {
                    <tr [class.editing]="draft().id === c.id">
                      <td>
                        <b class="mono">{{ prefix }}{{ c.trigger }}</b>
                        @if (c.aliases.length) {
                          <div class="faint small mono">{{ aliasText(c) }}</div>
                        }
                      </td>
                      <td class="response selectable">{{ c.response }}</td>
                      <td>{{ t(whoKey(c.who)) }}</td>
                      <td class="num nowrap">{{ cooldownText(c) }}</td>
                      <td class="num nowrap">
                        {{ c.uses }}
                        @if (c.uses) {
                          <button type="button" class="btn sm ghost icon-only" [title]="t('bot.commands.resetUses')" (click)="resetUses(c)"><stz-icon name="refresh" [size]="14" /></button>
                        }
                      </td>
                      <td><stz-toggle [checked]="c.enabled" [label]="t('bot.commands.enabled')" (checkedChange)="setEnabled(c, $event)" /></td>
                      <td class="nowrap">
                        <button type="button" class="btn sm ghost" (click)="openPreview(c)"><stz-icon name="eye" [size]="14" />{{ t('bot.commands.preview') }}</button>
                        <button type="button" class="btn sm ghost" (click)="edit(c)"><stz-icon name="sliders" [size]="14" />{{ t('bot.commands.edit') }}</button>
                        <button type="button" class="btn sm ghost icon-only" [title]="t('bot.commands.remove')" (click)="remove(c)"><stz-icon name="trash" [size]="14" /></button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <div class="empty">
                <div class="card-icon"><stz-icon name="send" /></div>
                <p>{{ t('bot.commands.empty') }}</p>
              </div>
            }

            @if (previewCommand(); as c) {
              <div class="preview">
                <div class="row wrap">
                  <stz-icon name="eye" />
                  <b>{{ t('bot.preview.title') }}</b>
                  <span class="faint small">{{ prefix }}{{ c.trigger }}</span>
                  <span class="spacer"></span>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('common.close')" (click)="previewId.set(null)"><stz-icon name="x" [size]="14" /></button>
                </div>
                <form class="row" (submit)="$event.preventDefault(); runPreview()">
                  <span class="mono faint">{{ prefix }}{{ c.trigger }}</span>
                  <input class="input spacer" maxlength="400" [value]="previewArgs()" (input)="previewArgs.set(read($event))" [placeholder]="t('bot.preview.argsPlaceholder')" />
                  <button type="submit" class="btn sm">{{ t('bot.preview.run') }}</button>
                </form>
                <p class="faint small">{{ t('bot.preview.hint') }}</p>
                @if (previewText()) {
                  <div class="message"><b>{{ twitch.status()?.user?.name ?? '…' }}</b><span class="selectable">{{ previewText() }}</span></div>
                }
              </div>
            }
          </section>

          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon [name]="draft().id ? 'sliders' : 'sparkle'" /></div>
              <div>
                <h2>{{ draft().id ? t('bot.form.editTitle') : t('bot.form.addTitle') }}</h2>
                <p class="faint small">{{ t('bot.form.hint') }}</p>
              </div>
            </div>
            <form class="stack" (submit)="$event.preventDefault(); save()">
              <div class="field">
                <label for="trigger">{{ t('bot.form.trigger') }}</label>
                <div class="row">
                  <span class="mono prefix">{{ prefix }}</span>
                  <input id="trigger" class="input spacer mono" spellcheck="false" [attr.maxlength]="limits.trigger + 1" [class.invalid]="!!errors().trigger"
                         [value]="draft().trigger" (input)="patch({ trigger: read($event) })" placeholder="discord" />
                </div>
                @if (errors().trigger; as e) {
                  <p class="error small">{{ t(e) }}</p>
                } @else {
                  <p class="faint small">{{ t('bot.form.triggerHint') }}</p>
                }
              </div>
              <div class="field">
                <label for="response">{{ t('bot.form.response') }}</label>
                <textarea id="response" class="input area" [attr.maxlength]="limits.response" [class.invalid]="!!errors().response"
                          [value]="draft().response" (input)="patch({ response: read($event) })" [placeholder]="t('bot.form.responsePlaceholder')"></textarea>
                <div class="row">
                  @if (errors().response; as e) {
                    <p class="error small spacer">{{ t(e) }}</p>
                  } @else {
                    <p class="faint small spacer">{{ t('bot.form.responseHint') }}</p>
                  }
                  <span class="faint small num">{{ draft().response.length }}/{{ limits.response }}</span>
                </div>
              </div>
              <div class="field">
                <label for="aliases">{{ t('bot.form.aliases') }}</label>
                <input id="aliases" class="input mono" spellcheck="false" [class.invalid]="!!errors().aliases"
                       [value]="draft().aliases" (input)="patch({ aliases: read($event) })" placeholder="dc, disc" />
                @if (errors().aliases; as e) {
                  <p class="error small">{{ t(e) }}</p>
                } @else {
                  <p class="faint small">{{ t('bot.form.aliasesHint', { max: limits.aliases }) }}</p>
                }
              </div>
              <div class="field">
                <span class="label">{{ t('bot.form.who') }}</span>
                <stz-segmented [options]="whoOptions()" [value]="draft().who" (valueChange)="patch({ who: $event })" />
                <p class="faint small">{{ t('bot.form.whoHint') }}</p>
              </div>
              <div class="grid inner">
                <div class="field span-6">
                  <label for="cooldown">{{ t('bot.form.cooldown') }}</label>
                  <input id="cooldown" class="input num" type="number" min="0" [max]="limits.cooldown" step="1" [value]="draft().cooldownSeconds" (input)="patch({ cooldownSeconds: number($event) })" />
                  <p class="faint small">{{ t('bot.form.cooldownHint') }}</p>
                </div>
                <div class="field span-6">
                  <label for="userCooldown">{{ t('bot.form.userCooldown') }}</label>
                  <input id="userCooldown" class="input num" type="number" min="0" [max]="limits.cooldown" step="1" [value]="draft().userCooldownSeconds" (input)="patch({ userCooldownSeconds: number($event) })" />
                  <p class="faint small">{{ t('bot.form.userCooldownHint') }}</p>
                </div>
              </div>
              <div class="row">
                <button type="submit" class="btn primary" [disabled]="!valid()"><stz-icon name="check" [size]="15" />{{ draft().id ? t('bot.form.save') : t('bot.form.add') }}</button>
                @if (draft().id) {
                  <button type="button" class="btn ghost" (click)="reset()">{{ t('common.cancel') }}</button>
                }
                @if (full()) {
                  <span class="faint small">{{ t('bot.form.full', { max: limits.commands }) }}</span>
                }
              </div>
            </form>
          </section>

          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="send" /></div>
              <div>
                <h2>{{ t('bot.test.title') }}</h2>
                <p class="faint small">{{ t('bot.test.hint') }}</p>
              </div>
            </div>
            <form class="row" (submit)="$event.preventDefault(); sendTest()">
              <input class="input spacer" maxlength="500" [value]="testText()" (input)="testText.set(read($event))" [placeholder]="t('bot.test.placeholder')" />
              <button type="submit" class="btn primary" [disabled]="!testText().trim() || !bot.connected()"><stz-icon name="send" [size]="15" />{{ t('bot.test.send') }}</button>
            </form>
            <p class="faint small">{{ t('bot.test.result') }}</p>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .actions { align-items: center; }
    .table .response { max-width: 360px; overflow-wrap: anywhere; color: var(--text-2); }
    .table .nowrap { white-space: nowrap; }
    .table tr.editing td { background: var(--accent-soft); }
    .table td .btn + .btn { margin-left: 4px; }
    .preview { margin-top: 14px; padding: 12px 14px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
    .preview .message { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 8px; background: var(--surface-3); overflow-wrap: anywhere; }
    .preview .message b { color: var(--accent); font-size: 12.5px; }
    .prefix { font-size: 15px; color: var(--text-3); }
    .area { height: 90px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
    .input.num { width: 120px; }
    .error { color: #ff8aa0; }
    .grid.inner { gap: 16px; }
    form.stack { gap: 14px; }
  `,
})
export class BotCommandsPage {
  protected readonly settings = inject(BotSettingsStore);
  protected readonly bot = inject(BotStore);
  protected readonly twitch = inject(TwitchStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly prefix = BOT_PREFIX;
  protected readonly limits = BOT_LIMITS;

  protected readonly draft = signal<Draft>(EMPTY);
  protected readonly previewId = signal<string | null>(null);
  protected readonly previewArgs = signal('');
  protected readonly previewText = signal('');
  protected readonly testText = signal('');

  protected readonly whoOptions = computed<SegmentOption<BotWho>[]>(() => BOT_WHO.map((who) => ({ value: who, label: this.t(this.whoKey(who)) })));
  protected readonly previewCommand = computed(() => this.settings.commands().find((c) => c.id === this.previewId()) ?? null);
  protected readonly full = computed(() => !this.draft().id && this.settings.commands().length >= BOT_LIMITS.commands);

  /** The form's feedback, as text keys; the main process checks again when saving. */
  protected readonly errors = computed<{ trigger?: TextKey; response?: TextKey; aliases?: TextKey }>(() => {
    const d = this.draft();
    const taken = this.takenTriggers(d.id);
    const result: { trigger?: TextKey; response?: TextKey; aliases?: TextKey } = {};
    const trigger = cleanBotTrigger(d.trigger);
    if (!trigger) result.trigger = 'bot.form.triggerRequired';
    else if (!isValidBotTrigger(trigger)) result.trigger = 'bot.form.triggerInvalid';
    else if (taken.has(trigger)) result.trigger = 'bot.form.triggerTaken';
    const response = d.response.trim();
    if (!response) result.response = 'bot.form.responseRequired';
    else if (response.length > BOT_LIMITS.response) result.response = 'bot.form.responseTooLong';
    const aliases = this.splitAliases(d.aliases);
    if (aliases.length > BOT_LIMITS.aliases) result.aliases = 'bot.form.aliasesTooMany';
    else if (aliases.some((a) => !isValidBotTrigger(a))) result.aliases = 'bot.form.aliasesInvalid';
    else if (aliases.some((a) => taken.has(a) || a === trigger)) result.aliases = 'bot.form.aliasesTaken';
    return result;
  });
  protected readonly valid = computed(() => !this.full() && !this.errors().trigger && !this.errors().response && !this.errors().aliases);

  protected whoKey(who: BotWho): TextKey {
    return `bot.who.${who}` as TextKey;
  }

  protected aliasText(c: BotCommand): string {
    return c.aliases.map((a) => BOT_PREFIX + a).join(', ');
  }

  protected cooldownText(c: BotCommand): string {
    const off = this.t('common.off');
    return `${c.cooldownSeconds ? `${c.cooldownSeconds} s` : off} / ${c.userCooldownSeconds ? `${c.userCooldownSeconds} s` : off}`;
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected number(event: Event): number {
    const n = Number((event.target as HTMLInputElement).value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected reset(): void {
    this.draft.set(EMPTY);
  }

  protected edit(c: BotCommand): void {
    this.draft.set({ id: c.id, trigger: c.trigger, response: c.response, aliases: c.aliases.join(', '), who: c.who, cooldownSeconds: c.cooldownSeconds, userCooldownSeconds: c.userCooldownSeconds, enabled: c.enabled });
  }

  protected save(): void {
    if (!this.valid()) return;
    const d = this.draft();
    const existing = this.settings.commands().find((c) => c.id === d.id);
    const command: BotCommand = {
      id: existing?.id ?? newBotId(),
      trigger: cleanBotTrigger(d.trigger),
      response: d.response.trim(),
      aliases: [...new Set(this.splitAliases(d.aliases))],
      who: d.who,
      cooldownSeconds: Math.min(BOT_LIMITS.cooldown, d.cooldownSeconds),
      userCooldownSeconds: Math.min(BOT_LIMITS.cooldown, d.userCooldownSeconds),
      enabled: existing?.enabled ?? d.enabled,
      uses: existing?.uses ?? 0,
    };
    const commands = existing ? this.settings.commands().map((c) => (c.id === existing.id ? command : c)) : [...this.settings.commands(), command];
    void this.settings.update({ commands });
    this.reset();
  }

  protected remove(c: BotCommand): void {
    void this.settings.update({ commands: this.settings.commands().filter((x) => x.id !== c.id) });
    if (this.draft().id === c.id) this.reset();
    if (this.previewId() === c.id) this.previewId.set(null);
  }

  protected setEnabled(c: BotCommand, enabled: boolean): void {
    void this.settings.update({ commands: this.settings.commands().map((x) => (x.id === c.id ? { ...x, enabled } : x)) });
  }

  protected resetUses(c: BotCommand): void {
    void this.bot.resetUses(c.id);
  }

  protected openPreview(c: BotCommand): void {
    this.previewId.set(c.id);
    this.previewText.set('');
    this.runPreview();
  }

  protected runPreview(): void {
    const id = this.previewId();
    if (!id) return;
    void this.bot.preview(id, this.previewArgs()).then(
      (text) => this.previewText.set(text),
      () => this.previewText.set(''),
    );
  }

  protected sendTest(): void {
    const text = this.testText().trim();
    if (!text) return;
    void this.bot.sendTest(text);
    this.testText.set('');
  }

  /** Triggers and aliases of the other commands (the one being edited may keep its own). */
  private takenTriggers(exceptId: string | null): Set<string> {
    const taken = new Set<string>();
    for (const c of this.settings.commands()) {
      if (c.id === exceptId) continue;
      taken.add(c.trigger);
      for (const a of c.aliases) taken.add(a);
    }
    return taken;
  }

  private splitAliases(text: string): string[] {
    return text
      .split(/[\s,]+/)
      .map(cleanBotTrigger)
      .filter(Boolean);
  }
}
