<script setup lang="ts">
import { computed } from 'vue'
import type { AlertLevel, HistorySeries, MetricKey, MetricThreshold } from '../types'
import { METRIC_META } from '../types'
import { classifyMetric, LEVEL_TEXT } from '../alerts'

const props = defineProps<{
  history: HistorySeries | null
  thresholds: Partial<Record<MetricKey, MetricThreshold>>
}>()

interface AlertItem {
  metric: MetricKey
  value: number
  time: string
  level: AlertLevel
}

const alerts = computed<AlertItem[]>(() => {
  const result: AlertItem[] = []

  for (const series of props.history?.series ?? []) {
    for (const point of series.points) {
      const level = classifyMetric(series.metric, point.v, props.thresholds[series.metric])
      if (level !== 'ok') {
        result.push({
          metric: series.metric,
          value: point.v,
          time: point.t,
          level,
        })
      }
    }
  }

  return result
    .sort((a, b) => +new Date(b.time) - +new Date(a.time))
    .slice(0, 30)
})


function formatDate(time: string): string {
  return new Date(time).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="alerts-panel">
    <div v-if="alerts.length === 0" class="alerts-empty">
      <span class="check-icon">✓</span>
      <div>
        <strong>Nenhuma ocorrência</strong>
        <span>Todos os dados estão dentro da faixa segura neste período.</span>
      </div>
    </div>

    <div v-else class="alert-list">
      <div
        v-for="(alert, index) in alerts"
        :key="`${alert.time}-${alert.metric}-${index}`"
        class="alert-row"
      >
        <div :class="['alert-symbol', `badge-${alert.level}`]">!</div>
        <div class="alert-info">
          <strong>{{ METRIC_META[alert.metric].label }}</strong>
          <span>{{ formatDate(alert.time) }}</span>
        </div>
        <div class="alert-value">
          {{ alert.value.toLocaleString('pt-BR', {
            minimumFractionDigits: METRIC_META[alert.metric].decimals,
            maximumFractionDigits: METRIC_META[alert.metric].decimals
          }) }}
          {{ METRIC_META[alert.metric].unit }}
        </div>
        <span :class="['table-level', `badge-${alert.level}`]">
          {{ LEVEL_TEXT[alert.level] }}
        </span>
      </div>
    </div>
  </section>
</template>
