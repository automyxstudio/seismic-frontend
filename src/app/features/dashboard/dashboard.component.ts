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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, EarthquakeMapComponent],
  template: `
    <div class="shell">

      <!-- ── Header ───────────────────────────────────────────── -->
      <header class="hdr">
        <div class="hdr-left">
          <span class="globe">🌍</span>
          <span class="title">Seismic Monitor</span>
          <span class="live-badge">● LIVE</span>
        </div>
        <div class="hdr-right">
          <span class="username">{{ authService.currentUser()?.username ?? 'admin' }}</span>
          <button class="btn btn-indigo" [disabled]="syncLoading()" (click)="syncUsgs()">
            {{ syncLoading() ? '⏳' : '🔄' }} Sync USGS
          </button>
          <button class="btn btn-blue" [disabled]="simulateLoading()" (click)="simulateEarthquake()">
            {{ simulateLoading() ? '...' : '⚡ Simular' }}
          </button>
          <button class="btn btn-ghost" (click)="logout()">Salir</button>
        </div>
      </header>

      <!-- ── Sync toast (efímero, sobre el body) ──────────────── -->
      @if (syncResult()) {
        <div class="sync-bar" [class.sync-bar-info]="syncResult()!.new === 0">
          @if (syncResult()!.new > 0) {
            ✓ <strong>{{ syncResult()!.new }} nuevos</strong> eventos descargados de USGS
          } @else {
            ✓ Todo al día — {{ syncResult()!.fetched }} eventos ya almacenados
          }
        </div>
      }

      <!-- ── Body: mapa izquierda · paneles derecha ────────────── -->
      <div class="body">

        <!-- Mapa ocupa toda la altura del body -->
        <div class="map-col">
          <app-earthquake-map [liveEvents]="liveEvents()" />
        </div>

        <!-- Columna derecha: stats strip + dos paneles -->
        <div class="right-col">

          <!-- Stats strip — métricas de la hora actual -->
          <div class="stats-strip">
            @let m = metricsQuery.data()?.[0];
            <div class="stat">
              <span class="stat-val">{{ m?.earthquake_count ?? '—' }}</span>
              <span class="stat-lbl">sismos esta hora</span>
            </div>
            <div class="stat-sep"></div>
            <div class="stat">
              <span class="stat-val">{{ m ? 'M' + m.avg_magnitude : '—' }}</span>
              <span class="stat-lbl">magnitud media</span>
            </div>
            <div class="stat-sep"></div>
            <div class="stat">
              <span class="stat-val">{{ m ? 'M' + m.max_magnitude : '—' }}</span>
              <span class="stat-lbl">máximo</span>
            </div>
            <div class="stat-sep"></div>
            <div class="stat dist-stat">
              @let d = m?.magnitude_distribution;
              <div class="dist-row">
                <span class="dist-label green">Micro</span>
                <span class="dist-bar-wrap"><span class="dist-bar green" [style.width.%]="distPct(d?.micro, m?.earthquake_count)"></span></span>
                <span class="dist-n">{{ d?.micro ?? 0 }}</span>
              </div>
              <div class="dist-row">
                <span class="dist-label blue">Menor</span>
                <span class="dist-bar-wrap"><span class="dist-bar blue" [style.width.%]="distPct(d?.menor, m?.earthquake_count)"></span></span>
                <span class="dist-n">{{ d?.menor ?? 0 }}</span>
              </div>
              <div class="dist-row">
                <span class="dist-label orange">Ligero+</span>
                <span class="dist-bar-wrap"><span class="dist-bar orange" [style.width.%]="distPct((d?.ligero??0)+(d?.moderado??0)+(d?.fuerte??0)+(d?.mayor??0), m?.earthquake_count)"></span></span>
                <span class="dist-n">{{ (d?.ligero??0)+(d?.moderado??0)+(d?.fuerte??0)+(d?.mayor??0) }}</span>
              </div>
            </div>
          </div>

          <!-- Dos paneles inferiores -->
          <div class="panels-row">

            <!-- Feed en vivo (WebSocket) -->
            <div class="panel">
              <div class="panel-hdr">
                <span class="panel-title">Feed en Vivo <span class="dot-green">●</span></span>
                <span class="panel-count">{{ liveEvents().length }} eventos</span>
              </div>
              <div class="panel-body">
                @if (liveEvents().length === 0) {
                  <div class="empty">Esperando eventos por WebSocket…</div>
                }
                @for (ev of liveEvents(); track ev.event_id) {
                  <div class="feed-row" [class]="'mag-' + ev.magnitude_range">
                    <span class="feed-mag">M{{ ev.magnitude }}</span>
                    <span class="feed-loc">{{ ev.location }}</span>
                    <span class="feed-time">{{ ev.event_time | date:'HH:mm:ss' }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Reportes horarios (Airflow + trigger manual) -->
            <div class="panel">
              <div class="panel-hdr">
                <span class="panel-title">Reportes Horarios</span>
                <button class="btn btn-green btn-sm" [disabled]="triggerLoading()" (click)="triggerReport()">
                  {{ triggerLoading() ? '⏳' : '▶' }} Generar
                </button>
              </div>
              <div class="panel-body">

                @if (lastTriggerResult()) {
                  <div class="trigger-result">
                    <div class="tr-row">
                      <span class="tr-badge">✓ generado</span>
                      <span class="tr-period">{{ lastTriggerResult()!.period | date:'dd/MM HH:mm' }}</span>
                    </div>
                    <div class="tr-nums">
                      <div class="tr-num"><b>{{ lastTriggerResult()!.total_events }}</b><small>eventos</small></div>
                      <div class="tr-num"><b>M{{ lastTriggerResult()!.avg_magnitude }}</b><small>avg</small></div>
                      <div class="tr-num"><b>M{{ lastTriggerResult()!.max_magnitude }}</b><small>max</small></div>
                    </div>
                    @if (lastTriggerResult()!.top_locations?.length) {
                      <div class="tr-locs">📍 {{ lastTriggerResult()!.top_locations.slice(0,2).join(' · ') }}</div>
                    }
                  </div>
                }
                @if (triggerErrorMsg()) {
                  <div class="err-msg">✗ {{ triggerErrorMsg() }}</div>
                }

                @for (r of reportsQuery.data()?.items ?? []; track r.id) {
                  <div class="report-row">
                    <div class="report-top">
                      <span class="rp-period">{{ r.period_start | date:'HH:mm' }}–{{ r.period_end | date:'HH:mm' }}</span>
                      <span class="rp-total">{{ r.total_events }} eventos</span>
                    </div>
                    <div class="rp-stats">Avg M{{ r.average_magnitude }} · Max M{{ r.max_magnitude }}</div>
                    @if (r.top_locations?.length) {
                      <div class="rp-locs">📍 {{ r.top_locations[0] }}</div>
                    }
                  </div>
                }
                @if ((reportsQuery.data()?.items ?? []).length === 0 && !lastTriggerResult()) {
                  <div class="empty">Sin reportes. Pulsa Generar.</div>
                }
              </div>
            </div>

          </div><!-- /panels-row -->
        </div><!-- /right-col -->
      </div><!-- /body -->
    </div><!-- /shell -->
  `,
  styles: [`
    /* ── Reset y variables ───────────────────── */
    :host { display: block; height: 100vh; overflow: hidden; }

    .shell {
      height: 100vh; overflow: hidden;
      display: flex; flex-direction: column;
      background: #0d1117; color: #e6edf3;
      font-family: inherit;
    }

    /* ── Header ──────────────────────────────── */
    .hdr {
      flex-shrink: 0; height: 52px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 1.25rem; background: #161b22; border-bottom: 1px solid #30363d;
    }
    .hdr-left { display: flex; align-items: center; gap: 0.6rem; }
    .globe { font-size: 1.1rem; }
    .title { font-weight: 700; font-size: 1rem; }
    .live-badge {
      background: #238636; color: #fff;
      padding: 0.15rem 0.5rem; border-radius: 10px;
      font-size: 0.7rem; font-weight: 700;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
    .hdr-right { display: flex; align-items: center; gap: 0.6rem; }
    .username { color: #8b949e; font-size: 0.82rem; margin-right: 0.25rem; }

    /* ── Buttons ─────────────────────────────── */
    .btn { border: 1px solid; border-radius: 6px; padding: 0.3rem 0.75rem; cursor: pointer; font-size: 0.8rem; font-weight: 500; transition: opacity .15s; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn-indigo { background: #1f3358; border-color: #7c8cf8; color: #7c8cf8; }
    .btn-indigo:hover:not(:disabled) { background: #7c8cf8; color: #0d1117; }
    .btn-blue   { background: #1f3a5f; border-color: #58a6ff; color: #58a6ff; }
    .btn-blue:hover:not(:disabled)   { background: #58a6ff; color: #0d1117; }
    .btn-green  { background: #1c3a1c; border-color: #238636; color: #3fb950; }
    .btn-green:hover:not(:disabled)  { background: #238636; color: #fff; }
    .btn-ghost  { background: transparent; border-color: #30363d; color: #8b949e; }
    .btn-ghost:hover { border-color: #e94560; color: #e94560; }
    .btn-sm { padding: 0.2rem 0.55rem; font-size: 0.75rem; }

    /* ── Sync bar ────────────────────────────── */
    .sync-bar {
      flex-shrink: 0;
      background: #0d2318; border-bottom: 2px solid #238636; color: #3fb950;
      padding: 0.3rem 1.25rem; font-size: 0.8rem;
      animation: fadeDown .2s ease;
    }
    .sync-bar.sync-bar-info { background: #181e0d; border-color: #6e7a00; color: #b5c100; }
    @keyframes fadeDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

    /* ── Body: mapa + paneles ────────────────── */
    .body {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 55% 45%;
    }
    .map-col { overflow: hidden; border-right: 1px solid #30363d; }

    /* ── Columna derecha ─────────────────────── */
    .right-col { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

    /* ── Stats strip ─────────────────────────── */
    .stats-strip {
      flex-shrink: 0;
      display: flex; align-items: center;
      padding: 0 1rem; height: 82px;
      background: #161b22; border-bottom: 1px solid #30363d; gap: 0;
    }
    .stat { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 0.2rem; }
    .stat-val { font-size: 1.5rem; font-weight: 700; color: #e6edf3; line-height: 1; }
    .stat-lbl { font-size: 0.65rem; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; }
    .stat-sep { width: 1px; height: 36px; background: #30363d; flex-shrink: 0; }

    /* distribución inline */
    .dist-stat { align-items: stretch; flex: 1.4; padding: 0 0.5rem; gap: 0.22rem; justify-content: center; }
    .dist-row { display: flex; align-items: center; gap: 0.35rem; }
    .dist-label { font-size: 0.62rem; width: 36px; color: #8b949e; }
    .dist-bar-wrap { flex: 1; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden; }
    .dist-bar { height: 100%; border-radius: 3px; transition: width .4s ease; }
    .dist-n { font-size: 0.65rem; color: #8b949e; width: 16px; text-align: right; }
    .green { color: #3fb950; } .dist-bar.green { background: #3fb950; }
    .blue  { color: #58a6ff; } .dist-bar.blue  { background: #58a6ff; }
    .orange{ color: #f0883e; } .dist-bar.orange{ background: #f0883e; }

    /* ── Paneles inferiores ──────────────────── */
    .panels-row {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 1fr 1fr;
      border-top: 0;
    }
    .panel {
      display: flex; flex-direction: column; min-height: 0;
      border-right: 1px solid #30363d;
    }
    .panel:last-child { border-right: none; }
    .panel-hdr {
      flex-shrink: 0;
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.6rem 0.9rem; background: #161b22; border-bottom: 1px solid #30363d;
    }
    .panel-title { font-size: 0.82rem; font-weight: 600; }
    .panel-count { font-size: 0.72rem; color: #8b949e; }
    .dot-green { color: #3fb950; animation: pulse 2s infinite; }
    .panel-body { flex: 1; overflow-y: auto; padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; }

    /* Feed */
    .empty { color: #8b949e; font-size: 0.8rem; text-align: center; padding: 1.5rem 0; }
    .feed-row {
      display: grid; grid-template-columns: 48px 1fr auto; gap: 0.4rem; align-items: center;
      padding: 0.35rem 0.5rem; border-radius: 5px; background: #161b22; font-size: 0.78rem;
    }
    .feed-mag { font-weight: 700; }
    .feed-loc { color: #8b949e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .feed-time { color: #58a6ff; font-size: 0.7rem; white-space: nowrap; }
    .mag-fuerte .feed-mag, .mag-mayor .feed-mag { color: #e94560; }
    .mag-ligero .feed-mag, .mag-moderado .feed-mag { color: #f0883e; }
    .mag-micro .feed-mag, .mag-menor .feed-mag { color: #3fb950; }

    /* Trigger result */
    .trigger-result {
      background: #0d2318; border: 1px solid #238636; border-radius: 7px;
      padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem;
      animation: fadeDown .25s ease;
    }
    .tr-row { display: flex; justify-content: space-between; align-items: center; }
    .tr-badge { background: #238636; color: #fff; padding: .1rem .4rem; border-radius: 8px; font-size: .7rem; font-weight: 600; }
    .tr-period { font-size: .72rem; color: #8b949e; }
    .tr-nums { display: flex; gap: 1rem; }
    .tr-num { display: flex; flex-direction: column; align-items: center; }
    .tr-num b { font-size: 1.1rem; color: #3fb950; }
    .tr-num small { font-size: .62rem; color: #8b949e; text-transform: uppercase; }
    .tr-locs { font-size: .7rem; color: #8b949e; border-top: 1px solid #1e3a2e; padding-top: .3rem; }
    .err-msg { background: #2a1c1c; color: #e94560; border-radius: 6px; padding: .4rem .6rem; font-size: .78rem; }

    /* Reportes */
    .report-row {
      background: #161b22; border-radius: 6px; padding: .5rem .65rem;
      display: flex; flex-direction: column; gap: .2rem;
    }
    .report-top { display: flex; justify-content: space-between; }
    .rp-period { font-size: .78rem; color: #58a6ff; }
    .rp-total  { font-size: .78rem; font-weight: 600; }
    .rp-stats  { font-size: .72rem; color: #8b949e; }
    .rp-locs   { font-size: .68rem; color: #8b949e; }
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
  readonly syncLoading = signal(false);
  readonly syncResult = signal<{ fetched: number; new: number; already_stored: number } | null>(null);
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

  async syncUsgs(): Promise<void> {
    this.syncLoading.set(true);
    this.syncResult.set(null);
    try {
      const result = await this.api.syncFromUsgs();
      this.syncResult.set(result);
      // Si llegaron eventos nuevos, refrescar la tabla y las métricas
      if (result.new > 0) {
        await this.queryClient.invalidateQueries({ queryKey: ['earthquakes'] });
        await this.queryClient.invalidateQueries({ queryKey: ['metrics'] });
      }
    } catch (err) {
      console.error('[Dashboard] sync error:', err);
    } finally {
      this.syncLoading.set(false);
    }
  }

  async simulateEarthquake(): Promise<void> {
    this.simulateLoading.set(true);
    try {
      await this.api.simulateEarthquake();
      // El evento llega por WebSocket (feed + mapa)
      // Invalidar métricas para que los contadores se actualicen de inmediato
      await this.queryClient.invalidateQueries({ queryKey: ['metrics'] });
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

  distPct(count: number | undefined, total: number | undefined): number {
    if (!count || !total) return 0;
    return Math.round((count / total) * 100);
  }

  logout(): void {
    this.authService.logout();
  }
}
