import type { AlertLevel, MetricKey, MetricThreshold } from './types'

/**
 * Classifica um valor nos três níveis da ARQUITETURA §5.
 *
 * Espelha a regra do backend (`app/alerts.py`) usando os limites que vêm de
 * `GET /api/thresholds` — o front não tem número de faixa próprio. Serve para
 * classificar os pontos do histórico, que chegam sem nível; a leitura atual já
 * vem classificada pela API e não passa por aqui.
 */

// Em turbidez o ok_max é exclusivo: 40 NTU já é atenção (ARQUITETURA §6).
// Nas outras grandezas é inclusivo: 28,0 °C ainda é ok, 28,1 é atenção.
const OK_MAX_EXCLUSIVO: readonly MetricKey[] = ['turbidity_ntu']

export function classifyMetric(
  metric: MetricKey,
  value: number,
  threshold?: MetricThreshold,
): AlertLevel {
  if (!threshold) return 'ok'

  const { ok_min, ok_max, crit_min, crit_max } = threshold

  if (crit_min !== null && value < crit_min) return 'critico'
  if (crit_max !== null && value > crit_max) return 'critico'

  if (ok_min !== null && value < ok_min) return 'atencao'
  if (ok_max !== null) {
    const acima = OK_MAX_EXCLUSIVO.includes(metric) ? value >= ok_max : value > ok_max
    if (acima) return 'atencao'
  }

  return 'ok'
}

export const LEVEL_TEXT: Record<AlertLevel, string> = {
  ok: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
}

/** Texto da faixa ideal mostrado no card, a partir dos limites da API. */
export function safeRangeLabel(threshold: MetricThreshold | undefined, unit: string): string {
  if (!threshold) return 'faixa segura não disponível'

  const { ok_min, ok_max } = threshold
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  // Turbidez tem ok_min 0, que não informa nada — o que importa é o teto.
  if (ok_max !== null && ok_min !== null && ok_min > 0) return `ideal: ${n(ok_min)}–${n(ok_max)} ${unit}`
  if (ok_max !== null) return `ideal: < ${n(ok_max)} ${unit}`
  if (ok_min !== null) return `ideal: ≥ ${n(ok_min)} ${unit}`

  return 'faixa segura não disponível'
}
