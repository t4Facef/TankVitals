<script setup lang="ts">
import { computed, useId } from 'vue'
import { classify, healthLevel, LEVEL_TEXT, rangeScale } from '../alerts'
import { formatAge } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useRecentSeries } from '../composables/useRecentSeries'
import type { TankSummary } from '../composables/useTwinTanks'
import { controllables, type Alert, type Device } from '../domain/devices'
import { formatRul } from '../domain/insights'
import { fieldIcon, KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import { TANK } from '../plant/layout'
import ActuatorControl from './ActuatorControl.vue'
import Sparkline from './Sparkline.vue'

/**
 * As estatísticas do aquário em foco no 3D: o estado geral, as leituras da
 * água, a saúde da bomba prevista pela IA, os atuadores com os botões, os
 * alertas abertos e os itens do tanque. Tudo ao vivo, pelo store.
 */
const props = defineProps<{
  tank: TankSummary
  insight: (deviceId: string) => { health: number; rul_h: number | null; model: string | null } | null
  alerts: Alert[]
  level: (device: Device) => ItemLevel
}>()

const emit = defineEmits<{ select: [deviceId: string]; close: [] }>()

const uid = useId()
const { value, state } = useLiveValues()
const { recentSeries } = useRecentSeries()

const devices = computed(() => props.tank.spec.members.map((m) => m.device))

function rank(role: string): number {
  const i = WATER_ORDER.indexOf(role)
  return i === -1 ? WATER_ORDER.length : i
}

function format(n: number | null, decimals: number): string {
  return n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Cada variável dos sensores do tanque: o que a água está dizendo agora. */
/** A ordem da água: o que mais pesa para o peixe primeiro. */
const WATER_ORDER = ['temperature', 'ph', 'oxygen', 'turbidity', 'level', 'light']

const water = computed(() =>
  props.tank.spec.members
    .filter((m) => m.device.kind === 'sensor')
    .sort((a, b) => rank(a.role) - rank(b.role))
    .map((m) => m.device)
    .flatMap((device) =>
      device.fields.map((field) => {
        const current = value(device.id, field.key)
        return {
          id: `${device.id}:${field.key}`,
          device,
          field,
          icon: fieldIcon(field.key),
          text: format(current, field.decimals),
          level: current === null ? ('vazio' as const) : field.range ? classify(current, field.range) : null,
          scale: rangeScale(field.range, current, field.unit),
          points: recentSeries(device.id, field.key),
        }
      }),
    ),
)

const pump = computed(() => {
  const device = props.tank.pump
  if (!device) return null
  const prediction = props.insight(device.id)
  return {
    device,
    running: device.state_field ? state(device.id, device.state_field) : null,
    health: prediction ? { ...prediction, level: healthLevel(prediction.health, prediction.rul_h) } : null,
    fields: device.fields.map((field) => {
      const current = value(device.id, field.key)
      return { field, text: format(current, field.decimals), level: current !== null && field.range ? classify(current, field.range) : null }
    }),
  }
})

const actuators = computed(() => controllables(devices.value))

const openAlerts = computed(() => {
  const ids = new Set(devices.value.map((d) => d.id))
  return props.alerts
    .filter((alert) => alert.closed_at === null && ids.has(alert.device))
    .map((alert) => {
      const device = devices.value.find((d) => d.id === alert.device)
      const field = device?.fields.find((f) => f.key === alert.field)
      return {
        alert,
        label: field?.short ?? device?.name ?? alert.device,
        value: alert.value === null || !field ? '' : `${format(alert.value, field.decimals)} ${field.unit}`,
        age: formatAge(Math.max(0, Math.round((Date.now() - Date.parse(alert.opened_at)) / 1000))),
      }
    })
})

const levelIcon = computed(() => (props.tank.level === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[props.tank.level]))
</script>

<template>
  <section class="tank-panel" :aria-labelledby="`tanque-${uid}`">
    <header class="tank-head">
      <span class="tank-mark"><component :is="UI_ICON.tanque" :size="20" aria-hidden="true" /></span>
      <div>
        <h3 :id="`tanque-${uid}`">{{ tank.spec.label }}</h3>
        <span><code>{{ tank.spec.id }}</code> · {{ tank.online }} de {{ tank.total }} publicando</span>
      </div>
      <button type="button" class="dialog-close" aria-label="Voltar para a visão geral" @click="emit('close')">
        <component :is="UI_ICON.voltar" :size="18" aria-hidden="true" />
      </button>
    </header>

    <p :class="['tank-level', `badge-${tank.level}`]">
      <component :is="levelIcon" :size="15" aria-hidden="true" />
      {{ ITEM_LEVEL_TEXT[tank.level] }}
      <small v-if="tank.notOk.length"> · {{ tank.notOk.length }} fora do normal</small>
    </p>

    <section v-if="water.length" class="tank-block">
      <h4>Água <small>agora, e as últimas leituras</small></h4>
      <div class="water-grid">
        <button
          v-for="reading in water"
          :key="reading.id"
          type="button"
          :class="['water-tile', reading.level ? `is-${reading.level}` : '']"
          @click="emit('select', reading.device.id)"
        >
          <span class="water-label">
            <component :is="reading.icon" :size="15" aria-hidden="true" />
            {{ reading.field.short }}
          </span>
          <span class="water-value">
            {{ reading.text }}<small v-if="reading.text !== '—' && reading.field.unit !== reading.field.short"> {{ reading.field.unit }}</small>
          </span>
          <Sparkline
            :points="reading.points"
            :ok-min="reading.field.range?.ok_min"
            :ok-max="reading.field.range?.ok_max"
            :width="140"
            :height="26"
          />
          <span v-if="reading.scale" class="metric-scale water-scale" aria-hidden="true">
            <span class="metric-scale-ideal" :style="{ left: reading.scale.left, width: reading.scale.width }" />
            <span class="metric-scale-mark" :style="{ left: reading.scale.at }" />
          </span>
          <span class="sr-only">{{ reading.level ? ITEM_LEVEL_TEXT[reading.level] : 'sem faixa' }}</span>
        </button>
      </div>
    </section>

    <section v-if="pump" class="tank-block">
      <h4>{{ pump.device.name }} <small>{{ pump.running === null ? 'sem dados' : pump.running ? 'ligada' : 'desligada' }}</small></h4>
      <button type="button" class="pump-card" @click="emit('select', pump.device.id)">
        <span class="pump-health">
          <template v-if="pump.health">
            <strong>{{ format(pump.health.health, 0) }} %</strong>
            <span :class="['table-level', `badge-${pump.health.level}`]">{{ LEVEL_TEXT[pump.health.level] }}</span>
            <small>saúde prevista · vida útil {{ pump.health.rul_h === null ? '—' : formatRul(pump.health.rul_h) }}</small>
          </template>
          <small v-else>Aguardando a primeira previsão da IA.</small>
        </span>
        <span class="pump-fields">
          <span v-for="item in pump.fields" :key="item.field.key">
            <component :is="fieldIcon(item.field.key)" :size="14" aria-hidden="true" />
            <span>{{ item.field.short }}</span>
            <b>{{ item.text }}<small v-if="item.text !== '—'"> {{ item.field.unit }}</small></b>
            <i v-if="item.level && item.level !== 'ok'" :class="['table-level', `badge-${item.level}`]">{{ LEVEL_TEXT[item.level] }}</i>
          </span>
        </span>
      </button>
    </section>

    <section v-if="actuators.length" class="tank-block">
      <h4>Atuadores</h4>
      <ul class="actuator-list tank-actuators">
        <ActuatorControl v-for="device in actuators" :key="device.id" :device="device" />
      </ul>
    </section>

    <section class="tank-block">
      <h4>Alertas abertos <small>{{ openAlerts.length ? openAlerts.length : 'nenhum' }}</small></h4>
      <ul v-if="openAlerts.length" class="tank-alerts">
        <li v-for="item in openAlerts" :key="item.alert.id" :class="`is-${item.alert.level}`">
          <component :is="LEVEL_ICON[item.alert.level]" :size="16" aria-hidden="true" />
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.alert.message }} · aberto {{ item.age }}</small>
          </span>
          <b v-if="item.value">{{ item.value }}</b>
        </li>
      </ul>
    </section>

    <section class="tank-block">
      <h4>Itens do tanque</h4>
      <ul class="tank-items">
        <li v-for="device in devices" :key="device.id">
          <button type="button" @click="emit('select', device.id)">
            <component :is="KIND_ICON[device.kind]" :size="16" aria-hidden="true" />
            <span>{{ device.name }}</span>
            <span :class="['table-level', `badge-${level(device)}`]">{{ ITEM_LEVEL_TEXT[level(device)] }}</span>
          </button>
        </li>
      </ul>
    </section>

    <RouterLink v-if="tank.spec.id === TANK.id" class="button tank-dashboard" :to="{ name: 'dashboard' }">
      Ver o histórico no dashboard
    </RouterLink>
  </section>
