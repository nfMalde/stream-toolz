// Chat Overlay in the UI: its pages (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { CHATOVERLAY } from '@stz/api';
import type { ModuleUi } from '@shell/core/module-ui';

export const chatoverlayUi: ModuleUi = {
  id: CHATOVERLAY,
  name: 'Chat Overlay',
  description: 'chatoverlay.module.description',
  icon: 'live',
  pages: [{ path: 'overlay', label: 'chatoverlay.nav.overlay', icon: 'live' }],
  routes: [{ path: 'overlay', loadComponent: () => import('./pages/overlay/overlay').then((m) => m.ChatoverlayPage) }],
};
