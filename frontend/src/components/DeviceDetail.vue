<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { classify, healthLevel, LEVEL_TEXT } from '../alerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useRecentSeries } from '../composables/useRecentSeries'
import type { Device } from '../domain/devices'
import { formatRul } from '../domain/insights'
import { describeRange, KIND_LABEL } from '../domain/registry'
import { fieldIcon, KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import { tankLabel } from '../plant/tanks'
import ActuatorControl from './ActuatorControl.vue'
import RoleGate from './RoleGate.vue'
import Sparkline from './Sparkline.vue'

/**
 * O detalhe de um dispositivo (WEB-03), num painel que abre pela direita:
 * cada variável com a faixa por extenso e o mini gráfico, o estado e o
 * comando, a saúde prevista pela IA e o que ele publica. O admin edita e
 * desativa daqui.
 */
const props = defineProps<{
  device: Device
  level: ItemLevel
  insight: { health: number; rul_h: number | null; model: string | null } | null
  busy?: boolean
}>()

const emit = defineEmits<{ close: []; edit: [device: Device]; toggleActive: [device: Device] }>()

const titleId = useId()
const dialog = ref<HTMLDialogElement | null>(null)
const confirming = ref(false)
const { value, state } = useLiveValues()
const { connection, ageSeconds } = useDeviceState()
const { recentSeries } = useRecentSeries()

onMounted(() => dialog.value?.showModal())

function format(n: number | null, decimals: number): string {
  return n === null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const situation = computed(() => {
  if (!props.device.active) return 'Desativado: não entra no dashboard nem no 3D'
  const link = connection(props.device.id)
  const age = ageSeconds(props.device.id)
  if (link === 'online') return `Publicando · última leitura ${formatAge(age ?? 0)}`
  if (link === 'never') return 'Ainda não publicou nenhuma leitura'
  return `Parou de publicar ${formatAge(age ?? 0)}`
})

const fields = computed(() =>
  props.device.fields.map((field) => {
    const current = value(props.device.id, field.key)
    return {
      field,
      icon: fieldIcon(field.key),
      text: format(current, field.decimals),
      level: current !== null && field.range ? classify(current, field.range) : null,
      range: describeRange(field.range, field.unit),
      points: recentSeries(props.device.id, field.key),
    }
  }),
)

const stateNow = computed(() => (props.device.state_field ? state(props.device.id, props.device.state_field) : null))
const canCommand = computed(() => props.device.state_field !== null && props.device.commands.includes('on'))
const health = computed(() =>
  props.insight ? { ...props.insight, level: healthLevel(props.insight.health, props.insight.rul_h) } : null,
)
const levelIcon = computed(() => (props.level === 'vazio' ? UI_ICON.semDado : LEVEL_ICON[props.level]))

function toggle() {
  // Desativar pede confirmação; reativar não tira nada de ninguém.
  if (props.device.active && !confirming.value) {
    confirming.value = true
    return
  }
  confirming.value = false
  emit('toggleActive', props.device)
}
</script>

<template>
  <dialog ref="dialog" class="app-dialog device-detail" :aria-labelledby="titleId" @cancel.prevent="emit('close')">
    <div class="detail-wrap">
      <header class="dialog-head">
        <span class="detail-icon"><component :is="KIND_ICON[device.kind]" :size="20" aria-hidden="true" /></span>
        <div class="detail-title">
          <h2 :id="titleId">{{ device.name }}</h2>
          <span>{{ KIND_LABEL[device.kind] }} · <code>{{ device.id }}</code> · {{ tankLabel(device.zone) }}</span>
        </div>
        <button type="button" class="dialog-close" aria-label="Fechar" @click="emit('close')">
          <component :is="UI_ICON.voltar" :size="20" aria-hidden="true" class="detail-close-icon" />
        </button>
      </header>

      <div class="dialog-body">
        <div class="detail-status">
          <span v-if="device.active" :class="['table-level', `badge-${level}`]">
            <component :is="levelIcon" :size="13" aria-hidden="true" />
            {{ ITEM_LEVEL_TEXT[level] }}
          </span>
          <span class="detail-situation">{{ situation }}</span>
          <span v-if="device.active" class="detail-links">
            <RouterLink
              v-if="device.kind === 'equipment'"
              class="detail-3d"
              :to="{ name: 'insights', hash: `#${device.id}` }"
            >
              Ver na Insights <component :is="UI_ICON.abrir" :size="14" aria-hidden="true" />
            </RouterLink>
            <RouterLink class="detail-3d" :to="{ name: 'gemeo-3d', query: { tanque: device.zone, item: device.id } }">
              Ver no 3D <component :is="UI_ICON.abrir" :size="14" aria-hidden="true" />
            </RouterLink>
          </span>
        </div>

        <section v-if="fields.length" class="detail-block">
          <h3>Variáveis</h3>
          <article v-for="item in fields" :key="item.field.key" class="detail-field">
            <header>
              <span class="detail-field-name">
                <component :is="item.icon" :size="15" aria-hidden="true" />
                {{ item.field.label }}
              </span>
              <span class="detail-field-value">
                {{ item.text }}<small v-if="item.text !== '—'"> {{ item.field.unit }}</small>
              </span>
              <span v-if="item.level" :class="['table-level', `badge-${item.level}`]">{{ LEVEL_TEXT[item.level] }}</span>
            </header>
            <Sparkline :points="item.points" :ok-min="item.field.range?.ok_min" :ok-max="item.field.range?.ok_max" :width="420" :height="52" />
            <p>
              <code>{{ item.field.key }}</code> · {{ item.range }} · {{ item.field.decimals }}
              {{ item.field.decimals === 1 ? 'casa decimal' : 'casas decimais' }}
            </p>
          </article>
        </section>

        <section v-if="device.state_field" class="detail-block">
          <h3>Estado</h3>
          <p class="detail-state">
            {{ stateNow === null ? 'Sem dados' : stateNow ? 'Ligado' : 'Desligado' }}
            <small>· {{ device.control === 'rule' ? 'automático, pela regra' : 'manual' }}</small>
          </p>
          <ul v-if="canCommand && device.active" class="actuator-list detail-command">
            <ActuatorControl :device="device" />
          </ul>
        </section>

        <section v-if="device.kind === 'equipment'" class="detail-block">
          <h3>Saúde prevista pela IA</h3>
          <div v-if="health" class="detail-health">
            <strong>{{ format(health.health, 0) }} %</strong>
            <span :class="['table-level', `badge-${health.level}`]">{{ LEVEL_TEXT[health.level] }}</span>
            <p>
              Vida útil restante: <b>{{ health.rul_h === null ? '—' : formatRul(health.rul_h) }}</b>
              <template v-if="health.model"> · modelo {{ health.model }}</template>
            </p>
          </div>
          <p v-else class="small-note">Aguardando a primeira previsão da IA.</p>
        </section>

        <section class="detail-block">
          <h3>O que ele publica</h3>
          <dl class="detail-meta">
            <div>
              <dt>Zona (tanque)</dt>
              <dd><code>{{ device.zone }}</code></dd>
            </div>
            <div>
              <dt>Chaves da telemetria</dt>
              <dd>
                <code v-for="key in [...device.fields.map((f) => f.key), ...(device.state_field ? [device.state_field] : [])]" :key="key">{{ key }}</code>
              </dd>
            </div>
            <div v-if="device.commands.length">
              <dt>Comandos aceitos</dt>
              <dd><code v-for="cmd in device.commands" :key="cmd">{{ cmd }}</code></dd>
            </div>
          </dl>
        </section>
      </div>

      <RoleGate permission="editRegistry">
        <footer class="dialog-foot">
          <p v-if="confirming" class="detail-confirm" role="alert">
            Desativar tira o item do dashboard e do 3D. O histórico continua guardado.
          </p>
          <button type="button" :class="['button', { 'button-danger': confirming }]" :disabled="busy" @click="toggle">
            {{ device.active ? (confirming ? 'Confirmar desativação' : 'Desativar') : 'Reativar' }}
          </button>
          <button type="button" class="button button-primary" :disabled="busy" @click="emit('edit', device)">Editar</button>
        </footer>
      </RoleGate>
    </div>
  </dialog>
</template>

<style scoped>
/* Um painel que entra pela direita, da altura da tela. */
.device-detail {
  width: min(520px, 100vw);
  height: 100vh;
  max-height: 100vh;
  margin: 0 0 0 auto;
  border-radius: var(--radius) 0 0 var(--radius);
}

.detail-wrap {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.detail-wrap .dialog-body {
  flex: 1;
  overflow-y: auto;
}

.dialog-head {
  justify-content: flex-start;
}

.detail-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: var(--accent);
  background: var(--surface-2);
}

.detail-title {
  flex: 1;
  min-width: 0;
}

.detail-title span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.detail-close-icon {
  transform: rotate(180deg);
}

.detail-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
}

.detail-situation {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.detail-links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-left: auto;
}

.detail-3d {
  display: inline-flex;
  align-items: center;
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
  text-decoration: none;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
  border-top: var(--bw) solid var(--line-soft);
}

.detail-block h3 {
  font-size: 0.9375rem;
  font-weight: var(--fw-heavy);
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
}

.detail-field header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.detail-field-name {
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
}

.detail-field-value {
  font-size: 1.375rem;
  font-weight: var(--fw-heavy);
}

.detail-field-value small {
  color: var(--muted);
  font-size: 0.8125rem;
}

.detail-field :deep(.sparkline) {
  width: 100%;
  height: 52px;
}

.detail-field p {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.detail-state {
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.detail-state small {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.detail-command {
  margin: 0;
}

.detail-command :deep(.actuator) {
  border-top: 0;
  padding-top: 0;
}

.detail-health {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.detail-health strong {
  font-size: 1.75rem;
  font-weight: var(--fw-heavy);
}

.detail-health p {
  flex-basis: 100%;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.detail-health b {
  color: var(--ink);
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.detail-meta > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.detail-meta dt {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.detail-meta dd {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
}

.detail-meta code {
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 0.8125rem;
  background: var(--surface-2);
}

.detail-confirm {
  flex: 1;
  color: var(--critico-ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
}

.button-danger {
  color: var(--surface);
  border-color: var(--nivel-critico);
  background: var(--nivel-critico);
}

@media (max-width: 700px) {
  .device-detail {
    border-radius: 0;
  }
}
</style>
