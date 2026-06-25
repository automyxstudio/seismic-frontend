/**
 * Modelos TypeScript que reflejan los schemas de la API del backend.
 * Mantenerlos sincronizados con src/models/ del backend.
 */

export type MagnitudeRange = 'micro' | 'menor' | 'ligero' | 'moderado' | 'fuerte' | 'mayor';

export interface Earthquake {
  id: string;
  event_id: string;
  magnitude: number;
  magnitude_range: MagnitudeRange;
  location: string;
  latitude: number;
  longitude: number;
  depth: number;
  event_time: string;
  ingested_at: string;
}

export interface EarthquakeListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Earthquake[];
}

export interface MagnitudeDistribution {
  micro: number;
  menor: number;
  ligero: number;
  moderado: number;
  fuerte: number;
  mayor: number;
}

export interface Metric {
  id: string;
  window: string;
  earthquake_count: number;
  avg_magnitude: number;
  max_magnitude: number;
  magnitude_distribution: MagnitudeDistribution;
  updated_at: string;
}

export interface HourlyReport {
  id: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_events: number;
  average_magnitude: number;
  max_magnitude: number;
  top_locations: string[];
  magnitude_distribution: MagnitudeDistribution;
  generated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
}
