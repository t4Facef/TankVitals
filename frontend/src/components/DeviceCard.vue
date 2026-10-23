<script setup lang="ts">
import { computed } from 'vue'
import { classify, healthLevel, LEVEL_TEXT, rangeScale, safeRangeLabel } from '../alerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useRecentSeries } from '../composables/useRecentSeries'
import type { Device } from '../domain/devices'
import { formatRul } from '../domain/insights'
import { fieldIcon, KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import Sparkline from './Sparkline.vue'

/**
 * Um dispositivo do cadastro como cartão (WEB-03): o que ele é, se está
 * publicando e o que está dizendo agora, com o mini gráfico das últimas
 * leituras. O cartão inteiro é um botão que abre o detalhe.
 */
const props = defineProps<{
  device: Device
  level: ItemLevel
  insight: { health: number; rul_h: number | null } | null
}>()

const emit = defineEmits<{ open: [device: Device] }>()

const { value, state } = useLiveValues()
const { connection, ageSeconds } = useDeviceState()
const { recentSeries } = useRecentSeries()

function format(n: number | null, decimals: number): string {
  return n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** "online · agora", "parou há 3 min", "sem dados", "desativado". */
const situation = computed(() => {
  if (!props.device.active) return { cls: 'is-inactive', text: 'Desativado' }
  const link = connection(props.device.id)
  const age = ageSeconds(props.device.id)
  if (link === 'online') return { cls: 'is-online', text: `Online · ${formatAge(age ?? 0)}` }
  if (link === 'never') return { cls: 'is-never', text: 'Sem dados ainda' }
  return { cls: 'is-stale', text: `Parou ${formatAge(age ?? 0)}` }
})

const readings = computed(() =>
  props.device.fields.map((field) => {
    const current = value(props.device.id, field.key)
    return {
      field,
      icon: fieldIcon(field.key),
      text: format(current, field.decimals),
      unit: field.unit,
      level: current !== null && field.range ? classify(current, field.range) : null,
      scale: rangeScale(field.range, current, field.unit),
      points: recentSeries(props.device.id, field.key),
    }
  }),
)

const stateNow = computed(() => (props.device.state_field ? state(props.device.id, props.device.state_field) : null))
const stateKey = computed(() => (stateNow.value === null ? 'unknown' : stateNow.value ? 'on' : 'off'))
const statePoints = computed(() =>
  props.device.state_field ? recentSeries(props.device.id, props.device.state_field, true) : [],
)

const health = computed(() =>
  props.insight ? { ...props.insight, level: healthLevel(props.insight.health, props.insight.rul_h) } : null,
)

const levelIcon = computed(() => (props.level === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[props.level]))
</script>

<template>
  <button
    type="button"
    :class="['device-card', `kind-${device.kind}`, `level-${level}`, { 'is-inactive': !device.active }]"
    @click="emit('open', device)"
  >
    <span class="card-head">
      <span class="card-icon"><component :is="KIND_ICON[device.kind]" :size="18" aria-hidden="true" /></span>
      <span class="card-title">
        <strong>{{ device.name }}</strong>
        <code>{{ device.id }}</code>
      </span>
      <span v-if="device.active" :class="['table-level', `badge-${level}`]">
        <component :is="levelIcon" :size="12" aria-hidden="true" />
        {{ ITEM_LEVEL_TEXT[level] }}
      </span>
      <span v-else class="table-level badge-vazio">Desativado</span>
    </span>

    <!-- Sensor: a leitura, o caminho dela e onde ela está na faixa. -->
    <span v-if="device.kind === 'sensor'" class="card-body">
      <span v-for="r in readings" :key="r.field.key" class="card-reading">
        <span class="card-value">
          {{ r.text }}<small v-if="r.text !== '—'"> {{ r.unit }}</small>
        </span>
        <span class="card-field">
          <component :is="r.icon" :size="13" aria-hidden="true" />
          {{ r.field.label }}
        </span>
        <span class="card-spark"><Sparkline :points="r.points" :ok-min="r.field.range?.ok_min" :ok-max="r.field.range?.ok_max" :width="240" :height="36" /></span>
        <span v-if="r.scale" class="metric-scale card-scale" aria-hidden="true">
          <span class="metric-scale-ideal" :style="{ left: r.scale.left, width: r.scale.width }" />
          <span class="metric-scale-mark" :style="{ left: r.scale.at }" />
        </span>
        <span class="card-range">{{ safeRangeLabel(r.field.range, r.field.unit) }}</span>
      </span>
    </span>

    <!-- Equipamento: a saúde prevista pela IA e as variáveis que mudam quando ele desgasta. -->
    <span v-else-if="device.kind === 'equipment'" class="card-body">
      <span class="card-health">
        <template v-if="health">
          <strong>{{ format(health.health, 0) }} %</strong>
          <span :class="['table-level', `badge-${health.level}`]">{{ LEVEL_TEXT[health.level] }}</span>
          <small>saúde prevista · vida útil {{ health.rul_h === null ? '—' : formatRul(health.rul_h) }}</small>
        </template>
        <small v-else>Aguardando a primeira previsão da IA.</small>
      </span>
      <span class="card-vars">
        <span v-for="r in readings" :key="r.field.key" :class="r.level ? `is-${r.level}` : ''">
          <small><component :is="r.icon" :size="13" aria-hidden="true" /> {{ r.field.short }}</small>
          <b>{{ r.text }}<i v-if="r.text !== '—'"> {{ r.unit }}</i></b>
          <span class="card-spark"><Sparkline :points="r.points" :ok-min="r.field.range?.ok_min" :ok-max="r.field.range?.ok_max" :width="120" :height="22" /></span>
        </span>
      </span>
      <span v-if="device.state_field" :class="['card-state', `is-${stateKey}`]">
        <span class="card-state-dot" aria-hidden="true" />
        {{ { on: 'Ligada', off: 'Desligada', unknown: 'Sem dados' }[stateKey] }}
      </span>
    </span>

    <!-- Atuador: ligado ou não, quem manda nele e como ficou nas últimas leituras. -->
    <span v-else class="card-body">
      <span :class="['card-state', 'is-big', `is-${stateKey}`]">
        <span class="card-state-dot" aria-hidden="true" />
        {{ { on: 'Ligado', off: 'Desligado', unknown: 'Sem dados' }[stateKey] }}
      </span>
      <span class="card-control">{{ device.control === 'rule' ? 'Automático, pela regra' : 'Manual, pelo dashboard e pelo 3D' }}</span>
      <span class="card-spark"><Sparkline :points="statePoints" :width="240" :height="26" /></span>
    </span>

    <span :class="['card-foot', situation.cls]">
      <span class="card-dot" aria-hidden="true" />
      {{ situation.text }}
      <span class="card-open">Detalhes <component :is="UI_ICON.abrir" :size="14" aria-hidden="true" /></span>
    </span>
  </button>
</template>

<style scoped>
.device-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 14px 16px 12px;
  border: var(--bw-strong) solid var(--line);
  border-radius: var(--radius);
  color: var(--ink);
  font: inherit;
  text-align: left;
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.device-card:hover {
  border-color: var(--accent);
  box-shadow: 0 6px 18px rgba(10, 35, 55, 0.08);
}

.device-card:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

/* O estado aparece também numa faixa na borda de cima. */
.device-card.level-atencao {
  border-top: 4px solid var(--atencao-mark);
}

.device-card.level-critico {
  border-color: var(--nivel-critico);
  border-top-width: 4px;
}

.device-card.is-inactive {
  border-style: dashed;
  opacity: 0.72;
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.card-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--accent);
  background: var(--surface-2);
}

.kind-equipment .card-icon {
  color: var(--brand-fish);
}

.kind-actuator .card-icon {
  color: var(--night);
}

.card-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.card-title strong {
  font-size: 0.9688rem;
  font-weight: var(--fw-heavy);
  line-height: 1.25;
}

.card-title code {
  color: var(--muted);
  font-size: 0.75rem;
}

.card-head .table-level {
  flex: 0 0 auto;
}

.card-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
}

