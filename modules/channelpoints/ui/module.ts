// Channel Points in the UI: its pages (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { CHANNELPOINTS } from '@stz/api';
import type { ModuleUi } from '@shell/core/module-ui';

export const channelpointsUi: ModuleUi = {
  id: CHANNELPOINTS,
  name: 'Channel Points',
  description: 'channelpoints.module.description',
  icon: 'gift',
  pages: [{ path: 'rewards', label: 'channelpoints.nav.rewards', icon: 'gift' }],
  routes: [{ path: 'rewards', loadComponent: () => import('./pages/rewards/rewards').then((m) => m.ChannelpointsPage) }],
};
