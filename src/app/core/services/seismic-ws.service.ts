/**
 * Servicio WebSocket para eventos sísmicos en tiempo real.
 *
 * Expone un Observable que emite cada evento nuevo publicado por el backend.
 * RxJS es ideal aquí porque un WebSocket ES un stream — Observable es la
 * abstracción correcta.
 *
 * El ciclo de vida está gestionado por el Observable:
 *  - Al suscribirse: abre la conexión WebSocket.
 *  - Al hacer unsubscribe (e.g. componente destruido): cierra el WebSocket.
 *  - Sin memory leaks — el cleanup es automático.
 */

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Earthquake } from '../models/earthquake.model';

@Injectable({ providedIn: 'root' })
export class SeismicWsService {
  private readonly wsUrl = `${environment.wsUrl}/ws/events`;

  /**
   * Retorna un Observable que emite eventos sísmicos en tiempo real.
   *
   * Cada vez que el backend publica un evento nuevo en Redis,
   * este Observable lo emite a todos sus suscriptores.
   *
   * @returns Observable<Earthquake> — stream de eventos sísmicos.
   */
  getEvents(): Observable<Earthquake> {
    return new Observable<Earthquake>((observer) => {
      const ws = new WebSocket(this.wsUrl);

      ws.onopen = () => {
        console.log('[SeismicWS] Conectado al WebSocket');
      };

      ws.onmessage = ({ data }) => {
        try {
          const event: Earthquake = JSON.parse(data);
          observer.next(event);
        } catch (e) {
          console.error('[SeismicWS] Error al parsear mensaje:', e);
        }
      };

      ws.onerror = (error) => {
        observer.error(error);
      };

      ws.onclose = () => {
        console.log('[SeismicWS] Conexión cerrada');
        observer.complete();
      };

      // Función de cleanup — se llama al hacer unsubscribe()
      // Garantiza que el WebSocket se cierra cuando el componente se destruye
      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
    });
  }
}
