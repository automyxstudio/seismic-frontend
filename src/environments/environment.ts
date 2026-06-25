/**
 * Variables de entorno para desarrollo local.
 * En producción (Docker) se reemplaza por environment.prod.ts vía angular.json.
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000',
  wsUrl: 'ws://localhost:8000',
};