.card-reading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-value {
  font-size: 1.875rem;
  font-weight: var(--fw-heavy);
  letter-spacing: -0.02em;
  line-height: 1;
}

.card-value small {
  color: var(--muted);
  font-size: 0.875rem;
  letter-spacing: 0;
}

.card-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.card-spark {
  display: block;
  width: 100%;
}

.card-spark :deep(.sparkline) {
  width: 100%;
  height: 36px;
}

.card-scale {
  margin-top: 2px;
}

.card-range {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.card-health {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.card-health strong {
  font-size: 1.875rem;
  font-weight: var(--fw-heavy);
  line-height: 1;
}

.card-health small {
  flex-basis: 100%;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.card-vars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.card-vars > span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-left: 3px solid var(--nivel-ok);
  border-radius: 8px;
  background: var(--surface-2);
}

.card-vars > span.is-atencao {
  border-left-color: var(--atencao-mark);
}

.card-vars > span.is-critico {
  border-left-color: var(--nivel-critico);
}

.card-vars small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.card-vars b {
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.card-vars i {
  color: var(--muted);
  font-size: 0.75rem;
  font-style: normal;
}

.card-vars .card-spark :deep(.sparkline) {
  height: 22px;
}

.card-state {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 7px;
  padding: 3px 11px;
  border: var(--bw) solid var(--line);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.card-state.is-big {
  padding: 6px 14px;
  font-size: 1rem;
}

.card-state-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--muted);
}

.card-state.is-on {
  color: var(--surface);
  border-color: var(--accent);
  background: var(--accent);
}

.card-state.is-on .card-state-dot {
  background: var(--surface);
}

.card-state.is-unknown {
  color: var(--muted);
  border-style: dashed;
}

.card-control {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-top: 10px;
  border-top: var(--bw) solid var(--line-soft);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.card-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--muted);
}

.card-foot.is-online {
  color: var(--ok-ink);
}

.card-foot.is-online .card-dot {
  background: var(--nivel-ok);
}

.card-foot.is-stale {
  color: var(--atencao-text);
}

.card-foot.is-stale .card-dot {
  background: var(--atencao-mark);
}

.card-foot.is-never .card-dot,
.card-foot.is-inactive .card-dot {
  border: 2px dashed var(--muted);
  background: transparent;
}

.card-open {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  color: var(--accent);
  font-weight: var(--fw-heavy);
}
</style>
