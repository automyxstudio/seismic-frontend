/**
 * Componente de mapa interactivo con Leaflet.
 *
 * Muestra los sismos en tiempo real como marcadores en el mapa.
 * El color del marcador refleja la magnitud:
 *   - Verde: micro/menor (< 4.0)
 *   - Naranja: ligero/moderado (4.0 – 5.9)
 *   - Rojo: fuerte/mayor (>= 6.0)
 *
 * Usa effect() de Angular Signals para reaccionar a nuevos eventos
 * sin necesidad de detectar cambios manualmente.
 */

import {
  Component, Input, OnInit, OnDestroy, ElementRef,
  ViewChild, effect, signal,
} from '@angular/core';
import * as L from 'leaflet';
import { Earthquake } from '../../../../core/models/earthquake.model';

@Component({
  selector: 'app-earthquake-map',
  standalone: true,
  template: `<div #mapContainer style="width:100%;height:100%;"></div>`,
})
export class EarthquakeMapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;

  /** Eventos sísmicos en tiempo real recibidos del Dashboard vía WebSocket. */
  @Input() set liveEvents(events: Earthquake[]) {
    this._liveEvents.set(events);
  }

  private _liveEvents = signal<Earthquake[]>([]);
  private map!: L.Map;
  private markers = new Map<string, L.CircleMarker>();

  constructor() {
    // effect() reacciona automáticamente cuando _liveEvents cambia
    effect(() => {
      const events = this._liveEvents();
      if (this.map && events.length > 0) {
        this._addMarker(events[0]); // el primero es siempre el más nuevo
      }
    });
  }

  ngOnInit(): void {
    this.map = L.map(this.mapContainer.nativeElement).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private _addMarker(event: Earthquake): void {
    // Evitar marcadores duplicados
    if (this.markers.has(event.event_id)) return;

    const marker = L.circleMarker([event.latitude, event.longitude], {
      radius: Math.max(4, event.magnitude * 2),
      fillColor: this._getColor(event.magnitude),
      color: '#fff',
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.7,
    }).addTo(this.map);

    marker.bindPopup(`
      <strong>${event.location}</strong><br>
      Magnitud: <b>${event.magnitude}</b> (${event.magnitude_range})<br>
      Profundidad: ${event.depth} km<br>
      ${new Date(event.event_time).toLocaleString()}
    `);

    this.markers.set(event.event_id, marker);
  }

  private _getColor(magnitude: number): string {
    if (magnitude >= 6.0) return '#e94560';  // rojo — fuerte/mayor
    if (magnitude >= 4.0) return '#f0883e';  // naranja — ligero/moderado
    return '#3fb950';                         // verde — micro/menor
  }
}
