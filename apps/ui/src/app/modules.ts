// The modules built into the app, in the order of the navigation (the main process lists the same ones in
// apps/desktop/src/modules.ts).

import { readMyChatUi } from '@stream-toolz/readmychat/ui/module';
import { countdownUi } from '@stream-toolz/countdown/ui/module';
import { chatoverlayUi } from '@stream-toolz/chatoverlay/ui/module';
import { alertsUi } from '@stream-toolz/alerts/ui/module';
import { channelpointsUi } from '@stream-toolz/channelpoints/ui/module';
import { botUi } from '@stream-toolz/bot/ui/module';
import type { ModuleUi } from './core/module-ui';

export const MODULE_UIS: readonly ModuleUi[] = [readMyChatUi, countdownUi, chatoverlayUi, alertsUi, channelpointsUi, botUi];
