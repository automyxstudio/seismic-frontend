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
import { injectQuery, injectQueryClient } from '@tanstack/angular-query-experimental';
import { Router } from '@angular/router';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { SeismicWsService } from '../../core/services/seismic-ws.service';
import { Earthquake } from '../../core/models/earthquake.model';

interface TriggerResult {
  status: string;
  period: string;
  total_events: number;
  avg_magnitude: number;
  max_magnitude: number;
  top_locations: string[];
}

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
          <button
            class="btn-simulate"
            [disabled]="simulateLoading()"
            (click)="simulateEarthquake()"
            title="Genera un sismo sintético y lo envía por WebSocket"
          >
            {{ simulateLoading() ? '...' : '⚡ Simular Sismo' }}
          </button>
          <button (click)="logout()" class="btn-logout">Cerrar sesión</button>
        </div>
      </header>

      <main class="dashboard-content">

        <!-- Mapa en tiempo real -->
        <section class="map-section">
          <app-earthquake-map [liveEvents]="liveEvents()" />
        </section>

        <!-- Métricas de las últimas 24 horas -->
        <section class="metrics-section">
          @if (metricsQuery.isPending()) {
            <div class="loading">Cargando métricas...</div>
          } @else if (metricsQuery.isError()) {
            <div class="error">Error al cargar métricas</div>
          } @else {
            <app-metrics-cards [metrics]="metricsQuery.data() ?? []" />
          }
        </section>

        <!-- Feed en vivo + Reportes Airflow (dos columnas) -->
        <div class="two-col">

          <!-- Feed de eventos en tiempo real (WebSocket) -->
          <section class="panel">
            <h2 class="panel-title">Feed en Vivo <span class="live-dot">●</span></h2>
            <div class="live-feed">
              @if (liveEvents().length === 0) {
                <div class="feed-empty">Esperando eventos del WebSocket...</div>
              }
              @for (event of liveEvents().slice(0, 20); track event.event_id) {
                <div class="feed-item" [class]="'mag-' + event.magnitude_range">
                  <span class="feed-mag">M{{ event.magnitude }}</span>
                  <span class="feed-loc">{{ event.location }}</span>
                  <span class="feed-time">{{ event.event_time | date:'HH:mm:ss' }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Reportes generados por Airflow / trigger manual -->
          <section class="panel">
            <div class="panel-header">
              <h2 class="panel-title">Reportes Horarios</h2>
              <button
                class="btn-trigger"
                [disabled]="triggerLoading()"
                (click)="triggerReport()"
              >
                {{ triggerLoading() ? '⏳ Generando...' : '▶ Generar Reporte' }}
              </button>
            </div>

            <!-- Resultado del último reporte generado manualmente -->
            @if (lastTriggerResult()) {
              <div class="trigger-result">
                <div class="tr-header">
                  <span class="tr-badge">✓ Reporte generado</span>
                  <span class="tr-period">{{ lastTriggerResult()!.period | date:'dd/MM/yyyy HH:mm' }}</span>
                </div>
                <div class="tr-stats">
                  <div class="tr-stat">
                    <span class="tr-stat-val">{{ lastTriggerResult()!.total_events }}</span>
                    <span class="tr-stat-lbl">eventos</span>
                  </div>
                  <div class="tr-stat">
                    <span class="tr-stat-val">M{{ lastTriggerResult()!.avg_magnitude }}</span>
                    <span class="tr-stat-lbl">magnitud media</span>
                  </div>
                  <div class="tr-stat">
                    <span class="tr-stat-val">M{{ lastTriggerResult()!.max_magnitude }}</span>
                    <span class="tr-stat-lbl">máximo</span>
                  </div>
                </div>
                @if (lastTriggerResult()!.top_locations?.length) {
                  <div class="tr-locations">
                    📍 {{ lastTriggerResult()!.top_locations.join(' · ') }}
                  </div>
                }
              </div>
            }

            @if (triggerErrorMsg()) {
              <div class="trigger-err">✗ {{ triggerErrorMsg() }}</div>
            }

            <!-- Histórico de reportes previos -->
            @if (reportsQuery.isPending()) {
              <div class="loading">Cargando reportes...</div>
            } @else if (reportsQuery.isError()) {
              <div class="error">Error al cargar reportes</div>
            } @else if ((reportsQuery.data()?.items ?? []).length === 0) {
              <div class="loading">No hay reportes aún. Pulsa "Generar Reporte" para crear uno.</div>
            } @else {
              <div class="reports-list">
                @for (r of reportsQuery.data()?.items ?? []; track r.id) {
                  <div class="report-card">
                    <div class="report-header">
                      <span class="report-period">{{ r.period_start | date:'dd/MM HH:mm' }} – {{ r.period_end | date:'HH:mm' }}</span>
                      <span class="report-total">{{ r.total_events }} eventos</span>
                    </div>
                    <div class="report-stats">
                      <span>Avg M{{ r.average_magnitude }}</span>
                      <span>Max M{{ r.max_magnitude }}</span>
                    </div>
                    @if (r.top_locations?.length) {
                      <div class="report-locations">
                        📍 {{ r.top_locations.slice(0, 2).join(' · ') }}
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>
        </div>

        <!-- Tabla de eventos históricos -->
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
    .btn-simulate { background: #1f3a5f; border: 1px solid #58a6ff; color: #58a6ff; padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .btn-simulate:hover:not(:disabled) { background: #58a6ff; color: #0d1117; }
    .btn-simulate:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-logout { background: transparent; border: 1px solid #30363d; color: #8b949e; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; }
    .btn-logout:hover { border-color: #e94560; color: #e94560; }

    .dashboard-content { padding: 1.5rem 2rem; display: grid; gap: 1.5rem; }
    .map-section { height: 400px; border-radius: 12px; overflow: hidden; border: 1px solid #30363d; }

    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

    .panel {
      background: #161b22; border: 1px solid #30363d; border-radius: 12px;
      padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;
    }
    .panel-title { margin: 0; font-size: 1rem; font-weight: 600; color: #e6edf3; }
    .panel-header { display: flex; justify-content: space-between; align-items: center; }

    .live-dot { color: #3fb950; animation: pulse 2s infinite; }

    .live-feed { display: flex; flex-direction: column; gap: 0.4rem; max-height: 320px; overflow-y: auto; }
    .feed-empty { color: #8b949e; text-align: center; padding: 2rem; font-size: 0.85rem; }
    .feed-item {
      display: grid; grid-template-columns: 60px 1fr auto;
      gap: 0.5rem; align-items: center;
      padding: 0.4rem 0.6rem; border-radius: 6px; background: #0d1117;
      font-size: 0.82rem;
    }
    .feed-mag { font-weight: 700; }
    .feed-loc { color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .feed-time { color: #58a6ff; font-size: 0.75rem; white-space: nowrap; }

    .feed-item.mag-fuerte .feed-mag,
    .feed-item.mag-mayor .feed-mag { color: #e94560; }
    .feed-item.mag-ligero .feed-mag,
    .feed-item.mag-moderado .feed-mag { color: #f0883e; }
    .feed-item.mag-micro .feed-mag,
    .feed-item.mag-menor .feed-mag { color: #3fb950; }

    .btn-trigger {
      background: #238636; color: #fff; border: none;
      padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
    }
    .btn-trigger:hover:not(:disabled) { background: #2ea043; }
    .btn-trigger:disabled { opacity: 0.5; cursor: not-allowed; }

    .trigger-result {
      background: #0d2318; border: 1px solid #238636; border-radius: 8px;
      padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.6rem;
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .tr-header { display: flex; justify-content: space-between; align-items: center; }
    .tr-badge { background: #238636; color: #fff; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.78rem; font-weight: 600; }
    .tr-period { font-size: 0.8rem; color: #8b949e; }
    .tr-stats { display: flex; gap: 1.5rem; }
    .tr-stat { display: flex; flex-direction: column; align-items: center; }
    .tr-stat-val { font-size: 1.3rem; font-weight: 700; color: #3fb950; }
    .tr-stat-lbl { font-size: 0.7rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }
    .tr-locations { font-size: 0.78rem; color: #8b949e; border-top: 1px solid #1e3a2e; padding-top: 0.4rem; }
    .trigger-err { padding: 0.5rem 0.75rem; border-radius: 6px; background: #2a1c1c; color: #e94560; font-size: 0.82rem; }

    .reports-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 300px; overflow-y: auto; }
    .report-card {
      background: #0d1117; border-radius: 8px; padding: 0.75rem;
      display: flex; flex-direction: column; gap: 0.3rem;
    }
    .report-header { display: flex; justify-content: space-between; align-items: center; }
    .report-period { font-size: 0.85rem; color: #58a6ff; }
    .report-total { font-weight: 600; font-size: 0.85rem; }
    .report-stats { display: flex; gap: 1rem; font-size: 0.8rem; color: #8b949e; }
    .report-locations { font-size: 0.78rem; color: #8b949e; }

    .loading, .error { padding: 2rem; text-align: center; color: #8b949e; font-size: 0.85rem; }
    .error { color: #e94560; }

    @media (max-width: 768px) {
      .two-col { grid-template-columns: 1fr; }
      .dashboard-content { padding: 1rem; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  private api = inject(ApiService);
  private ws = inject(SeismicWsService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private queryClient = injectQueryClient();

  readonly liveEvents = signal<Earthquake[]>([]);
  readonly simulateLoading = signal(false);
  readonly triggerLoading = signal(false);
  readonly lastTriggerResult = signal<TriggerResult | null>(null);
  readonly triggerErrorMsg = signal('');

  readonly metricsQuery = injectQuery(() => ({
    queryKey: ['metrics', 24],
    queryFn: () => this.api.getMetrics(24),
    refetchInterval: 60_000,
  }));

  readonly reportsQuery = injectQuery(() => ({
    queryKey: ['reports'],
    queryFn: () => this.api.getReports(1, 10),
    refetchInterval: 120_000,
  }));

  ngOnInit(): void {
    this._subscribeToWebSocket();
  }

  private _subscribeToWebSocket(): void {
    this.ws
      .getEvents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          this.liveEvents.update((events) => [event, ...events].slice(0, 50));
        },
        error: (err) => console.error('[Dashboard] WebSocket error:', err),
      });
  }

  async simulateEarthquake(): Promise<void> {
    this.simulateLoading.set(true);
    try {
      await this.api.simulateEarthquake();
      // El evento llega automáticamente por WebSocket — no hace falta actualizar nada manualmente
    } catch (err) {
      console.error('[Dashboard] simulate error:', err);
    } finally {
      this.simulateLoading.set(false);
    }
  }

  async triggerReport(): Promise<void> {
    this.triggerLoading.set(true);
    this.lastTriggerResult.set(null);
    this.triggerErrorMsg.set('');
    try {
      const result = await this.api.triggerReport();
      this.lastTriggerResult.set(result as TriggerResult);
      await this.queryClient.invalidateQueries({ queryKey: ['reports'] });
    } catch (err: any) {
      const detail = err?.error?.detail ?? 'Error generando reporte';
      this.triggerErrorMsg.set(detail);
    } finally {
      this.triggerLoading.set(false);
    }
  }

  logout(): void {
    this.authService.logout();
  }
}
