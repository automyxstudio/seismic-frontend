/**
 * Rutas de la aplicación con lazy loading.
 *
 * Lazy loading: cada feature se carga solo cuando el usuario navega a ella.
 * El bundle inicial es más pequeño — mejor tiempo de carga.
 *
 * El authGuard protege /dashboard — redirige a /login si no hay sesión.
 * La ruta vacía redirige al dashboard (o al login via el guard).
 */

import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
