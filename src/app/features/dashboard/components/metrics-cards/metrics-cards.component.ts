/**
 * Componente de cards de métricas sísmicas.
 *
 * Muestra las métricas de la ventana horaria más reciente:
 *  - Total de eventos en la última hora.
 *  - Magnitud promedio.
 *  - Magnitud máxima registrada.
 *  - Distribución por rangos de magnitud.
 *
 * Recibe los datos via @Input() desde el Dashboard, que usa TanStack Query
 * para el fetch y caché. Este componente es "tonto" — solo presenta datos.
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Metric } from '../../../../core/models/earthquake.model';

@Component({
  selector: 'app-metrics-cards',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (latestMetric) {
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-icon">🔢</span>
          <div class="metric-value">{{ latestMetric.earthquake_count }}</div>
          <div class="metric-label">Sismos esta hora</div>
        </div>

        <div class="metric-card">
          <span class="metric-icon">📊</span>
          <div class="metric-value">{{ latestMetric.avg_magnitude | number:'1.1-1' }}</div>
          <div class="metric-label">Magnitud promedio</div>
        </div>

        <div class="metric-card">
          <span class="metric-icon">⚡</span>
          <div class="metric-value" [class.danger]="latestMetric.max_magnitude >= 6">
            {{ latestMetric.max_magnitude | number:'1.1-1' }}
          </div>
          <div class="metric-label">Magnitud máxima</div>
        </div>

        <div class="metric-card distribution">
          <span class="metric-icon">📈</span>
          <div class="metric-label" style="margin-bottom:0.75rem">Distribución</div>
          @for (range of distributionEntries; track range.key) {
            <div class="dist-row">
              <span class="dist-label">{{ range.key }}</span>
              <div class="dist-bar-container">
                <div
                  class="dist-bar"
                  [style.width.%]="getBarWidth(range.value)"
                  [style.background]="getBarColor(range.key)"
                ></div>
              </div>
              <span class="dist-count">{{ range.value }}</span>
            </div>
          }
        </div>
      </div>
    } @else {
      <div class="no-data">Sin datos de métricas disponibles</div>
    }
  `,
  styles: [`
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .metric-card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 1.25rem; }
    .metric-icon { font-size: 1.5rem; }
    .metric-value { font-size: 2rem; font-weight: 700; color: #e6edf3; margin: 0.5rem 0 0.25rem; }
    .metric-value.danger { color: #e94560; }
    .metric-label { color: #8b949e; font-size: 0.85rem; }
    .distribution { grid-column: span 2; }
    .dist-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem; }
    .dist-label { width: 70px; font-size: 0.8rem; color: #8b949e; text-transform: capitalize; }
    .dist-bar-container { flex: 1; background: #21262d; border-radius: 4px; height: 8px; overflow: hidden; }
    .dist-bar { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .dist-count { width: 30px; text-align: right; font-size: 0.8rem; color: #e6edf3; }
    .no-data { color: #8b949e; text-align: center; padding: 2rem; }
  `],
})
export class MetricsCardsComponent {
  @Input() metrics: Metric[] = [];

  /** La métrica más reciente es la primera (ordenadas por window desc). */
  get latestMetric(): Metric | null {
    return this.metrics[0] ?? null;
  }

  get distributionEntries(): { key: string; value: number }[] {
    if (!this.latestMetric) return [];
    return Object.entries(this.latestMetric.magnitude_distribution).map(
      ([key, value]) => ({ key, value })
    );
  }

  getBarWidth(count: number): number {
    if (!this.latestMetric) return 0;
    const total = this.latestMetric.earthquake_count || 1;
    return Math.round((count / total) * 100);
  }

  getBarColor(range: string): string {
    const colors: Record<string, string> = {
      micro: '#3fb950', menor: '#58a6ff', ligero: '#f0883e',
      moderado: '#d29922', fuerte: '#e94560', mayor: '#8b1538',
    };
    return colors[range] ?? '#8b949e';
  }
}
