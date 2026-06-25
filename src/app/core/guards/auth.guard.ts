/**
 * Guard de autenticación para rutas protegidas.
 *
 * Si el usuario no está autenticado, redirige al login
 * y cancela la navegación al destino solicitado.
 *
 * Se usa como funcional guard (canActivate) en app.routes.ts.
 * Patrón moderno Angular 17+ — sin necesidad de clase ni NgModule.
 */

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // No autenticado — redirigir al login
  return router.createUrlTree(['/login']);
};
