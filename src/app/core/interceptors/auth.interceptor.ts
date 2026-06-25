/**
 * Interceptor HTTP para autenticación JWT con auto-refresh transparente.
 *
 * Hace dos cosas en cada request HTTP:
 *  1. Adjunta el access token en el header Authorization: Bearer <token>.
 *  2. Si recibe un 401, intenta renovar el access token con el refresh token
 *     y reintenta el request original — el usuario nunca ve el error.
 *
 * Si el refresh también falla (refresh token expirado), hace logout y
 * redirige al login.
 *
 * Se registra como funcional interceptor en app.config.ts (no como clase).
 * Este es el patrón moderno de Angular 17+ sin necesidad de NgModules.
 */

import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Previene múltiples llamadas simultáneas al endpoint de refresh. */
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const authService = inject(AuthService);

  // Adjuntar access token si existe
  const token = authService.getAccessToken();
  const authReq = token ? addToken(req, token) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo interceptar 401 y no interceptar el endpoint de refresh
      // (evitar bucle infinito si el refresh también retorna 401)
      if (error.status === 401 && !req.url.includes('/auth/refresh')) {
        return handle401(req, next, authService);
      }
      return throwError(() => error);
    })
  );
};

/**
 * Maneja el 401: refresca el token y reintenta el request original.
 *
 * Si hay otro request en proceso de refresh, lo encola usando el BehaviorSubject
 * y los reintenta todos juntos cuando el refresh termina — así no se lanzan
 * múltiples llamadas al endpoint de refresh en paralelo.
 */
function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
) {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refresh().pipe(
      switchMap((tokens) => {
        isRefreshing = false;
        refreshTokenSubject.next(tokens.access_token);
        // Reintentar el request original con el nuevo token
        return next(addToken(req, tokens.access_token));
      }),
      catchError((err) => {
        // Refresh falló — sesión expirada, forzar logout
        isRefreshing = false;
        authService.logout();
        return throwError(() => err);
      })
    );
  }

  // Otro request ya está haciendo refresh — esperar a que termine
  return refreshTokenSubject.pipe(
    filter((token) => token !== null),
    take(1),
    switchMap((token) => next(addToken(req, token!)))
  );
}

/** Clona el request agregando el header Authorization. */
function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
}
