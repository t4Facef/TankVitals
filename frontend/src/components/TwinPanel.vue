<script setup lang="ts">
import { computed, useId } from 'vue'
import { classify, healthLevel, LEVEL_TEXT } from '../alerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useRecentSeries } from '../composables/useRecentSeries'
import type { Device } from '../domain/devices'
import { formatRul } from '../domain/insights'
import { KIND_LABEL } from '../domain/registry'
import { KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import ActuatorControl from './ActuatorControl.vue'
import FaultControl from './FaultControl.vue'
import Sparkline from './Sparkline.vue'

/**
 * O painel de um item do 3D (WEB-08): a última leitura, um mini gráfico das
 * leituras que chegaram ao vivo, a saúde prevista pela IA e, nos atuadores
 * controláveis, os botões de comando. O mini gráfico usa só o que veio pelo
 * WebSocket, como o resto da cena.
 */
const props = defineProps<{
  device: Device
  level: ItemLevel
  insight: { health: number; rul_h: number | null; model: string | null } | null
}>()

const emit = defineEmits<{ close: [] }>()

const uid = useId()
const { recentSeries } = useRecentSeries()
const { value, state } = useLiveValues()
const { ageSeconds } = useDeviceState()

const levelIcon = computed(() => (props.level === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[props.level]))

const readings = computed(() =>
  props.device.fields.map((field) => {
    const current = value(props.device.id, field.key)
    return {
      field,
      text:
        current === null
          ? '—'
          : current.toLocaleString('pt-BR', { minimumFractionDigits: field.decimals, maximumFractionDigits: field.decimals }),
      level: current !== null && field.range ? classify(current, field.range) : null,
    }
  }),
)

const stateNow = computed(() => (props.device.state_field ? state(props.device.id, props.device.state_field) : null))

const age = computed(() => {
  const seconds = ageSeconds(props.device.id)
  return seconds === null ? 'nunca recebida' : `recebida ${formatAge(seconds)}`
})

// As leituras ao vivo guardadas no store (as últimas 120 mensagens).
const recent = (key: string, isState = false) => recentSeries(props.device.id, key, isState)

const health = computed(() => {
  if (!props.insight) return null
  const level = healthLevel(props.insight.health, props.insight.rul_h)
  return { ...props.insight, level }
})

const canCommand = computed(() => props.device.state_field !== null && props.device.commands.includes('on'))
const canFault = computed(() => props.device.commands.includes('inject_fault'))
</script>

<template>
  <section class="twin-item" :aria-labelledby="`item-${uid}`">
    <header class="twin-item-head">
      <component :is="KIND_ICON[device.kind]" :size="20" aria-hidden="true" />
      <div>
        <h3 :id="`item-${uid}`">{{ device.name }}</h3>
        <span>{{ KIND_LABEL[device.kind] }} · <code>{{ device.id }}</code></span>
      </div>
      <button type="button" class="dialog-close" aria-label="Voltar para o tanque" @click="emit('close')">
        <component :is="UI_ICON.voltar" :size="18" aria-hidden="true" />
      </button>
    </header>

    <p :class="['twin-item-level', `badge-${level}`]">
      <component :is="levelIcon" :size="15" aria-hidden="true" />
      {{ ITEM_LEVEL_TEXT[level] }}
    </p>

    <section class="twin-item-block">
      <h4>Última leitura <small>{{ age }}</small></h4>
      <dl class="twin-readings">
        <div v-if="device.state_field">
          <dt>Estado</dt>
          <dd>{{ stateNow === null ? '—' : stateNow ? 'Ligado' : 'Desligado' }}</dd>
        </div>
        <div v-for="reading in readings" :key="reading.field.key">
          <dt>{{ reading.field.label }}</dt>
          <dd>
            {{ reading.text }}<small v-if="reading.field.unit && reading.text !== '—'"> {{ reading.field.unit }}</small>
            <span v-if="reading.level" :class="['table-level', `badge-${reading.level}`]">{{ LEVEL_TEXT[reading.level] }}</span>
          </dd>
        </div>
      </dl>
    </section>

    <section class="twin-item-block">
      <h4>Ao vivo <small>as últimas leituras que chegaram</small></h4>
      <div v-for="field in device.fields" :key="field.key" class="twin-spark">
        <span>{{ field.short }}</span>
        <Sparkline
          :points="recent(field.key)"
          :ok-min="field.range?.ok_min"
          :ok-max="field.range?.ok_max"
          :width="280"
          :height="40"
        />
      </div>
      <div v-if="device.state_field && !device.fields.length" class="twin-spark">
        <span>Ligado (1) ou desligado (0)</span>
        <Sparkline :points="recent(device.state_field, true)" :width="280" :height="34" />
      </div>
    </section>

    <section class="twin-item-block">
      <h4>Saúde prevista pela IA</h4>
      <div v-if="health" class="twin-health">
        <strong>{{ health.health.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }} %</strong>
        <span :class="['table-level', `badge-${health.level}`]">{{ LEVEL_TEXT[health.level] }}</span>
        <p>
          Vida útil restante:
          <b>{{ health.rul_h === null ? '—' : formatRul(health.rul_h) }}</b>
          <template v-if="health.model"> · modelo {{ health.model }}</template>
        </p>
      </div>
      <p v-else-if="device.kind === 'equipment'" class="small-note">Aguardando a primeira previsão da IA.</p>
      <p v-else class="small-note">A IA prevê a saúde dos equipamentos monitorados; este item não tem previsão.</p>
      <RouterLink v-if="device.kind === 'equipment'" class="twin-insights" :to="{ name: 'insights', hash: `#${device.id}` }">
        Tendência e o que fazer, na Insights <component :is="UI_ICON.abrir" :size="14" aria-hidden="true" />
      </RouterLink>
    </section>

    <section v-if="canCommand" class="twin-item-block">
      <h4>Comando</h4>
      <ul class="actuator-list twin-actuator">
        <ActuatorControl :device="device" />
      </ul>
    </section>

    <section v-if="canFault" class="twin-item-block">
      <h4>Simulador <small>falha e reparo</small></h4>
      <FaultControl :device="device" />
    </section>
  </section>
</template>

<style scoped>
.twin-item {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.twin-item-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.twin-item-head > svg {
  flex: 0 0 auto;
  margin-top: 3px;
  color: var(--accent);
}

.twin-item-head > div {
  flex: 1;
  min-width: 0;
}

.twin-item-head h3 {
  font-size: 1.125rem;
  font-weight: var(--fw-heavy);
  line-height: 1.25;
}

.twin-item-head span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.twin-item-level {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.twin-item-block {
  padding-top: 12px;
  border-top: var(--bw) solid var(--line-soft);
}

.twin-item-block h4 {
  margin: 0 0 8px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.twin-item-block h4 small {
  margin-left: 6px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.twin-readings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.twin-readings > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.twin-readings dt {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.twin-readings dd {
  margin: 0;
  font-size: 1rem;
  font-weight: var(--fw-heavy);
  text-align: right;
}

.twin-readings dd small {
  color: var(--muted);
  font-size: 0.8125rem;
}

.twin-readings .table-level {
  margin-left: 8px;
  vertical-align: 1px;
}

.twin-spark {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.twin-spark > span {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.twin-health {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.twin-health strong {
  font-size: 1.75rem;
  font-weight: var(--fw-heavy);
  line-height: 1.1;
}

.twin-health p {
  flex-basis: 100%;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.twin-health b {
  color: var(--ink);
}

.twin-insights {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
  text-decoration: none;
}

.twin-insights:hover {
  text-decoration: underline;
}

.twin-actuator {
  margin: 0;
}

.twin-actuator :deep(.actuator) {
  border-top: 0;
  padding-top: 0;
}
</style>
