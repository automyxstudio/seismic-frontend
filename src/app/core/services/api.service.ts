/**
 * Servicio de acceso a la API REST del backend.
 *
 * Centraliza todas las llamadas HTTP. Los componentes no usan HttpClient
 * directamente — pasan por aquí. Esto facilita cambiar la URL base o
 * agregar lógica común sin tocar cada componente.
 *
 * TanStack Query (Angular Query) consume estas funciones como queryFn,
 * manejando el estado loading/error/data y el caché automáticamente.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Earthquake,
  EarthquakeListResponse,
  Metric,
  HourlyReport,
  User,
} from '../models/earthquake.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /**
   * Obtiene la lista paginada de terremotos con filtros opcionales.
   * TanStack Query llama a esta función y cachea el resultado por queryKey.
   */
  async getEarthquakes(params: {
    page?: number;
    page_size?: number;
    magnitude_min?: number;
    magnitude_max?: number;
    magnitude_range?: string;
    sort_by?: string;
    order?: string;
  } = {}): Promise<EarthquakeListResponse> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    });

    return firstValueFrom(
      this.http.get<EarthquakeListResponse>(`${this.base}/earthquakes`, {
        params: httpParams,
      })
    );
  }

  /**
   * Obtiene las métricas de las últimas N horas.
   * El backend sirve esto desde caché Redis (TTL 60s).
   */
  async getMetrics(limit = 24): Promise<Metric[]> {
    return firstValueFrom(
      this.http.get<Metric[]>(`${this.base}/metrics`, {
        params: { limit: String(limit) },
      })
    );
  }

  /**
   * Obtiene los reportes horarios generados por Airflow.
   */
  async getReports(page = 1, page_size = 10): Promise<{ items: HourlyReport[]; total: number }> {
    return firstValueFrom(
      this.http.get<{ items: HourlyReport[]; total: number }>(`${this.base}/reports`, {
        params: { page: String(page), page_size: String(page_size) },
      })
    );
  }

  /**
   * Retorna el usuario autenticado actual.
   * Llamado en el startup del dashboard para verificar la sesión.
   */
  async getMe(): Promise<User> {
    return firstValueFrom(this.http.get<User>(`${this.base}/auth/me`));
  }
}
