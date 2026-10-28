import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'live' },
  { path: 'live', loadComponent: () => import('./pages/live/live').then((m) => m.Live) },
  { path: 'events', loadComponent: () => import('./pages/events/events').then((m) => m.EventsPage) },
  { path: 'twitch', loadComponent: () => import('./pages/twitch/twitch').then((m) => m.Twitch) },
  { path: 'voices', loadComponent: () => import('./pages/voices/voices').then((m) => m.Voices) },
  { path: 'output', loadComponent: () => import('./pages/output/output').then((m) => m.Output) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage) },
  { path: 'about', loadComponent: () => import('./pages/about/about').then((m) => m.About) },
  { path: '**', redirectTo: 'live' },
];
