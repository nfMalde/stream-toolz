import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { defaultEventText, type ChannelEventKind, type EventGroup } from '@stz/api';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { LanguagePacksStore } from '../../stores/language-packs.store';
import { ReaderStore } from '../../stores/reader.store';
import { ReadMyChatSettingsStore } from '../../stores/settings.store';
import { TwitchStore } from '@shell/stores/twitch.store';
import { Icon, type IconName } from '@shell/ui/icon';
import { Toggle } from '@shell/ui/toggle';

interface Group {
  id: EventGroup;
  icon: IconName;
  kinds: ChannelEventKind[];
}

const GROUPS: Group[] = [
  { id: 'follow', icon: 'heart', kinds: ['follow'] },
  { id: 'sub', icon: 'sparkle', kinds: ['sub', 'prime', 'resub'] },
  { id: 'gift', icon: 'gift', kinds: ['gift', 'communityGift'] },
  { id: 'raid', icon: 'live', kinds: ['raid'] },
];

/** Twitch events read aloud (follows, subs, gifted subs, raids): on or off, own words, a test for each. */
@Component({
  selector: 'stz-events',
  imports: [Icon, Toggle],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('readmychat.events.eyebrow') }}</div>
          <h1>{{ t('readmychat.events.title') }}</h1>
          <p class="muted intro">{{ t('readmychat.events.intro') }}</p>
        </div>
      </div>

      @if (s) {
        @if (s.events.follow && follows() === 'needs-login') {
          <div class="banner warn">
            <stz-icon name="heart" /><span class="spacer">{{ t('readmychat.events.needsLogin') }}</span>
            <button type="button" class="btn sm" (click)="relogin()">{{ t('readmychat.events.relogin') }}</button>
          </div>
        } @else if (s.events.follow && follows() === 'unavailable') {
          <div class="banner info"><stz-icon name="heart" /><span class="spacer">{{ t('readmychat.events.unavailable') }}</span></div>
        }

        <div class="grid">
          @for (group of groups; track group.id) {
            <section class="card span-6" [class.off]="!s.events[group.id]">
              <div class="card-header">
                <div class="card-icon accent"><stz-icon [name]="group.icon" /></div>
                <div class="spacer">
                  <h2>{{ t(groupKey(group.id, '')) }}</h2>
                  <p class="faint small">{{ t(groupKey(group.id, 'Hint')) }}</p>
                </div>
                <stz-toggle [checked]="s.events[group.id]" [label]="t(groupKey(group.id, ''))" (checkedChange)="setGroup(group.id, $event)" />
              </div>
              @for (kind of group.kinds; track kind) {
                <div class="field">
                  <span class="label">{{ t(kindKey(kind)) }}</span>
                  <div class="row">
                    <input class="input spacer" maxlength="160" [value]="s.eventTexts[kind]" [placeholder]="placeholder(kind)" [title]="s.eventTexts[kind] || placeholder(kind)" [attr.aria-label]="t(kindKey(kind))"
                           (change)="saveText(kind, $event)" (keydown.enter)="saveText(kind, $event)" />
                    <button type="button" class="btn sm" [title]="t('readmychat.events.testHint')" (click)="reader.testEvent(kind)"><stz-icon name="play" [size]="14" />{{ t('readmychat.events.test') }}</button>
                  </div>
                </div>
              }
            </section>
          }

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><stz-icon name="info" /></div>
              <h2>{{ t('readmychat.events.placeholders') }}</h2>
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
    .card.off .field { opacity: .5; }
    .card-header .spacer p { margin-top: 2px; }
    .field { margin-top: 12px; }
    .field .label { display: block; margin-bottom: 6px; }
    .placeholders { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; }
    .placeholders li { display: contents; }
    .placeholders code { padding: 1px 6px; border-radius: 6px; background: var(--bg-elevated); border: 1px solid var(--border); justify-self: start; }
  `,
})
export class EventsPage {
  protected readonly settings = inject(ReadMyChatSettingsStore);
  protected readonly reader = inject(ReaderStore);
  private readonly packs = inject(LanguagePacksStore);
  private readonly twitch = inject(TwitchStore);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  protected readonly groups = GROUPS;
  protected readonly placeholders = ['name', 'count', 'months', 'recipient', 'tier'];
  protected readonly follows = computed(() => this.twitch.status()?.features?.follows);

  /** The default words in the chat's main language (from its pack); with a count, the form for several. */
  protected placeholder(kind: ChannelEventKind): string {
    return defaultEventText(kind, this.packs.mainId(), 2, this.packs.packs());
  }

  protected groupKey(group: EventGroup, suffix: '' | 'Hint'): TextKey {
    return `readmychat.events.${group}${suffix}` as TextKey;
  }

  protected kindKey(kind: ChannelEventKind): TextKey {
    return `readmychat.events.kind.${kind}` as TextKey;
  }

  protected placeholderKey(name: string): TextKey {
    return `readmychat.events.placeholder.${name}` as TextKey;
  }

  protected setGroup(group: EventGroup, on: boolean): void {
    const events = this.settings.settings()?.events;
    if (events) void this.settings.update({ events: { ...events, [group]: on } });
  }

  protected saveText(kind: ChannelEventKind, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    const texts = this.settings.settings()?.eventTexts;
    if (texts && texts[kind] !== value) void this.settings.update({ eventTexts: { ...texts, [kind]: value } });
  }

  /** A new login asks for the follower list too; the Twitch page shows its code. */
  protected relogin(): void {
    void this.twitch.login();
    void this.router.navigate(['/twitch']);
  }
}
