import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { HOTKEY_ACTIONS, type Audience, type FolderId, type HotkeyAction, type HotkeyStatus, type LinkHandling, type ReadNames, type Settings } from '@rmc/api';
import { RMC } from '../../core/rmc';
import { StreamerMode } from '../../core/streamer';
import { I18n, type TextKey } from '../../i18n/i18n';
import { ReaderStore } from '../../stores/reader.store';
import { SettingsStore } from '../../stores/settings.store';
import { HotkeyField } from '../../ui/hotkey-field';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';
import { Toggle } from '../../ui/toggle';

/** Everything adjustable: how messages are read, who is read, spam filters, and the app itself. */
@Component({
  selector: 'rmc-settings',
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
              <div class="card-icon accent"><rmc-icon name="volume" /></div>
              <h2>{{ t('settings.reading') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.names') }}</div>
                <div class="hint">{{ t('settings.namesHint') }}</div>
              </div>
            </div>
            <rmc-segmented [options]="nameOptions()" [value]="s.readNames" (valueChange)="set({ readNames: $event })" />
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.template') }}</div>
                <div class="hint">{{ t('settings.templateHint') }}</div>
              </div>
              <div class="control">
                <input class="input template" [value]="template()" [placeholder]="t('settings.templatePlaceholder')"
                       (input)="template.set(read($event))" (change)="saveTemplate()" (keydown.enter)="saveTemplate()" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.pauseBetween') }}</div>
                <div class="hint">{{ t('settings.pauseBetweenHint') }}</div>
              </div>
              <div class="control wide"><rmc-slider [value]="s.pauseBetween" [min]="0" [max]="5" [step]="0.1" [format]="seconds" [label]="t('settings.pauseBetween')" (changed)="set({ pauseBetween: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.maxLength') }}</div>
                <div class="hint">{{ t('settings.maxLengthHint') }}</div>
              </div>
              <div class="control wide"><rmc-slider [value]="s.maxLength" [min]="40" [max]="500" [step]="10" [format]="chars" [label]="t('settings.maxLength')" (changed)="set({ maxLength: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.maxQueue') }}</div>
                <div class="hint">{{ t('settings.maxQueueHint') }}</div>
              </div>
              <div class="control wide"><rmc-slider [value]="s.maxQueue" [min]="1" [max]="50" [step]="1" [label]="t('settings.maxQueue')" (changed)="set({ maxQueue: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.modDelay') }}</div>
                <div class="hint">{{ t('settings.modDelayHint') }}</div>
              </div>
              <div class="control wide"><rmc-slider [value]="s.modDelay" [min]="0" [max]="15" [step]="0.5" [format]="secondsOff" [label]="t('settings.modDelay')" (changed)="set({ modDelay: $event })" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="user" /></div>
              <h2>{{ t('settings.who') }}</h2>
            </div>
            <rmc-segmented [options]="audienceOptions()" [value]="s.audience" (valueChange)="set({ audience: $event })" />
            @if (s.audience === 'reward') {
              <div class="reward row wrap">
                <rmc-icon name="gift" />
                <span class="spacer small">{{ s.rewardId ? t('settings.rewardSet') : t('settings.rewardMissing') }}</span>
                @if (reader.status()?.learningReward) {
                  <span class="chip live"><span class="dot pulse"></span>{{ t('settings.rewardLearning') }}</span>
                  <button type="button" class="btn sm ghost" (click)="reader.cancelLearnReward()">{{ t('common.cancel') }}</button>
                } @else {
                  <button type="button" class="btn sm" (click)="reader.learnReward()">{{ t('settings.rewardLearn') }}</button>
                }
              </div>
              <p class="faint small">{{ t('settings.rewardHint') }}</p>
            }
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.readOwn') }}</div>
                <div class="hint">{{ t('settings.readOwnHint') }}</div>
              </div>
              <div class="control"><rmc-toggle [checked]="s.readOwn" [label]="t('settings.readOwn')" (checkedChange)="set({ readOwn: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.sharedChat') }}</div>
                <div class="hint">{{ t('settings.sharedChatHint') }}</div>
              </div>
              <div class="control"><rmc-toggle [checked]="s.sharedChat" [label]="t('settings.sharedChat')" (checkedChange)="set({ sharedChat: $event })" /></div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="filter" /></div>
              <div>
                <h2>{{ t('settings.filters') }}</h2>
                <p class="faint small">{{ t('settings.filtersHint') }}</p>
              </div>
            </div>
            <div class="grid inner">
              <div class="span-6">
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.skipCommands') }}</div>
                    <div class="hint">{{ t('settings.skipCommandsHint') }}</div>
                  </div>
                  <div class="control"><rmc-toggle [checked]="s.skipCommands" [label]="t('settings.skipCommands')" (checkedChange)="set({ skipCommands: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.links') }}</div>
                    <div class="hint">{{ t('settings.linksHint') }}</div>
                  </div>
                </div>
                <rmc-segmented [options]="linkOptions()" [value]="s.links" (valueChange)="set({ links: $event })" />
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.collapseRepeats') }}</div>
                    <div class="hint">{{ t('settings.collapseRepeatsHint') }}</div>
                  </div>
                  <div class="control"><rmc-toggle [checked]="s.collapseRepeats" [label]="t('settings.collapseRepeats')" (checkedChange)="set({ collapseRepeats: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.cleanNames') }}</div>
                    <div class="hint">{{ t('settings.cleanNamesHint') }}</div>
                  </div>
                  <div class="control"><rmc-toggle [checked]="s.cleanNames" [label]="t('settings.cleanNames')" (checkedChange)="set({ cleanNames: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.duplicates') }}</div>
                    <div class="hint">{{ t('settings.duplicatesHint') }}</div>
                  </div>
                  <div class="control wide"><rmc-slider [value]="s.duplicateSeconds" [min]="0" [max]="120" [step]="5" [format]="secondsOff" [label]="t('settings.duplicates')" (changed)="set({ duplicateSeconds: $event })" /></div>
                </div>
                <div class="setting">
                  <div class="text">
                    <div class="title">{{ t('settings.userLimit') }}</div>
                    <div class="hint">{{ t('settings.userLimitHint') }}</div>
                  </div>
                  <div class="control wide"><rmc-slider [value]="s.userLimit" [min]="0" [max]="20" [step]="1" [format]="perMinute" [label]="t('settings.userLimit')" (changed)="set({ userLimit: $event })" /></div>
                </div>
              </div>
              <div class="span-6">
                <div class="field">
                  <label for="ignored">{{ t('settings.ignoredUsers') }}</label>
                  <textarea id="ignored" class="input area" spellcheck="false" [value]="ignored()" (input)="ignored.set(read($event))" (change)="saveList('ignoredUsers', ignored())"></textarea>
                  <p class="faint small">{{ t('settings.ignoredUsersHint') }}</p>
                </div>
                <div class="field">
                  <label for="blocked">{{ t('settings.blockedWords') }}</label>
                  <textarea id="blocked" class="input area" spellcheck="false" [value]="blocked()" (input)="blocked.set(read($event))" (change)="saveList('blockedWords', blocked())"></textarea>
                  <p class="faint small">{{ t('settings.blockedWordsHint') }}</p>
                </div>
              </div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="user" /></div>
              <div>
                <h2>{{ t('settings.speaking') }}</h2>
                <p class="faint small">{{ t('settings.speakingHint') }}</p>
              </div>
            </div>
            <div class="grid inner">
              <div class="field span-6">
                <label for="nicknames">{{ t('settings.nicknames') }}</label>
                <textarea id="nicknames" class="input area" spellcheck="false" [placeholder]="'xx_dark_lord_xx = Lord'" [value]="nicknames()"
                          (input)="nicknames.set(read($event))" (change)="saveLookup('nicknames', nicknames())"></textarea>
                <p class="faint small">{{ t('settings.nicknamesHint') }}</p>
              </div>
              <div class="field span-6">
                <label for="pronunciations">{{ t('settings.pronunciations') }}</label>
                <textarea id="pronunciations" class="input area" spellcheck="false" [placeholder]="'gg = good game'" [value]="pronunciations()"
                          (input)="pronunciations.set(read($event))" (change)="saveLookup('pronunciations', pronunciations())"></textarea>
                <p class="faint small">{{ t('settings.pronunciationsHint') }}</p>
              </div>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><rmc-icon name="skip" /></div>
              <div>
                <h2>{{ t('settings.hotkeys') }}</h2>
                <p class="faint small">{{ t('settings.hotkeysHint') }}</p>
              </div>
            </div>
            @for (action of hotkeyActions; track action) {
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t(hotkeyTitle(action)) }}</div>
                </div>
                <div class="control">
                  <rmc-hotkey-field [value]="s.hotkeys[action]" [state]="hotkeyStatus()?.[action] ?? 'off'" (changed)="setHotkey(action, $event)" />
                </div>
              </div>
            }
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon"><rmc-icon name="pc" /></div>
              <h2>{{ t('settings.app') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.language') }}</div>
                <div class="hint">{{ t('settings.languageHint') }}</div>
              </div>
              <div class="control"><rmc-segmented [options]="appLanguages" [value]="s.language" (valueChange)="set({ language: $event })" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.streamerMode') }}</div>
                <div class="hint">{{ t('settings.streamerModeHint') }}</div>
              </div>
              <div class="control"><rmc-toggle [checked]="streamer.enabled()" [label]="t('settings.streamerMode')" (checkedChange)="streamer.toggle()" /></div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.port') }}</div>
                <div class="hint">{{ t('settings.portHint') }}</div>
              </div>
              <div class="control">
                <input class="input port num" type="number" min="1024" max="65535" [value]="port()" (input)="port.set(read($event))" (change)="savePort()" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('settings.folders') }}</div>
                <div class="hint">{{ t('settings.foldersHint') }}</div>
              </div>
              <div class="control">
                <button type="button" class="btn sm" (click)="open('data')"><rmc-icon name="folder" [size]="14" />{{ t('settings.folderData') }}</button>
                <button type="button" class="btn sm" (click)="open('logs')"><rmc-icon name="folder" [size]="14" />{{ t('settings.folderLogs') }}</button>
              </div>
            </div>
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
    .port { width: 110px; }
  `,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsStore);
  protected readonly reader = inject(ReaderStore);
  protected readonly streamer = inject(StreamerMode);
  private readonly rmc = inject(RMC);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly appLanguages: SegmentOption<string>[] = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];
  protected readonly nameOptions = computed<SegmentOption<ReadNames>[]>(() => [
    { value: 'changed', label: this.t('settings.namesChanged') },
    { value: 'always', label: this.t('settings.namesAlways') },
    { value: 'never', label: this.t('settings.namesNever') },
  ]);
  protected readonly audienceOptions = computed<SegmentOption<Audience>[]>(() => [
    { value: 'all', label: this.t('settings.audienceAll') },
    { value: 'privileged', label: this.t('settings.audiencePrivileged') },
    { value: 'reward', label: this.t('settings.audienceReward') },
  ]);
  protected readonly linkOptions = computed<SegmentOption<LinkHandling>[]>(() => [
    { value: 'word', label: this.t('settings.linksWord') },
    { value: 'remove', label: this.t('settings.linksRemove') },
    { value: 'skip-message', label: this.t('settings.linksSkip') },
  ]);

  /** Typed values, saved on change (the main process validates and returns what it kept). */
  protected readonly template = linkedSignal(() => this.settings.settings()?.template ?? '');
  protected readonly ignored = linkedSignal(() => (this.settings.settings()?.ignoredUsers ?? []).join('\n'));
  protected readonly blocked = linkedSignal(() => (this.settings.settings()?.blockedWords ?? []).join('\n'));
  protected readonly port = linkedSignal(() => String(this.settings.settings()?.serverPort ?? ''));
  protected readonly nicknames = linkedSignal(() => lookupText(this.settings.settings()?.nicknames));
  protected readonly pronunciations = linkedSignal(() => lookupText(this.settings.settings()?.pronunciations));

  protected readonly hotkeyActions = HOTKEY_ACTIONS;
  protected readonly hotkeyStatus = signal<HotkeyStatus | null>(null);

  constructor() {
    void this.rmc.hotkeyStatus().then((status) => this.hotkeyStatus.set(status), () => undefined);
    const off = this.rmc.onHotkeyStatus((status) => this.hotkeyStatus.set(status));
    inject(DestroyRef).onDestroy(off);
  }

  protected readonly seconds = (value: number) => `${this.i18n.number(value, 1)} s`;
  protected readonly secondsOff = (value: number) => (value === 0 ? this.t('common.off') : `${this.i18n.number(value, value % 1 ? 1 : 0)} s`);
  protected readonly chars = (value: number) => this.t('settings.chars', { n: value });
  protected readonly perMinute = (value: number) => (value === 0 ? this.t('common.off') : this.t('settings.perMinute', { n: value }));

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

  protected savePort(): void {
    const port = Number(this.port());
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) this.set({ serverPort: port });
    else this.port.set(String(this.settings.settings()?.serverPort ?? ''));
  }

  protected open(folder: FolderId): void {
    void this.rmc.openFolder(folder);
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
    return `hotkey.${action}` as TextKey;
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
