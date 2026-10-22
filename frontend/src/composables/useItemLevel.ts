import { healthLevel, worstLevel } from '../alerts'
import type { Alert, Device } from '../domain/devices'
import { useLiveStore } from '../stores/live'
import type { AlertLevel } from '../types'
import { useDeviceState } from './useDeviceState'
import { useNow } from './useNow'

/** Estado de um item na cena e no painel: os três níveis ou "sem dados". */
export type ItemLevel = AlertLevel | 'vazio'

export const ITEM_LEVEL_TEXT: Record<ItemLevel, string> = {
  ok: 'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
  vazio: 'Sem dados',
}

/** Previsão da IA mais velha que isso não vale mais (elas chegam mais espaçadas). */
const INSIGHT_MAX_AGE_MS = 60_000

/**
 * A cor de cada item (WEB-06): vale o pior entre a faixa do sensor, a saúde
 * prevista pela IA e um alerta aberto da IA. Sem telemetria recente do próprio
 * item, é "sem dados", nunca a cor de uma leitura velha.
 *
 * `alerts` é a lista de `GET /api/alerts`; os da IA são os sem `field`, porque
 * não vêm de uma faixa e sim da previsão.
 */
export function useItemLevel(alerts: () => Alert[]) {
  const live = useLiveStore()
  const now = useNow()
  const { connection, rangeLevel } = useDeviceState()

  /** Saúde e vida útil da última previsão, se ela for recente. */
  function insight(deviceId: string): { health: number; rul_h: number | null; model: string | null } | null {
    const msg = live.insights[deviceId]
    if (!msg || now.value - Date.parse(msg.ts) > INSIGHT_MAX_AGE_MS) return null
    const { health, rul_h: rul, model_version: model } = msg.payload
    if (typeof health !== 'number') return null
    return { health, rul_h: typeof rul === 'number' ? rul : null, model: typeof model === 'string' ? model : null }
  }

  function aiLevel(deviceId: string): AlertLevel | null {
    const levels: AlertLevel[] = []
    const prediction = insight(deviceId)
    if (prediction) levels.push(healthLevel(prediction.health, prediction.rul_h))
    for (const alert of alerts()) {
      if (alert.device === deviceId && alert.field === null && alert.closed_at === null) levels.push(alert.level)
    }
    return levels.length ? worstLevel(levels) : null
  }

  function level(device: Device): ItemLevel {
    if (connection(device.id) !== 'online') return 'vazio'
    return worstLevel([rangeLevel(device) ?? 'ok', aiLevel(device.id) ?? 'ok'])
  }

  return { level, insight, aiLevel }
}
