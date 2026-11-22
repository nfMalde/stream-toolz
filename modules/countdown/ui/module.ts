// Countdown in the UI: its pages (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { COUNTDOWN } from '@stz/api';
import type { ModuleUi } from '@shell/core/module-ui';

export const countdownUi: ModuleUi = {
  id: COUNTDOWN,
  name: 'Countdown',
  description: 'countdown.module.description',
  icon: 'clock',
  pages: [{ path: 'timers', label: 'countdown.nav.timers', icon: 'clock' }],
  routes: [{ path: 'timers', loadComponent: () => import('./pages/timers/timers').then((m) => m.CountdownPage) }],
};
