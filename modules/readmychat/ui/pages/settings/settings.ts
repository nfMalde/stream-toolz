import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HOTKEY_ACTIONS, READMYCHAT, type Audience, type HotkeyAction, type HotkeyState, type LinkHandling, type ReadNames, type Settings } from '@stz/api';
import { STZ } from '@shell/core/stz';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { HotkeyField } from '@shell/ui/hotkey-field';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { ReaderStore } from '../../stores/reader.store';
import { ReadMyChatSettingsStore } from '../../stores/settings.store';

/** ReadMyChat's settings: how messages are read, who is read, spam filters, shortcuts. The app's own are under /settings. */
@Component({
  selector: 'stz-readmychat-settings',
  imports: [Icon, Segmented, Slider, Toggle, HotkeyField],
  template: `
    @let s = settings.settings();
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('settings.eyebrow') }}</div>
          <h1>{{ t('settings.title') }}</h1>
        </div>
      </div>

      @if (s) {
        <div class="grid">
          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="volume" /></div>
              <h2>{{ t('readmychat.settings.reading') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.names') }}</div>
                <div class="hint">{{ t('readmychat.settings.namesHint') }}</div>
              </div>
            </div>
            <stz-segmented [options]="nameOptions()" [value]="s.readNames" (valueChange)="set({ readNames: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.template') }}</div>
                <div class="hint">{{ t('readmychat.settings.templateHint') }}</div>
              </div>
              <div class="control">
                <input class="input template" [value]="template()" [placeholder]="t('readmychat.settings.templatePlaceholder')"
                       (input)="template.set(read($event))" (change)="saveTemplate()" (keydown.enter)="saveTemplate()" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.pauseBetween') }}</div>
                <div class="hint">{{ t('readmychat.settings.pauseBetweenHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.pauseBetween" [min]="0" [max]="5" [step]="0.1" [format]="seconds" [label]="t('readmychat.settings.pauseBetween')" (changed)="set({ pauseBetween: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.maxLength') }}</div>
                <div class="hint">{{ t('readmychat.settings.maxLengthHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.maxLength" [min]="40" [max]="500" [step]="10" [format]="chars" [label]="t('readmychat.settings.maxLength')" (changed)="set({ maxLength: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.maxQueue') }}</div>
                <div class="hint">{{ t('readmychat.settings.maxQueueHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.maxQueue" [min]="1" [max]="50" [step]="1" [label]="t('readmychat.settings.maxQueue')" (changed)="set({ maxQueue: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.modDelay') }}</div>
                <div class="hint">{{ t('readmychat.settings.modDelayHint') }}</div>
              </div>
              <div class="control wide"><stz-slider [value]="s.modDelay" [min]="0" [max]="15" [step]="0.5" [format]="secondsOff" [label]="t('readmychat.settings.modDelay')" (changed)="set({ modDelay: $event })" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="user" /></div>
              <h2>{{ t('readmychat.settings.who') }}</h2>
            </div>
            <stz-segmented [options]="audienceOptions()" [value]="s.audience" (valueChange)="set({ audience: $event })" />
            @if (s.audience === 'reward') {
              <div class="reward row wrap">
                <stz-icon name="gift" />
                <span class="spacer small">{{ s.rewardId ? t('readmychat.settings.rewardSet') : t('readmychat.settings.rewardMissing') }}</span>
                @if (reader.status()?.learningReward) {
                  <span class="chip live"><span class="dot pulse"></span>{{ t('readmychat.settings.rewardLearning') }}</span>
                  <button type="button" class="btn sm ghost" (click)="reader.cancelLearnReward()">{{ t('common.cancel') }}</button>
                } @else {
                  <button type="button" class="btn sm" (click)="reader.learnReward()">{{ t('readmychat.settings.rewardLearn') }}</button>
                }
              </div>
              <p class="faint small">{{ t('readmychat.settings.rewardHint') }}</p>
            }
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.readOwn') }}</div>
                <div class="hint">{{ t('readmychat.settings.readOwnHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.readOwn" [label]="t('readmychat.settings.readOwn')" (checkedChange)="set({ readOwn: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('readmychat.settings.sharedChat') }}</div>
                <div class="hint">{{ t('readmychat.settings.sharedChatHint') }}</div>
              </div>
              <div class="control"><stz-toggle [checked]="s.sharedChat" [label]="t('readmychat.settings.sharedChat')" (checkedChange)="set({ sharedChat: $event })" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="filter" /></div>
              <div>
                <h2>{{ t('readmychat.settings.filters') }}</h2>
                <p class="faint small">{{ t('readmychat.settings.filtersHint') }}</p>
              </div>
            </div>
            <div class="grid inner">
              <div class="span-6">
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.skipCommands') }}</div>
                    <div class="hint">{{ t('readmychat.settings.skipCommandsHint') }}</div>
                  </div>
                  <div class="control"><stz-toggle [checked]="s.skipCommands" [label]="t('readmychat.settings.skipCommands')" (checkedChange)="set({ skipCommands: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.links') }}</div>
                    <div class="hint">{{ t('readmychat.settings.linksHint') }}</div>
                  </div>
                </div>
                <stz-segmented [options]="linkOptions()" [value]="s.links" (valueChange)="set({ links: $event })" />
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.collapseRepeats') }}</div>
                    <div class="hint">{{ t('readmychat.settings.collapseRepeatsHint') }}</div>
                  </div>
                  <div class="control"><stz-toggle [checked]="s.collapseRepeats" [label]="t('readmychat.settings.collapseRepeats')" (checkedChange)="set({ collapseRepeats: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.cleanNames') }}</div>
                    <div class="hint">{{ t('readmychat.settings.cleanNamesHint') }}</div>
                  </div>
                  <div class="control"><stz-toggle [checked]="s.cleanNames" [label]="t('readmychat.settings.cleanNames')" (checkedChange)="set({ cleanNames: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.duplicates') }}</div>
                    <div class="hint">{{ t('readmychat.settings.duplicatesHint') }}</div>
                  </div>
                  <div class="control wide"><stz-slider [value]="s.duplicateSeconds" [min]="0" [max]="120" [step]="5" [format]="secondsOff" [label]="t('readmychat.settings.duplicates')" (changed)="set({ duplicateSeconds: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('readmychat.settings.userLimit') }}</div>
                    <div class="hint">{{ t('readmychat.settings.userLimitHint') }}</div>
                  </div>
                  <div class="control wide"><stz-slider [value]="s.userLimit" [min]="0" [max]="20" [step]="1" [format]="perMinute" [label]="t('readmychat.settings.userLimit')" (changed)="set({ userLimit: $event })" /></div>
                </div>
              </div>
              <div class="span-6">
                <div class="field">
                  <label for="ignored">{{ t('readmychat.settings.ignoredUsers') }}</label>
                  <textarea id="ignored" class="input area" spellcheck="false" [value]="ignored()" (input)="ignored.set(read($event))" (change)="saveList('ignoredUsers', ignored())"></textarea>
                  <p class="faint small">{{ t('readmychat.settings.ignoredUsersHint') }}</p>
                </div>
                <div class="field">
                  <label for="blocked">{{ t('readmychat.settings.blockedWords') }}</label>
                  <textarea id="blocked" class="input area" spellcheck="false" [value]="blocked()" (input)="blocked.set(read($event))" (change)="saveList('blockedWords', blocked())"></textarea>
                  <p class="faint small">{{ t('readmychat.settings.blockedWordsHint') }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="user" /></div>
              <div>
                <h2>{{ t('readmychat.settings.speaking') }}</h2>
                <p class="faint small">{{ t('readmychat.settings.speakingHint') }}</p>
              </div>
            </div>
            <div class="grid inner">
              <div class="field span-6">
                <label for="nicknames">{{ t('readmychat.settings.nicknames') }}</label>
                <textarea id="nicknames" class="input area" spellcheck="false" [placeholder]="'xx_dark_lord_xx = Lord'" [value]="nicknames()"
                          (input)="nicknames.set(read($event))" (change)="saveLookup('nicknames', nicknames())"></textarea>
                <p class="faint small">{{ t('readmychat.settings.nicknamesHint') }}</p>
              </div>
              <div class="field span-6">
                <label for="pronunciations">{{ t('readmychat.settings.pronunciations') }}</label>
                <textarea id="pronunciations" class="input area" spellcheck="false" [placeholder]="'gg = good game'" [value]="pronunciations()"
                          (input)="pronunciations.set(read($event))" (change)="saveLookup('pronunciations', pronunciations())"></textarea>
                <p class="faint small">{{ t('readmychat.settings.pronunciationsHint') }}</p>
              </div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><stz-icon name="skip" /></div>
              <div>
                <h2>{{ t('readmychat.settings.hotkeys') }}</h2>
                <p class="faint small">{{ t('readmychat.settings.hotkeysHint') }}</p>
              </div>
            </div>
            @for (action of hotkeyActions; track action) {
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t(hotkeyTitle(action)) }}</div>
                </div>
                <div class="control">
                  <stz-hotkey-field [value]="s.hotkeys[action]" [state]="hotkeyStatus()?.[action] ?? 'off'" (changed)="setHotkey(action, $event)" />
                </div>
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .template { width: 280px; }
    .reward { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border); }
    .reward + p { margin-top: 6px; }
    .grid.inner { gap: 24px; }
    .field { margin-bottom: 14px; }
    .area { height: 120px; padding: 10px 12px; resize: vertical; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.5; }
  `,
})
export class ReadMyChatSettingsPage {
  protected readonly settings = inject(ReadMyChatSettingsStore);
  protected readonly reader = inject(ReaderStore);
  private readonly stz = inject(STZ);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly nameOptions = computed<SegmentOption<ReadNames>[]>(() => [
    { value: 'changed', label: this.t('readmychat.settings.namesChanged') },
    { value: 'always', label: this.t('readmychat.settings.namesAlways') },
    { value: 'never', label: this.t('readmychat.settings.namesNever') },
  ]);
  protected readonly audienceOptions = computed<SegmentOption<Audience>[]>(() => [
    { value: 'all', label: this.t('readmychat.settings.audienceAll') },
    { value: 'privileged', label: this.t('readmychat.settings.audiencePrivileged') },
    { value: 'reward', label: this.t('readmychat.settings.audienceReward') },
  ]);
  protected readonly linkOptions = computed<SegmentOption<LinkHandling>[]>(() => [
    { value: 'word', label: this.t('readmychat.settings.linksWord') },
    { value: 'remove', label: this.t('readmychat.settings.linksRemove') },
    { value: 'skip-message', label: this.t('readmychat.settings.linksSkip') },
  ]);

