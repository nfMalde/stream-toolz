import { Component, computed, ElementRef, inject, linkedSignal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CHATOVERLAY_CSS,
  CHATOVERLAY_FONT_FAMILIES,
  chatoverlayColorString,
  chatoverlayParseColor,
  chatoverlayStyle,
  type ChatoverlayAlign,
  type ChatoverlayDirection,
  type ChatoverlayEmoteMode,
  type ChatoverlayFontFamily,
  type ChatoverlayNameColors,
  type ChatoverlaySettings,
} from '@stz/api';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { OutputStore } from '@shell/stores/output.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon } from '@shell/ui/icon';
import { Secret } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { OverlayStore } from '../../stores/overlay.store';
import { ChatoverlaySettingsStore } from '../../stores/settings.store';

/** The role tags of the preview, the same words as on the page. */
const ROLE_LABELS: Record<string, string> = { broadcaster: 'STREAMER', mod: 'MOD', vip: 'VIP', sub: 'SUB' };

/**
 * The overlay: a preview drawn with the page's own stylesheet, the address for OBS, and the look. Emotes stay text
 * in the preview: the app loads nothing from the internet, only OBS's browser does when the streamer chose pictures.
 */
@Component({
  selector: 'stz-chatoverlay-overlay',
  imports: [Icon, RouterLink, Secret, Segmented, Slider, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('chatoverlay.overlay.eyebrow') }}</div>
          <h1>{{ t('chatoverlay.overlay.title') }}</h1>
        </div>
        <div class="actions">
          @if (output.portInUse()) {
            <span class="chip danger"><span class="dot"></span>{{ t('chatoverlay.overlay.portInUse') }}</span>
          } @else if (overlay.clients() > 0) {
            <span class="chip ok"><span class="dot"></span>{{ t('chatoverlay.obs.connected', { count: overlay.clients() }) }}</span>
          } @else {
            <span class="chip warn"><span class="dot pulse"></span>{{ t('chatoverlay.obs.waiting') }}</span>
          }
          <button type="button" class="btn" (click)="overlay.test()"><stz-icon name="sparkle" [size]="16" />{{ t('chatoverlay.preview.test') }}</button>
        </div>
      </div>

      @if (!twitch.hasApp() || twitch.stage() === 'logged-out') {
        <div class="banner warn">
          <stz-icon name="plug" /><span class="spacer">{{ t('chatoverlay.overlay.notConnected') }}</span>
          <button type="button" class="btn sm" (click)="app.openGuide()">{{ t('chatoverlay.overlay.openGuide') }}</button>
        </div>
      } @else if (twitch.status()?.features?.chat === 'needs-login') {
        <div class="banner warn">
          <stz-icon name="key" /><span class="spacer">{{ t('chatoverlay.overlay.chatNeedsLogin') }}</span>
          <button type="button" class="btn sm" (click)="relogin()">{{ t('chatoverlay.overlay.relogin') }}</button>
        </div>
      } @else if (twitch.stage() === 'error') {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('chatoverlay.overlay.twitchError') }}</span><a class="btn sm" routerLink="/twitch">{{ t('chatoverlay.overlay.toTwitch') }}</a></div>
      }
      @if (output.portInUse()) {
        <div class="banner danger"><stz-icon name="alert" /><span class="spacer">{{ t('chatoverlay.overlay.portInUse') }}</span><a class="btn sm" routerLink="/settings">{{ t('chatoverlay.overlay.toSettings') }}</a></div>
      }

      @if (s) {
        <div class="grid">
          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="eye" /></div>
              <div>
                <h2>{{ t('chatoverlay.preview.title') }}</h2>
                <p class="faint small">{{ t('chatoverlay.preview.hint') }}</p>
              </div>
            </div>
            <div class="stage" [class.right]="s.align === 'right'">
              <div class="stz-chat-overlay" [attr.data-direction]="s.direction" [attr.data-align]="s.align"
                   [style.--co-font-size]="style().fontSize + 'px'" [style.--co-font]="style().fontFamily" [style.--co-text]="style().textColor"
                   [style.--co-bg]="style().background" [style.--co-name]="style().nameColor" [style.--co-width]="style().width + 'px'">
                @for (item of preview(); track item.id) {
                  <div class="co-item" [class.co-event]="item.kind === 'event'" [class.co-message]="item.kind === 'message'" [class.co-test]="!!item.test">
                    @if (item.kind === 'message') {
                      @if (s.showBadges) {
                        @for (role of item.roles; track role) {
                          <span class="co-badge" [class]="'co-badge ' + role">{{ roleLabel(role) }}</span>
                        }
                      }
                      <span class="co-name" [style.color]="s.nameColors === 'twitch' && item.color ? item.color : null">{{ item.name }}</span><span class="co-sep">: </span>
                    }
                    <span class="co-text">@for (part of item.parts; track $index) {@switch (part.kind) {
                      @case ('emote') {<span class="co-emote">{{ part.text }}</span>}
                      @case ('mention') {<span class="co-mention">{{ part.text }}</span>}
                      @default {{{ part.text }}}
                    }}</span>
                  </div>
                } @empty {
                  <p class="empty">{{ t('chatoverlay.preview.empty') }}</p>
                }
              </div>
            </div>
            <div class="row test">
              <button type="button" class="btn" (click)="overlay.test()"><stz-icon name="sparkle" [size]="15" />{{ t('chatoverlay.preview.test') }}</button>
              <span class="faint small">{{ t('chatoverlay.preview.testHint') }}</span>
            </div>
          </section>

          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="broadcast" /></div>
              <h2>{{ t('chatoverlay.obs.title') }}</h2>
            </div>
            <div class="field">
              <span class="label">{{ t('chatoverlay.obs.url') }}</span>
              <div class="copy-row">
                <code class="url selectable"><stz-secret [value]="overlay.url()" /></code>
                <button type="button" class="btn sm" (click)="overlay.copyUrl()"><stz-icon [name]="overlay.copied() ? 'check' : 'copy'" [size]="14" />{{ overlay.copied() ? t('common.copied') : t('common.copy') }}</button>
                <button type="button" class="btn sm ghost" (click)="overlay.openUrl()"><stz-icon name="external" [size]="14" />{{ t('chatoverlay.obs.open') }}</button>
              </div>
              <p class="faint small">{{ t('chatoverlay.obs.urlHint') }}</p>
            </div>
            <ol class="steps">
              <li><div><b>{{ t('chatoverlay.obs.step1') }}</b><p class="faint small">{{ t('chatoverlay.obs.step1Hint') }}</p></div></li>
              <li><div><b>{{ t('chatoverlay.obs.step2') }}</b><p class="faint small">{{ t('chatoverlay.obs.step2Hint') }}</p></div></li>
              <li><div><b>{{ t('chatoverlay.obs.step3') }}</b><p class="faint small">{{ t('chatoverlay.obs.step3Hint') }}</p></div></li>
            </ol>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="sliders" /></div>
              <h2>{{ t('chatoverlay.look.title') }}</h2>
            </div>

            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.fontFamily') }}</div>
                <div class="hint">{{ t('chatoverlay.look.fontFamilyHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="fontOptions()" [value]="s.fontFamily" (valueChange)="set({ fontFamily: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.fontSize') }}</div>
                <div class="hint">{{ t('chatoverlay.look.fontSizeHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.fontSize" [min]="12" [max]="64" [step]="1" [format]="px" [label]="t('chatoverlay.look.fontSize')" (changed)="set({ fontSize: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.width') }}</div>
                <div class="hint">{{ t('chatoverlay.look.widthHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.width" [min]="200" [max]="1920" [step]="10" [format]="px" [label]="t('chatoverlay.look.width')" (changed)="set({ width: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.direction') }}</div>
                <div class="hint">{{ t('chatoverlay.look.directionHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="directionOptions()" [value]="s.direction" (valueChange)="set({ direction: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.align') }}</div>
                <div class="hint">{{ t('chatoverlay.look.alignHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="alignOptions()" [value]="s.align" (valueChange)="set({ align: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.textColor') }}</div>
                <div class="hint">{{ t('chatoverlay.look.textColorHint') }}</div>
              </div>
              <div class="control">
                <input type="color" class="color" [value]="textColor().hex" [attr.aria-label]="t('chatoverlay.look.textColor')" (change)="setColor('textColor', read($event), 100)" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.background') }}</div>
                <div class="hint">{{ t('chatoverlay.look.backgroundHint') }}</div>
              </div>
              <div class="control wide">
                <input type="color" class="color" [value]="background().hex" [attr.aria-label]="t('chatoverlay.look.background')" (change)="setColor('background', read($event), background().opacity)" />
                <stz-slider [value]="background().opacity" [min]="0" [max]="100" [step]="5" [format]="percent" [label]="t('chatoverlay.look.opacity')" (changed)="setColor('background', background().hex, $event)" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.nameColors') }}</div>
                <div class="hint">{{ t('chatoverlay.look.nameColorsHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="nameColorOptions()" [value]="s.nameColors" (valueChange)="set({ nameColors: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.nameColor') }}</div>
                <div class="hint">{{ t('chatoverlay.look.nameColorHint') }}</div>
              </div>
              <div class="control">
                <input type="color" class="color" [value]="nameColor().hex" [attr.aria-label]="t('chatoverlay.look.nameColor')" (change)="setColor('nameColor', read($event), 100)" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.showBadges') }}</div>
                <div class="hint">{{ t('chatoverlay.look.showBadgesHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.showBadges" [label]="t('chatoverlay.look.showBadges')" (checkedChange)="set({ showBadges: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.emotes') }}</div>
                <div class="hint">{{ t('chatoverlay.look.emotesHint') }}</div>
              </div>
              <div class="control"><stz-segmented [options]="emoteOptions()" [value]="s.emotes" (valueChange)="set({ emotes: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.maxMessages') }}</div>
                <div class="hint">{{ t('chatoverlay.look.maxMessagesHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.maxMessages" [min]="1" [max]="50" [step]="1" [label]="t('chatoverlay.look.maxMessages')" (changed)="set({ maxMessages: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.look.fadeSeconds') }}</div>
                <div class="hint">{{ t('chatoverlay.look.fadeSecondsHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.fadeSeconds" [min]="0" [max]="600" [step]="5" [format]="secondsOrNever" [label]="t('chatoverlay.look.fadeSeconds')" (changed)="set({ fadeSeconds: $event })" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="filter" /></div>
              <h2>{{ t('chatoverlay.filter.title') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.filter.hideCommands') }}</div>
                <div class="hint">{{ t('chatoverlay.filter.hideCommandsHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.hideCommands" [label]="t('chatoverlay.filter.hideCommands')" (checkedChange)="set({ hideCommands: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('chatoverlay.filter.showEvents') }}</div>
                <div class="hint">{{ t('chatoverlay.filter.showEventsHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.showEvents" [label]="t('chatoverlay.filter.showEvents')" (checkedChange)="set({ showEvents: $event })" /></div>
            </div>
            <div class="setting list">
              <div class="text">
                <label class="title" for="chatoverlay-bots">{{ t('chatoverlay.filter.hideBots') }}</label>
                <div class="hint">{{ t('chatoverlay.filter.hideBotsHint') }}</div>
              </div>
              <div class="control">
                <textarea id="chatoverlay-bots" class="input area" spellcheck="false" [value]="bots()" (input)="bots.set(read($event))" (change)="saveBots()"></textarea>
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .actions { align-items: center; }
    .stage {
      display: flex; min-height: 220px; max-height: 480px; overflow: auto; border-radius: 12px; border: 1px solid var(--border);
      background-color: #3a3a3a;
      background-image: linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%);
      background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    }
    .stage.right { justify-content: flex-end; }
    .stage .stz-chat-overlay { min-height: 220px; }
    .stage .empty { margin: auto 0; font-size: 14px; font-weight: 500; opacity: .7; text-shadow: none; }
    .test { margin-top: 12px; align-items: center; gap: 12px; }
    .copy-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .url { padding: 6px 10px; border-radius: 8px; background: var(--bg-elevated); border: 1px solid var(--border-strong); max-width: 100%; overflow-wrap: anywhere; }
    .field { margin-bottom: 16px; }
    .steps b { display: block; }
    .steps p { margin: 2px 0 0; max-width: 640px; }
    .color { width: 44px; height: 32px; padding: 2px; border-radius: 8px; border: 1px solid var(--border-strong); background: var(--bg-elevated); cursor: pointer; }
    .setting.list { align-items: flex-start; }
    .area { width: 280px; min-height: 120px; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; }
  `,
})
export class ChatoverlayPage {
  protected readonly settings = inject(ChatoverlaySettingsStore);
  protected readonly overlay = inject(OverlayStore);
  protected readonly twitch = inject(TwitchStore);
  protected readonly app = inject(SettingsStore);
  protected readonly output = inject(OutputStore);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  constructor() {
    // The page's stylesheet, as served to OBS: the preview is the page. Its rules all sit below .stz-chat-overlay.
    const style = document.createElement('style');
    style.textContent = CHATOVERLAY_CSS;
    inject(ElementRef).nativeElement.prepend(style);
    void this.overlay.load();
  }

  protected readonly style = computed(() => chatoverlayStyle(this.settings.settings() ?? ({} as ChatoverlaySettings)));
  /** Newest where the page puts it: at the bottom (older ones above) or at the top. */
  protected readonly preview = computed(() => {
    const s = this.settings.settings();
    const items = this.overlay.items().slice(-(s?.maxMessages ?? 50));
    return s?.direction === 'down' ? [...items].reverse() : items;
  });

  protected readonly textColor = computed(() => chatoverlayParseColor(this.settings.settings()?.textColor ?? '#ffffff'));
  protected readonly background = computed(() => chatoverlayParseColor(this.settings.settings()?.background ?? 'transparent'));
  protected readonly nameColor = computed(() => chatoverlayParseColor(this.settings.settings()?.nameColor ?? '#ff730f'));
  protected readonly bots = linkedSignal(() => (this.settings.settings()?.hideBots ?? []).join('\n'));

  protected readonly fontOptions = computed<SegmentOption<ChatoverlayFontFamily>[]>(() =>
    CHATOVERLAY_FONT_FAMILIES.map((value) => ({ value, label: this.t(`chatoverlay.look.font.${value}` as TextKey) })),
  );
  protected readonly directionOptions = computed<SegmentOption<ChatoverlayDirection>[]>(() => [
    { value: 'up', label: this.t('chatoverlay.look.direction.up') },
    { value: 'down', label: this.t('chatoverlay.look.direction.down') },
  ]);
  protected readonly alignOptions = computed<SegmentOption<ChatoverlayAlign>[]>(() => [
    { value: 'left', label: this.t('chatoverlay.look.align.left') },
    { value: 'right', label: this.t('chatoverlay.look.align.right') },
  ]);
  protected readonly nameColorOptions = computed<SegmentOption<ChatoverlayNameColors>[]>(() => [
    { value: 'twitch', label: this.t('chatoverlay.look.nameColors.twitch') },
    { value: 'single', label: this.t('chatoverlay.look.nameColors.single') },
  ]);
  protected readonly emoteOptions = computed<SegmentOption<ChatoverlayEmoteMode>[]>(() => [
    { value: 'text', label: this.t('chatoverlay.look.emotes.text') },
    { value: 'images', label: this.t('chatoverlay.look.emotes.images') },
  ]);

  protected readonly px = (value: number) => `${value} px`;
  protected readonly percent = (value: number) => `${value} %`;
  protected readonly secondsOrNever = (value: number) => (value ? `${value} s` : this.t('chatoverlay.look.never'));

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected set(change: Partial<ChatoverlaySettings>): void {
    void this.settings.update(change);
  }

  protected setColor(key: 'textColor' | 'background' | 'nameColor', hex: string, opacity: number): void {
    this.set({ [key]: chatoverlayColorString({ hex, opacity }) });
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected saveBots(): void {
    this.set({ hideBots: this.bots().split(/\r?\n/).map((line) => line.trim()).filter(Boolean) });
  }

  /** A new login asks for the chat permission too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
