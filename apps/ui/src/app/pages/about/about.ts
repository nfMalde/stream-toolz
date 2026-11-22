import { Component, computed, inject, resource, signal } from '@angular/core';
import type { LicenseEntry } from '@stz/api';
import { PRODUCT_BYLINE, PRODUCT_NAME } from '@stz/api';
import { LINK_ICONS, LINK_NAMES, Links } from '../../core/links';
import { STZ } from '../../core/stz';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';

/** About (laid out as in GT Toolz): Maldö's logo, privacy, support and channels, the third-party licenses. */
@Component({
  selector: 'stz-about',
  imports: [Icon],
  template: `
    <div class="page">
      <section class="card hero">
        <img src="maldoe-512.png" alt="Maldö" width="132" height="132" />
        <div class="hero-text">
          <div class="eyebrow">{{ t('about.eyebrow') }}</div>
          <h1>{{ product }} <span class="byline">{{ byline }}</span></h1>
          <p class="muted">{{ t('about.tagline') }}</p>
          <div class="row wrap">
            <span class="chip accent">{{ t('about.version') }} {{ settings.info()?.version }}</span>
            <span class="chip ok"><stz-icon name="heart" [size]="13" />{{ t('about.free') }}</span>
          </div>
        </div>
      </section>

      <div class="columns">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><stz-icon name="shield" /></div>
            <h2>{{ t('about.privacy') }}</h2>
          </div>
          <ul class="checks">
            @for (key of privacy; track key) {
              <li><stz-icon name="check" [size]="16" [weight]="2.4" />{{ t(key) }}</li>
            }
          </ul>
          <p class="faint small">{{ t('about.privacyNote') }}</p>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><stz-icon name="heart" /></div>
            <h2>{{ t('about.support') }}</h2>
          </div>
          <p class="muted">{{ t('about.supportText') }}</p>
          @if (links.support().length) {
            <div class="row wrap links">
              @for (id of links.support(); track id) {
                <button type="button" class="btn primary" (click)="links.open(id)"><stz-icon [name]="icons[id]" [size]="15" />{{ t('links.donate', { name: names[id] }) }}</button>
              }
            </div>
          }
          @if (links.channels().length) {
            <div class="divider"></div>
            <p class="muted">{{ t('about.channelsText') }}</p>
            <div class="row wrap links">
              @for (id of links.channels(); track id) {
                <button type="button" class="btn" (click)="links.open(id)"><stz-icon [name]="icons[id]" [size]="15" />{{ names[id] }}</button>
              }
            </div>
          }
          <div class="divider"></div>
          <p class="faint small">{{ t('about.disclaimer', { product: product }) }}</p>
        </section>
      </div>

      <section class="card">
        <div class="card-header">
          <div class="card-icon accent"><stz-icon name="heart" /></div>
          <div>
            <h2>{{ t('about.licenses') }}</h2>
            <p class="faint small">{{ t('about.licensesHint') }}</p>
          </div>
          <span class="spacer"></span>
          <button type="button" class="btn sm" (click)="chromium()"><stz-icon name="external" [size]="14" />{{ t('about.chromium') }}</button>
        </div>
        @for (group of groups(); track group.id) {
          <h3 class="group">{{ t(group.title) }}</h3>
          <div class="licenses">
            @for (entry of group.entries; track entry.name) {
              <div class="license">
                <div class="license-row">
                  <div class="license-name">
                    <b>{{ entry.name }}</b>
                    @if (entry.version) { <span class="faint mono small">{{ entry.version }}</span> }
                  </div>
                  <span class="faint small usage">{{ t(usedFor(entry)) }}</span>
                  <span class="chip">{{ entry.license }}</span>
                  @if (entry.text) {
                    <button type="button" class="btn sm ghost" (click)="toggle(entry.name)">
                      {{ open().has(entry.name) ? t('about.hideText') : t('about.showText') }}
                      <stz-icon [name]="open().has(entry.name) ? 'chevronDown' : 'chevronRight'" [size]="14" />
                    </button>
                  }
                </div>
                @if (entry.notice) {
                  <div class="faint small">{{ t(notice(entry)) }}</div>
                }
                @if (entry.url) {
                  <div class="faint small mono selectable">{{ entry.url }}</div>
                }
                @if (open().has(entry.name) && entry.text) {
                  <pre class="license-text selectable">{{ entry.text }}</pre>
                }
              </div>
            }
          </div>
        }
      </section>

      @if (settings.info(); as info) {
        <p class="faint small">v{{ info.version }} · Electron {{ info.electron }} · Chromium {{ info.chrome }} · Node.js {{ info.node }}</p>
      }
    </div>
  `,
  styles: `
    .hero { display: flex; gap: 22px; align-items: center; padding: 26px; }
    .hero img { flex: none; filter: drop-shadow(0 12px 26px rgba(var(--accent-rgb), 0.3)); }
    .hero-text { display: flex; flex-direction: column; gap: 8px; }
    .hero-text .byline { font-size: 16px; font-weight: 500; color: var(--text-3); }
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    @media (max-width: 1100px) { .columns { grid-template-columns: 1fr; } }
    .checks { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .checks li { display: flex; gap: 10px; align-items: flex-start; }
    .checks stz-icon { color: var(--ok); margin-top: 2px; }
    .links { margin-top: 12px; }
    .group { margin: 16px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-3); }
    .licenses { display: flex; flex-direction: column; }
    .license { padding: 12px 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
    .license:first-child { border-top: 0; }
    .license-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .license-name { display: flex; gap: 8px; align-items: baseline; min-width: 240px; }
    .usage { flex: 1; }
    .license-text {
      margin: 8px 0 0; padding: 14px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border);
      max-height: 280px; overflow: auto; white-space: pre-wrap; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-2);
    }
  `,
})
export class About {
  protected readonly settings = inject(SettingsStore);
  private readonly stz = inject(STZ);
  protected readonly t = inject(I18n).t;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;
  /** Donation and Maldö's channels (opened in the browser, only on a click). */
  protected readonly links = inject(Links);
  protected readonly names = LINK_NAMES;
  protected readonly icons = LINK_ICONS;
  protected readonly privacy: TextKey[] = ['about.privacy1', 'about.privacy2', 'about.privacy3', 'about.privacy4'];

  private readonly licenses = resource({ loader: () => this.stz.licenses() });
  protected readonly groups = computed(() => {
    const entries = this.licenses.value() ?? [];
    return [
      { id: 'bundled', title: 'about.bundled' as TextKey, entries: entries.filter((e) => e.shipped === 'bundled') },
      { id: 'download', title: 'about.download' as TextKey, entries: entries.filter((e) => e.shipped === 'download') },
    ].filter((g) => g.entries.length);
  });
  protected readonly open = signal(new Set<string>());

  protected toggle(name: string): void {
    const next = new Set(this.open());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.open.set(next);
  }

  protected usedFor(entry: LicenseEntry): TextKey {
    return `about.usedFor.${entry.usedFor}` as TextKey;
  }

  protected notice(entry: LicenseEntry): TextKey {
    return `about.notice.${entry.notice}` as TextKey;
  }

  protected chromium(): void {
    void this.stz.openChromiumLicenses();
  }
}
