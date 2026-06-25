/**
 * Variables de entorno para producción (Docker).
 * La API corre en el mismo host, accesible desde el navegador.
 */
export const environment = {
  production: true,
  apiUrl: 'http://localhost:8000',
  wsUrl: 'ws://localhost:8000',
};
