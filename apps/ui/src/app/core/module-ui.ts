// What a module adds to the shell's UI: its pages in the navigation and their routes, a control at the bottom of the
// navigation, and its steps in the setup assistant. The built-in modules are listed in ../modules.ts; their main
// process part is the module's definition (packages/core/src/module.ts).

import type { Signal, Type } from '@angular/core';
import type { Routes } from '@angular/router';
import type { TextKey } from '../i18n/i18n';
import type { IconName } from '../ui/icon';

export interface ModuleUi {
  /** The module's id: its route (/<id>/…), window.stz.<id>, and the start of its text keys ("<id>.…"). */
  id: string;
  /** The module's name, the same in every language ("ReadMyChat"). */
  name: string;
  /** One sentence for the module overview. */
  description: TextKey;
  icon: IconName;
  /** Its pages in the navigation, in order; the first one opens when the module is chosen. */
  pages: ModulePage[];
  /** The routes of those pages, below /<id>/ (loaded when first opened). */
  routes: Routes;
  /** Shown at the bottom of the navigation while the module is on (ReadMyChat: reading on or off). */
  railControl?: Type<unknown>;
  /** Its part of the setup assistant; called in the assistant's injection context. */
  guide?: () => ModuleGuide;
}

export interface ModulePage {
  /** Below /<id>/. */
  path: string;
  label: TextKey;
  icon: IconName;
}

export interface ModuleGuide {
  /** Steps after the shell's (welcome, Twitch app, login), before the last one. */
  steps: GuideStep[];
  /** The language picked on the first step: the module may follow it (ReadMyChat: the chat's main language). */
  languageChosen?(language: string): void;
  /** Lines on the last step: what is ready and what is missing. */
  checks?: Signal<GuideCheck[]>;
  /** A button on the last step to try the module out. */
  test?: { label: TextKey; hint: TextKey; run(): void };
}

export interface GuideStep {
  id: string;
  title: TextKey;
  icon: IconName;
  /** The step's content, below its title. */
  component: Type<unknown>;
  /** Shows the step as done in the assistant's list. */
  done?: Signal<boolean>;
}

export interface GuideCheck {
  ok: boolean;
  label: TextKey;
}