</template>

<style scoped>
.tank-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tank-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tank-mark {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--brand-fish);
  background: var(--night);
}

.tank-head > div {
  flex: 1;
  min-width: 0;
}

.tank-head h3 {
  font-size: 1.1875rem;
  font-weight: var(--fw-heavy);
  line-height: 1.2;
}

.tank-head span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.tank-level {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.tank-level small {
  font-weight: 700;
}

.tank-block {
  padding-top: 12px;
  border-top: var(--bw) solid var(--line-soft);
}

.tank-block h4 {
  margin: 0 0 10px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.tank-block h4 small {
  margin-left: 6px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.water-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.water-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 10px 10px;
  border: var(--bw) solid var(--line);
  border-left: 4px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  text-align: left;
  background: var(--surface);
  cursor: pointer;
}

.water-tile:hover {
  border-color: var(--accent);
}

.water-tile.is-ok {
  border-left-color: var(--nivel-ok);
}

.water-tile.is-atencao {
  border-left-color: var(--atencao-mark);
}

.water-tile.is-critico {
  border-left-color: var(--nivel-critico);
}

.water-tile.is-vazio {
  border-left-style: dashed;
}

.water-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.water-value {
  font-size: 1.25rem;
  font-weight: var(--fw-heavy);
  line-height: 1.2;
}

.water-value small {
  color: var(--muted);
  font-size: 0.75rem;
}

.water-tile :deep(svg.sparkline),
.water-tile :deep(svg) {
  max-width: 100%;
}

.water-scale {
  margin-top: 4px;
}

.pump-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  text-align: left;
  background: var(--surface-2);
  cursor: pointer;
}

.pump-card:hover {
  border-color: var(--accent);
}

.pump-health {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.pump-health strong {
  font-size: 1.625rem;
  font-weight: var(--fw-heavy);
  line-height: 1.1;
}

.pump-health small {
  flex-basis: 100%;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.pump-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.pump-fields > span {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 5px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.pump-fields b {
  flex-basis: 100%;
  color: var(--ink);
  font-size: 0.9375rem;
  font-weight: var(--fw-heavy);
}

.pump-fields b small {
  color: var(--muted);
  font-size: 0.75rem;
}

.pump-fields i {
  font-style: normal;
}

.tank-actuators {
  margin: 0;
}

.tank-actuators :deep(.actuator:first-child) {
  border-top: 0;
  padding-top: 0;
}

.tank-alerts,
.tank-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tank-alerts li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.tank-alerts li.is-critico svg {
  color: var(--critico-ink);
}

.tank-alerts li.is-atencao svg {
  color: var(--atencao-mark);
}

.tank-alerts li > span {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.tank-alerts strong {
  font-size: 0.875rem;
}

.tank-alerts small {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.tank-alerts b {
  font-size: 0.875rem;
  white-space: nowrap;
}

.tank-items button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: var(--bw) solid var(--line-soft);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font: inherit;
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
  text-align: left;
  background: var(--surface);
  cursor: pointer;
}

.tank-items button:hover {
  border-color: var(--accent);
}

.tank-items button > svg {
  flex: 0 0 auto;
  color: var(--accent);
}

.tank-items button > span:first-of-type {
  flex: 1;
  min-width: 0;
}

.tank-dashboard {
  align-self: flex-start;
}
</style>
