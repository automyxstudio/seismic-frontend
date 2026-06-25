/**
 * Componente raíz del dashboard.
 *
 * Orquesta los tres paneles principales:
 *  - Mapa de sismos en tiempo real (Leaflet).
 *  - Cards de métricas de la última hora.
 *  - Tabla de eventos recientes con filtros.
 *
 * Patrones usados:
 *  - TanStack Query: data-fetching y caché de los endpoints REST.
 *  - Signals: estado local reactivo (eventos en vivo, usuario).
 *  - RxJS: stream del WebSocket — ideal para datos push continuos.
 *
 * El WebSocket se suscribe en ngOnInit y se desuscribe en ngOnDestroy
 * mediante takeUntilDestroyed — sin memory leaks.
 */

import { Component, signal, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { Router } from '@angular/router';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SeismicWsService } from '../../core/services/seismic-ws.service';
import { Earthquake, Metric } from '../../core/models/earthquake.model';

import { EarthquakeMapComponent } from './components/earthquake-map/earthquake-map.component';
import { MetricsCardsComponent } from './components/metrics-cards/metrics-cards.component';
import { EarthquakeTableComponent } from './components/earthquake-table/earthquake-table.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    EarthquakeMapComponent,
    MetricsCardsComponent,
    EarthquakeTableComponent,
  ],
  template: `
    <div class="dashboard">
      <header class="dashboard-header">
        <div class="header-left">
          <span>🌍</span>
          <h1>Seismic Monitor</h1>
          <span class="live-badge">● LIVE</span>
        </div>
        <div class="header-right">
          <span class="user-info">{{ authService.currentUser()?.username ?? 'admin' }}</span>
          <button (click)="logout()" class="btn-logout">Cerrar sesión</button>
        </div>
      </header>

      <main class="dashboard-content">
        <!-- Mapa en tiempo real -->
        <section class="map-section">
          <app-earthquake-map [liveEvents]="liveEvents()" />
        </section>

        <!-- Métricas de la última hora -->
        <section class="metrics-section">
          @if (metricsQuery.isPending()) {
            <div class="loading">Cargando métricas...</div>
          } @else if (metricsQuery.isError()) {
            <div class="error">Error al cargar métricas</div>
          } @else {
            <app-metrics-cards [metrics]="metricsQuery.data() ?? []" />
          }
        </section>

        <!-- Tabla de eventos -->
        <section class="table-section">
          <app-earthquake-table />
        </section>
      </main>
    </div>
  `,
  styles: [`
    .dashboard { min-height: 100vh; background: #0d1117; color: #e6edf3; }
    .dashboard-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 2rem; background: #161b22;
      border-bottom: 1px solid #30363d;
    }
    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .header-left h1 { margin: 0; font-size: 1.25rem; }
    .live-badge { background: #238636; color: #fff; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .header-right { display: flex; align-items: center; gap: 1rem; }
    .user-info { color: #8b949e; font-size: 0.9rem; }
    .btn-logout { background: transparent; border: 1px solid #30363d; color: #8b949e; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; }
    .btn-logout:hover { border-color: #e94560; color: #e94560; }
    .dashboard-content { padding: 1.5rem 2rem; display: grid; gap: 1.5rem; }
    .map-section { height: 400px; border-radius: 12px; overflow: hidden; border: 1px solid #30363d; }
    .loading, .error { padding: 2rem; text-align: center; color: #8b949e; }
  `],
})
export class DashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  private api = inject(ApiService);
  private ws = inject(SeismicWsService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Signal con los eventos recibidos en tiempo real vía WebSocket. */
  readonly liveEvents = signal<Earthquake[]>([]);

  /**
   * TanStack Query gestiona el fetch, caché y estado de las métricas.
   * Se refetch automáticamente cada 60 segundos.
   */
  readonly metricsQuery = injectQuery(() => ({
    queryKey: ['metrics', 24],
    queryFn: () => this.api.getMetrics(24),
    refetchInterval: 60_000,
  }));

  ngOnInit(): void {
    this._subscribeToWebSocket();
  }

  /**
   * Suscripción al stream de WebSocket.
   * takeUntilDestroyed cierra la suscripción cuando el componente se destruye.
   */
  private _subscribeToWebSocket(): void {
    this.ws
      .getEvents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          // Mantener solo los últimos 50 eventos en memoria
          this.liveEvents.update((events) => [event, ...events].slice(0, 50));
        },
        error: (err) => console.error('[Dashboard] WebSocket error:', err),
      });
  }

  logout(): void {
    this.authService.logout();
  }
}
