import { Component, computed, inject, input, signal } from '@angular/core';
import { STZ } from '../../core/stz';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { TwitchStore } from '../../stores/twitch.store';
import { Icon } from '../../ui/icon';
import { Secret, SecretField } from '../../ui/secret';

/**
 * The streamer's own Twitch app, registered as "Public": a step-by-step guide for the developer console, then
 * only its Client ID (a public app has no secret). Twitch checks the ID when it is saved.
 */
@Component({
  selector: 'stz-app-form',
  imports: [Icon, Secret, SecretField],
  template: `
    @if (twitch.hasApp() && !replacing()) {
      <div class="saved">
        <div class="card-icon ok-icon"><stz-icon name="key" /></div>
        <div class="spacer">
          <b>{{ t('app.saved') }}</b>
          <div class="faint small">{{ t('app.savedHint') }} <stz-secret [value]="'…' + (twitch.status()?.clientIdHint ?? '')" /></div>
        </div>
        <button type="button" class="btn sm" (click)="replacing.set(true)">{{ t('app.replace') }}</button>
        <button type="button" class="btn sm ghost" (click)="remove()"><stz-icon name="trash" [size]="14" />{{ t('app.remove') }}</button>
      </div>
    } @else {
      @if (showGuide()) {
        <ol class="steps">
          <li>
            <div>
              <b>{{ t('app.step.2fa') }}</b>
              <p class="faint small">{{ t('app.step.2faHint') }}</p>
              <button type="button" class="btn sm" (click)="open('twitchSecurity')"><stz-icon name="external" [size]="14" />{{ t('app.step.2faLink') }}</button>
            </div>
          </li>
          <li>
            <div>
              <b>{{ t('app.step.console') }}</b>
              <p class="faint small">{{ t('app.step.consoleHint') }}</p>
              <button type="button" class="btn sm" (click)="open('twitchConsole')"><stz-icon name="external" [size]="14" />{{ t('app.step.consoleLink') }}</button>
            </div>
          </li>
          <li>
            <div>
              <b>{{ t('app.step.form') }}</b>
              <ul class="form-values faint small">
                <li>{{ t('app.step.formName') }}</li>
                <li>{{ t('app.step.formRedirect') }} <code>http://localhost</code></li>
                <li>{{ t('app.step.formCategory') }}</li>
                <li><b class="accent-text">{{ t('app.step.formType') }}</b></li>
              </ul>
            </div>
          </li>
          <li>
            <div>
              <b>{{ t('app.step.clientId') }}</b>
              <p class="faint small">{{ t('app.step.clientIdHint') }}</p>
            </div>
          </li>
        </ol>
      }

      <form class="fields" (submit)="$event.preventDefault(); save()">
        <div class="field">
          <label for="client-id">{{ t('app.clientId') }}</label>
          <stz-secret-field>
            <input id="client-id" class="input mono" autocomplete="off" spellcheck="false" [value]="clientId()"
                   (input)="clientId.set(value($event))" [placeholder]="t('app.clientIdPlaceholder')" />
          </stz-secret-field>
        </div>
        @if (twitch.saveError(); as error) {
          <div class="banner danger"><stz-icon name="alert" />{{ t(errorKey(error)) }}</div>
        }
        <div class="row">
          <p class="faint small hint"><stz-icon name="lock" [size]="14" /> {{ t(encrypted() ? 'app.encrypted' : 'app.notEncrypted') }}</p>
          @if (replacing()) {
            <button type="button" class="btn ghost" (click)="replacing.set(false)">{{ t('common.cancel') }}</button>
          }
          <button type="submit" class="btn primary" [disabled]="!complete() || twitch.saving()">
            <stz-icon [name]="twitch.saving() ? 'refresh' : 'check'" [size]="16" />{{ twitch.saving() ? t('app.checking') : t('app.save') }}
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .saved { display: flex; align-items: center; gap: 12px; }
    .ok-icon { background: var(--ok-soft); color: var(--ok); }
    .steps { margin-bottom: 18px; }
    .steps b { display: block; }
    .steps p { margin: 2px 0 8px; max-width: 640px; }
    .form-values { margin: 4px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; list-style: disc; }
    /* Plain bullets: the numbering of the steps must not count these. */
    .steps .form-values li { display: list-item; counter-increment: none; }
    .steps .form-values li::before { content: none; }
    .form-values b { display: inline; }
    .accent-text { color: var(--accent-text); }
    .fields { display: flex; flex-direction: column; gap: 12px; }
    .hint { flex: 1; display: flex; gap: 6px; align-items: flex-start; }
  `,
})
export class AppForm {
  /** With the developer console steps (the setup assistant and an empty Twitch page). */
  readonly showGuide = input(true);

  protected readonly twitch = inject(TwitchStore);
  private readonly settings = inject(SettingsStore);
  private readonly stz = inject(STZ);
  protected readonly t = inject(I18n).t;

  protected readonly clientId = signal('');
  protected readonly replacing = signal(false);
  protected readonly complete = computed(() => this.clientId().trim().length >= 20);
  protected readonly encrypted = computed(() => this.settings.info()?.encryption !== 'none');

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected errorKey(code: string): TextKey {
    return code === 'invalid-client' ? 'app.error.invalid' : code === 'network' ? 'app.error.network' : 'app.error.unknown';
  }

  protected async save(): Promise<void> {
    if (!this.complete()) return;
    if (await this.twitch.saveApp({ clientId: this.clientId() })) {
      this.clientId.set('');
      this.replacing.set(false);
    }
  }

  protected remove(): Promise<void> {
    return this.twitch.removeApp();
  }

  protected open(link: 'twitchConsole' | 'twitchSecurity'): void {
    void this.stz.openLink(link);
  }
}