  /** Typed values, saved on change (the main process validates and returns what it kept). */
  protected readonly template = linkedSignal(() => this.settings.settings()?.template ?? '');
  protected readonly ignored = linkedSignal(() => (this.settings.settings()?.ignoredUsers ?? []).join('\n'));
  protected readonly blocked = linkedSignal(() => (this.settings.settings()?.blockedWords ?? []).join('\n'));
  protected readonly nicknames = linkedSignal(() => lookupText(this.settings.settings()?.nicknames));
  protected readonly pronunciations = linkedSignal(() => lookupText(this.settings.settings()?.pronunciations));

  protected readonly hotkeyActions = HOTKEY_ACTIONS;
  /** This module's shortcuts (the shell keeps those of all modules). */
  protected readonly hotkeyStatus = signal<Record<string, HotkeyState> | null>(null);

  constructor() {
    void this.stz.hotkeyStatus().then((status) => this.hotkeyStatus.set(status[READMYCHAT] ?? null), () => undefined);
    const off = this.stz.onHotkeyStatus((status) => this.hotkeyStatus.set(status[READMYCHAT] ?? null));
    inject(DestroyRef).onDestroy(off);
  }

  protected readonly seconds = (value: number) => `${this.i18n.number(value, 1)} s`;
  protected readonly secondsOff = (value: number) => (value === 0 ? this.t('common.off') : `${this.i18n.number(value, value % 1 ? 1 : 0)} s`);
  protected readonly chars = (value: number) => this.t('readmychat.settings.chars', { n: value });
  protected readonly perMinute = (value: number) => (value === 0 ? this.t('common.off') : this.t('readmychat.settings.perMinute', { n: value }));

