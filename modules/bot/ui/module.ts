// Chat Bot in the UI: its pages (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { BOT } from '@stz/api';
import type { ModuleUi } from '@shell/core/module-ui';

export const botUi: ModuleUi = {
  id: BOT,
  name: 'Chat Bot',
  description: 'bot.module.description',
  icon: 'send',
  pages: [
    { path: 'commands', label: 'bot.nav.commands', icon: 'send' },
    { path: 'timers', label: 'bot.nav.timers', icon: 'clock' },
    { path: 'log', label: 'bot.nav.log', icon: 'chat' },
  ],
  routes: [
    { path: 'commands', loadComponent: () => import('./pages/commands/commands').then((m) => m.BotCommandsPage) },
    { path: 'timers', loadComponent: () => import('./pages/timers/timers').then((m) => m.BotTimersPage) },
    { path: 'log', loadComponent: () => import('./pages/log/log').then((m) => m.BotLogPage) },
  ],
};
