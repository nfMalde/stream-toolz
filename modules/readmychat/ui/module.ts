// ReadMyChat in the UI: its pages, the reading switch at the bottom of the navigation, and its part of the setup
// assistant (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { computed, inject } from '@angular/core';
import { packFor, READMYCHAT } from '@stz/api';
import type { ModuleGuide, ModuleUi } from '@shell/core/module-ui';
import { I18n } from '@shell/i18n/i18n';
import { OutputStep, VoiceStep } from './guide/steps';
import { ReadingToggle } from './rail/reading-toggle';
import { LanguagePacksStore } from './stores/language-packs.store';
import { ReaderStore } from './stores/reader.store';
import { ReadMyChatSettingsStore } from './stores/settings.store';
import { VoicesStore } from './stores/voices.store';

function guide(): ModuleGuide {
  const voices = inject(VoicesStore);
  const reader = inject(ReaderStore);
  const settings = inject(ReadMyChatSettingsStore);
  const packs = inject(LanguagePacksStore);
  const t = inject(I18n).t;
  return {
    steps: [
      { id: `${READMYCHAT}.voice`, title: 'readmychat.guide.voice', icon: 'mic', component: VoiceStep, done: voices.hasInstalledVoice },
      { id: `${READMYCHAT}.output`, title: 'readmychat.guide.output', icon: 'broadcast', component: OutputStep },
    ],
    // The chat is read in the language chosen for the app (the pack for it, English without one); both can be changed separately later.
    languageChosen: (language) => void settings.update({ speechLanguage: packFor(language, packs.packs())?.locale ?? 'en-US' }),
    checks: computed(() => [{ ok: voices.hasInstalledVoice(), label: voices.hasInstalledVoice() ? 'readmychat.guide.check.voice' : 'readmychat.guide.check.noVoice' }]),
    test: { label: 'readmychat.guide.testMessage', hint: 'readmychat.guide.testHint', run: () => void reader.test(t('readmychat.guide.testText')) },
  };
}

export const readMyChatUi: ModuleUi = {
  id: READMYCHAT,
  name: 'ReadMyChat',
  description: 'readmychat.module.description',
  icon: 'chat',
  pages: [
    { path: 'live', label: 'readmychat.nav.live', icon: 'chat' },
    { path: 'events', label: 'readmychat.nav.events', icon: 'gift' },
    { path: 'voices', label: 'readmychat.nav.voices', icon: 'mic' },
    { path: 'output', label: 'readmychat.nav.output', icon: 'broadcast' },
    { path: 'settings', label: 'nav.settings', icon: 'sliders' },
  ],
  routes: [
    { path: 'live', loadComponent: () => import('./pages/live/live').then((m) => m.Live) },
    { path: 'events', loadComponent: () => import('./pages/events/events').then((m) => m.EventsPage) },
    { path: 'voices', loadComponent: () => import('./pages/voices/voices').then((m) => m.Voices) },
    { path: 'output', loadComponent: () => import('./pages/output/output').then((m) => m.Output) },
    { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.ReadMyChatSettingsPage) },
  ],
  railControl: ReadingToggle,
  guide,
};