  protected set(change: Partial<Settings>): void {
    void this.settings.update(change);
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected saveTemplate(): void {
    const value = this.template().trim();
    // Without {message} the main process keeps the old template; show it again.
    if (value && !value.includes('{message}')) {
      this.template.set(this.settings.settings()?.template ?? '');
      return;
    }
    this.set({ template: value });
  }

  protected saveList(key: 'ignoredUsers' | 'blockedWords', text: string): void {
    this.set({ [key]: text.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean) });
  }

  /** "login = name" / "word = spoken", one per line; the main process cleans the keys. */
  protected saveLookup(key: 'nicknames' | 'pronunciations', text: string): void {
    const entries = text
      .split('\n')
      .map((line) => line.split('='))
      .filter((parts) => parts.length >= 2)
      .map(([from, ...to]) => [from!.trim(), to.join('=').trim()] as const)
      .filter(([from, to]) => from && to);
    this.set({ [key]: Object.fromEntries(entries) });
  }

  protected hotkeyTitle(action: HotkeyAction): TextKey {
    return `readmychat.hotkey.${action}` as TextKey;
  }

  protected setHotkey(action: HotkeyAction, accelerator: string): void {
    const hotkeys = this.settings.settings()?.hotkeys;
    if (hotkeys) this.set({ hotkeys: { ...hotkeys, [action]: accelerator } });
  }
}

function lookupText(lookup: Record<string, string> | undefined): string {
  return Object.entries(lookup ?? {})
    .map(([from, to]) => `${from} = ${to}`)
    .join('\n');
}
