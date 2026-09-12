export type AlertLevel = 'ok' | 'atencao' | 'critico'
export type ConnectionMode = 'websocket' | 'polling' | 'disconnected'

export type MetricKey =
  | 'temperature_c'
  | 'ph'
  | 'level_pct'
  | 'turbidity_ntu'

export interface MetricValue {
  value: number
  level: AlertLevel
  unit: string
}

export interface LatestReading {
  tank_id: string
  device_id: string
  time: string
  age_s: number
  online: boolean
  level: AlertLevel
  metrics: Partial<Record<MetricKey, MetricValue>>
}

export interface HistoryPoint {
  t: string
  v: number
}

export interface HistorySeriesItem {
  metric: MetricKey
  unit: string
  points: HistoryPoint[]
}

export interface HistorySeries {
  tank_id: string
  range: HistoryRange
  window: string
  series: HistorySeriesItem[]
}

export interface StatsMetric {
  min: number
  max: number
  avg: number
  last: number
}

export interface Stats {
  tank_id: string
  range: HistoryRange
  count: number
  metrics: Partial<Record<MetricKey, StatsMetric>>
}

/**
 * Formato de `GET /api/thresholds` (ARQUITETURA §6, "Formatos auxiliares").
 *
 * Os limites moram no backend (`app/config.py`) e chegam por aqui — o front
 * não repete número de faixa. `null` significa "não existe esse limite":
 * nível não tem alerta por valor alto, por exemplo.
 */
export interface MetricThreshold {
  ok_min: number | null
  ok_max: number | null
  crit_min: number | null
  crit_max: number | null
}

export type Thresholds = Partial<Record<MetricKey, MetricThreshold>>

export interface TankInfo {
  tank_id: string
  device_id?: string
  last_seen?: string
  online: boolean
}

export interface HealthResponse {
  status: string
  mqtt?: string
  influxdb?: string
  [key: string]: unknown
}

export interface LiveMessage {
  type: 'reading' | 'status'
  payload: LatestReading | { tank_id: string; online: boolean }
}

export type HistoryRange = '1h' | '6h' | '24h' | '7d'

export const METRIC_META: Record<MetricKey, {
  label: string
  shortLabel: string
  unit: string
  decimals: number
  icon: string
}> = {
  temperature_c: {
    label: 'Temperatura da água',
    shortLabel: 'Temperatura',
    unit: '°C',
    decimals: 1,
    icon: '🌡️',
  },
  ph: {
    label: 'pH',
    shortLabel: 'pH',
    unit: 'pH',
    decimals: 2,
    icon: '🧪',
  },
  level_pct: {
    label: 'Nível da água',
    shortLabel: 'Nível',
    unit: '%',
    decimals: 1,
    icon: '💧',
  },
  turbidity_ntu: {
    label: 'Turbidez',
    shortLabel: 'Turbidez',
    unit: 'NTU',
    decimals: 1,
    icon: '🔬',
  },
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  temperature_c: { ok_min: 24, ok_max: 28, crit_min: 22, crit_max: 30 },
  ph: { ok_min: 6.5, ok_max: 8, crit_min: 6, crit_max: 8.5 },
  level_pct: { ok_min: 30, ok_max: null, crit_min: 15, crit_max: null },
  turbidity_ntu: { ok_min: 0, ok_max: 40, crit_min: 0, crit_max: 60 },
}
