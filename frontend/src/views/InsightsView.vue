<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { healthLevel } from '../alerts'
import { getInsightHistory } from '../api/insights'
import EquipmentInsight from '../components/EquipmentInsight.vue'
import RangeSelector from '../components/RangeSelector.vue'
import { useAlerts } from '../composables/useAlerts'
import { useHistoryData } from '../composables/useHistoryData'
import { useItemLevel, type ItemLevel } from '../composables/useItemLevel'
import { LEVEL_ICON, UI_ICON } from '../icons'
import { useDevicesStore } from '../stores/devices'
import type { HistoryRange } from '../types'

/**
 * Insights (IA-09): o resumo da IA para quem opera, um bloco por
 * equipamento. Usa a mesma previsão do store que pinta a bomba no 3D, então
 * as duas telas mudam juntas durante uma falha.
 */
const devicesStore = useDevicesStore()
const route = useRoute()
const { alerts } = useAlerts()
const { insight } = useItemLevel(() => alerts.value)

// 1 h por padrão: uma falha injetada leva uns 6 min, e é aí que ela aparece inteira.
const range = ref<HistoryRange>('1h')
const { loading, error, series } = useHistoryData(range, getInsightHistory)

onMounted(() => void devicesStore.load())

const equipment = computed(() =>
  devicesStore.devices
    .filter((device) => device.kind === 'equipment' && device.active)
    .map((device) => {
      const prediction = insight(device.id)
      const level: ItemLevel = prediction ? healthLevel(prediction.health, prediction.rul_h) : 'vazio'
      return { device, prediction, level }
    }),
)

const counts = computed(() => {
  const list = equipment.value
  return {
    total: list.length,
    ok: list.filter((e) => e.level === 'ok').length,
    bad: list.filter((e) => e.level === 'atencao' || e.level === 'critico').length,
    waiting: list.filter((e) => e.level === 'vazio').length,
    aiOpen: alerts.value.filter((a) => a.field === null && a.closed_at === null).length,
  }
})

const model = computed(() => equipment.value.find((e) => e.prediction?.model)?.prediction?.model ?? null)

// "/insights#bomba-rec-01", o link do 3D e de Dispositivos: rola até o bloco quando ele existir.
watch(
  () => [route.hash, equipment.value.length] as const,
  async ([hash, count]) => {
    if (!hash || !count) return
    await nextTick()
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  },
  { immediate: true },
)
</script>

<template>
  <main class="dashboard insights-page">
    <header class="page-header">
      <div>
        <h2>Insights</h2>
        <p>
          A saúde e a vida útil restante de cada equipamento, previstas pela IA a partir das leituras, com a tendência
          e o que fazer em cada alerta.
        </p>
      </div>
      <div class="insights-tools">
        <span v-if="model" class="model-chip">Modelo em uso: <b>{{ model }}</b></span>
        <RangeSelector v-model="range" />
      </div>
    </header>

    <div v-if="devicesStore.error" class="global-error">
      <component :is="LEVEL_ICON.critico" :size="20" aria-hidden="true" />
      <div>
        <strong>Não foi possível carregar o cadastro</strong>
        <small>{{ devicesStore.error }}</small>
      </div>
      <button type="button" @click="devicesStore.load(true)">Tentar de novo</button>
    </div>

    <div class="summary" aria-label="Resumo dos equipamentos">
      <div class="summary-tile">
        <span>Equipamentos vigiados</span>
        <strong>{{ counts.total }}</strong>
        <small>{{ counts.waiting ? `${counts.waiting} sem previsão recente` : 'todos com previsão' }}</small>
      </div>
      <div :class="['summary-tile', { 'is-online': counts.ok > 0 }]">
        <span>Saudáveis</span>
        <strong>{{ counts.ok }}</strong>
        <small>saúde de 70 % para cima</small>
      </div>
      <div :class="['summary-tile', { 'is-warn': counts.bad > 0 }]">
        <span>Em atenção ou crítico</span>
        <strong>{{ counts.bad }}</strong>
        <small>{{ counts.bad ? 'veja o que fazer abaixo' : 'nenhum desgaste à vista' }}</small>
      </div>
      <div :class="['summary-tile', { 'is-bad': counts.aiOpen > 0 }]">
        <span>Alertas da IA abertos</span>
        <strong>{{ counts.aiOpen }}</strong>
        <small>3 previsões ruins seguidas abrem</small>
      </div>
    </div>

    <div v-if="devicesStore.loading && !equipment.length" class="loading-state">
      <span class="spinner" />
      Carregando os equipamentos…
    </div>

    <section v-else-if="!equipment.length" class="panel insights-empty">
      <component :is="UI_ICON.semDado" :size="24" aria-hidden="true" />
      <strong>Nenhum equipamento ativo no cadastro</strong>
      <span>A IA acompanha os equipamentos, como a bomba de recirculação. Cadastre um em Dispositivos.</span>
      <RouterLink class="button" :to="{ name: 'dispositivos' }">Ir para Dispositivos</RouterLink>
    </section>

    <EquipmentInsight
      v-for="e in equipment"
      :key="e.device.id"
      :device="e.device"
      :prediction="e.prediction"
      :alerts="alerts"
      :health="series(e.device.id, 'health')"
      :rul="series(e.device.id, 'rul_h')"
      :range="range"
      :loading="loading"
      :error="error"
    />
  </main>
</template>

<style scoped>
.insights-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

.model-chip {
  padding: 6px 12px;
  border: var(--bw) solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
  background: var(--surface);
}

.model-chip b {
  color: var(--ink);
}

.insights-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 40px 18px;
  color: var(--muted);
  text-align: center;
}

.insights-empty strong {
  color: var(--ink);
  font-weight: var(--fw-heavy);
}
</style>
