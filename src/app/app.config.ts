/**
 * Configuración global de la aplicación Angular.
 *
 * Registra:
 *  - Router con lazy loading de features.
 *  - HttpClient con el interceptor JWT.
 *  - TanStack Query (provideAngularQuery) con configuración global de caché.
 *
 * No hay NgModules — todo es standalone. Este archivo reemplaza
 * el AppModule de versiones anteriores de Angular.
 */

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAngularQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Router con lazy loading
    provideRouter(routes),

    // HttpClient con el interceptor JWT funcional
    provideHttpClient(withInterceptors([authInterceptor])),

    // TanStack Query — caché global, sin retry en 401/403
    provideAngularQuery(
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutos antes de marcar como stale
            retry: (failureCount, error: any) => {
              // No reintentar en errores de auth — el interceptor maneja el refresh
              if (error?.status === 401 || error?.status === 403) return false;
              return failureCount < 2;
            },
          },
        },
      })
    ),
  ],
};
