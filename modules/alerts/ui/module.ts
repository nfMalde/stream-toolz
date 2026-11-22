// Alerts in the UI: its pages (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { ALERTS } from '@stz/api';
import type { ModuleUi } from '@shell/core/module-ui';

export const alertsUi: ModuleUi = {
  id: ALERTS,
  name: 'Alerts',
  description: 'alerts.module.description',
  icon: 'sparkle',
  pages: [
    { path: 'alerts', label: 'alerts.nav.alerts', icon: 'sparkle' },
    { path: 'look', label: 'alerts.nav.look', icon: 'eye' },
  ],
  routes: [
    { path: 'alerts', loadComponent: () => import('./pages/alerts/alerts').then((m) => m.AlertsPage) },
    { path: 'look', loadComponent: () => import('./pages/look/look').then((m) => m.LookPage) },
  ],
};
