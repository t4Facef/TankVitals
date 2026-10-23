import { MOCK } from '../config'
import type { HistoryResponse } from '../domain/devices'
import { mockGetInsightHistory } from '../mock/api'
import type { HistoryRange } from '../types'
import { request } from './http'

/**
 * Histórico das previsões da IA (IA-09): a saúde (`health`) e a vida útil
 * restante (`rul_h`) de cada equipamento, no mesmo formato do
 * `GET /api/history`. Vem do measurement `insight` do InfluxDB (PLAT-06).
 */
export function getInsightHistory(range: HistoryRange, devices?: string[]): Promise<HistoryResponse> {
  if (MOCK) return mockGetInsightHistory(range, devices)
  const params = new URLSearchParams({ range })
  devices?.forEach((device) => params.append('device', device))
  return request<HistoryResponse>(`/api/insights/history?${params.toString()}`)
}
