import { classify, worstLevel } from '../alerts'
import type { Device } from '../domain/devices'
import { isFresh } from '../live/freshness'
import { useLiveStore } from '../stores/live'
import type { AlertLevel } from '../types'
import { useLiveValues } from './useLiveValues'
import { useNow } from './useNow'

/**
 * Situação de cada dispositivo pela telemetria: publicando agora, parou ou
 * nunca publicou. "Sem dados" é o que um sensor recém-cadastrado mostra até a
 * primeira leitura chegar.
 */
export type Connection = 'online' | 'stale' | 'never'

export function useDeviceState() {
  const live = useLiveStore()
  const now = useNow()
  const { value } = useLiveValues()

  function connection(deviceId: string): Connection {
    const msg = live.latest[deviceId]
    if (!msg) return 'never'
    return isFresh(msg.ts, now.value) ? 'online' : 'stale'
  }

  /** Segundos desde a última telemetria, ou `null` se nunca chegou. */
  function ageSeconds(deviceId: string): number | null {
    const msg = live.latest[deviceId]
    return msg ? Math.max(0, Math.round((now.value - Date.parse(msg.ts)) / 1000)) : null
  }

  /**
   * O pior nível entre as variáveis com faixa, pela leitura de agora. `null`
   * quando não há leitura recente de nenhuma delas.
   */
  function rangeLevel(device: Device): AlertLevel | null {
    const levels: AlertLevel[] = []
    for (const field of device.fields) {
      if (!field.range) continue
      const current = value(device.id, field.key)
      if (current !== null) levels.push(classify(current, field.range))
    }
    return levels.length ? worstLevel(levels) : null
  }

  return { connection, ageSeconds, rangeLevel }
}

/** "agora", "há 12 s", "há 3 min", "há 2 h". */
export function formatAge(seconds: number): string {
  if (seconds < 2) return 'agora'
  if (seconds < 120) return `há ${seconds} s`
  if (seconds < 7200) return `há ${Math.round(seconds / 60)} min`
  return `há ${Math.round(seconds / 3600)} h`
}
