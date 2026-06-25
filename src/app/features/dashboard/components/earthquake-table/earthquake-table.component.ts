/**
 * Componente de tabla de eventos sísmicos con filtros y paginación.
 *
 * Usa TanStack Query (injectQuery) para el fetch y caché.
 * Los filtros usan signals — al cambiar un filtro, el queryKey cambia
 * y TanStack Query refetch automáticamente con los nuevos parámetros.
 *
 * Patrón: el estado de los filtros vive en signals locales.
 * TanStack Query observa el queryKey y refetch cuando cambia.
 */

import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { ApiService } from '../../../../core/services/api.service';
import { MagnitudeRange } from '../../../../core/models/earthquake.model';

@Component({
  selector: 'app-earthquake-table',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-container">
      <div class="table-header">
        <h2>Eventos Sísmicos</h2>

        <!-- Filtros -->
        <div class="filters">
          <select
            [value]="selectedRange()"
            (change)="onFilterChange('range', $any($event.target).value)"
            class="filter-select"
          >
            <option value="">Todos los rangos</option>
            <option value="micro">Micro (< 2.0)</option>
            <option value="menor">Menor (2.0–3.9)</option>
            <option value="ligero">Ligero (4.0–4.9)</option>
            <option value="moderado">Moderado (5.0–5.9)</option>
            <option value="fuerte">Fuerte (6.0–6.9)</option>
            <option value="mayor">Mayor (≥ 7.0)</option>
          </select>

          <select
            [value]="selectedOrder()"
            (change)="onFilterChange('order', $any($event.target).value)"
            class="filter-select"
          >
            <option value="desc">Más reciente primero</option>
            <option value="asc">Más antiguo primero</option>
          </select>
        </div>
      </div>

      @if (earthquakesQuery.isPending()) {
        <div class="loading">Cargando eventos...</div>
      } @else if (earthquakesQuery.isError()) {
        <div class="error">Error al cargar eventos</div>
      } @else {
        <div class="table-scroll">
          <table class="eq-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Ubicación</th>
                <th>Magnitud</th>
                <th>Rango</th>
                <th>Prof. (km)</th>
              </tr>
            </thead>
            <tbody>
              @for (eq of earthquakesQuery.data()?.items ?? []; track eq.event_id) {
                <tr>
                  <td>{{ eq.event_time | date:'HH:mm:ss' }}</td>
                  <td class="location">{{ eq.location }}</td>
                  <td>
                    <span class="magnitude-badge" [style.background]="getMagColor(eq.magnitude)">
                      {{ eq.magnitude | number:'1.1-1' }}
                    </span>
                  </td>
                  <td>
                    <span class="range-badge">{{ eq.magnitude_range }}</span>
                  </td>
                  <td>{{ eq.depth | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Paginación -->
        <div class="pagination">
          <button (click)="prevPage()" [disabled]="currentPage() === 1" class="btn-page">← Anterior</button>
          <span class="page-info">
            Página {{ currentPage() }} · {{ earthquakesQuery.data()?.total ?? 0 }} eventos totales
          </span>
          <button
            (click)="nextPage()"
            [disabled]="!hasNextPage()"
            class="btn-page"
          >Siguiente →</button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
    .table-container { background: #161b22; border-top: 0; border-radius: 0; overflow: hidden; display: flex; flex-direction: column; height: 100%; }
    .table-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; }
    .table-header h2 { margin: 0; font-size: 1rem; }
    .filters { display: flex; gap: 0.75rem; }
    .filter-select { background: #21262d; border: 1px solid #30363d; color: #e6edf3; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.85rem; }
    .table-scroll { flex: 1; overflow-y: auto; min-height: 0; }
    .eq-table { width: 100%; border-collapse: collapse; }
    .eq-table th { padding: 0.75rem 1.5rem; text-align: left; font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #30363d; }
    .eq-table td { padding: 0.75rem 1.5rem; border-bottom: 1px solid #21262d; font-size: 0.875rem; }
    .eq-table tr:hover td { background: rgba(255,255,255,0.02); }
    .location { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .magnitude-badge { padding: 0.2rem 0.6rem; border-radius: 12px; color: #fff; font-weight: 700; font-size: 0.85rem; }
    .range-badge { background: #21262d; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; color: #8b949e; text-transform: capitalize; }
    .pagination { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1.5rem; border-top: 1px solid #30363d; }
    .page-info { font-size: 0.85rem; color: #8b949e; }
    .btn-page { background: #21262d; border: 1px solid #30363d; color: #e6edf3; padding: 0.4rem 0.875rem; border-radius: 6px; cursor: pointer; }
    .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
    .loading, .error { padding: 3rem; text-align: center; color: #8b949e; }
  `],
})
export class EarthquakeTableComponent {
  private api = inject(ApiService);

  readonly currentPage = signal(1);
  readonly pageSize = 20;

  // Signals para que TanStack Query los observe directamente en el queryKey
  readonly selectedRange = signal('');
  readonly selectedOrder = signal('desc');

  readonly earthquakesQuery = injectQuery(() => ({
    queryKey: ['earthquakes', this.currentPage(), this.selectedRange(), this.selectedOrder()],
    queryFn: () =>
      this.api.getEarthquakes({
        page: this.currentPage(),
        page_size: this.pageSize,
        magnitude_range: this.selectedRange() || undefined,
        order: this.selectedOrder(),
      }),
  }));

  onFilterChange(field: 'range' | 'order', value: string): void {
    if (field === 'range') this.selectedRange.set(value);
    else this.selectedOrder.set(value);
    this.currentPage.set(1);
  }

  prevPage(): void {
    this.currentPage.update((p) => Math.max(1, p - 1));
  }

  nextPage(): void {
    this.currentPage.update((p) => p + 1);
  }

  hasNextPage(): boolean {
    const data = this.earthquakesQuery.data();
    if (!data) return false;
    return this.currentPage() * this.pageSize < data.total;
  }

  getMagColor(magnitude: number): string {
    if (magnitude >= 6.0) return '#8b1538';
    if (magnitude >= 5.0) return '#e94560';
    if (magnitude >= 4.0) return '#f0883e';
    if (magnitude >= 2.0) return '#58a6ff';
    return '#3fb950';
  }
}
