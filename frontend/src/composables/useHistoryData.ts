import { onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'
import { getHistory } from '../api/devices'
import { variableId, type HistoryResponse, type Series } from '../domain/devices'
import type { HistoryRange } from '../types'

/**
 * Histórico de todas as variáveis no período escolhido, buscado de uma vez e
 * renovado sozinho. A cada renovação a tela continua mostrando o histórico
 * anterior: só a troca de período mostra o "carregando".
 *
 * Por padrão são as leituras (`GET /api/history`); a Insights passa
 * `getInsightHistory`, que devolve as previsões da IA no mesmo formato.
 */
const REFRESH_MS: Record<HistoryRange, number> = {
  '1h': 10_000,
  '6h': 30_000,
  '24h': 60_000,
  '7d': 300_000,
}

export function useHistoryData(
  range: Ref<HistoryRange>,
  fetchHistory: (range: HistoryRange) => Promise<HistoryResponse> = getHistory,
) {
  const data = shallowRef<HistoryResponse | null>(null)
  const byVariable = shallowRef(new Map<string, Series>())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const updatedAt = ref<Date | null>(null)
  let timer: number | undefined
  let request = 0

  async function load(showLoading: boolean): Promise<void> {
    const current = ++request
    if (showLoading) loading.value = true
    try {
      const response = await fetchHistory(range.value)
      // Uma resposta atrasada de outro período não sobrescreve a atual.
      if (current !== request) return
      data.value = response
      byVariable.value = new Map(response.series.map((s) => [variableId(s.device, s.field), s]))
      updatedAt.value = new Date()
      error.value = null
    } catch (err) {
      if (current !== request) return
      error.value = err instanceof Error ? err.message : 'Não foi possível carregar o histórico.'
    } finally {
      if (current === request) loading.value = false
    }
  }

  watch(
    range,
    (value) => {
      window.clearInterval(timer)
      data.value = null
      byVariable.value = new Map()
      void load(true)
      timer = window.setInterval(() => void load(false), REFRESH_MS[value])
    },
    { immediate: true },
  )

  onUnmounted(() => window.clearInterval(timer))

  function series(deviceId: string, field: string): Series | undefined {
    return byVariable.value.get(variableId(deviceId, field))
  }

  return { data, loading, error, updatedAt, series, reload: () => load(false) }
}
