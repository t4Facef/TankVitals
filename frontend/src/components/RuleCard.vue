<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { updateRule } from '../api/devices'
import { ApiError } from '../api/http'
import { formatAge } from '../composables/useDeviceState'
import { useLiveValues } from '../composables/useLiveValues'
import { useNow } from '../composables/useNow'
import type { Device, Rule } from '../domain/devices'
import { formatDecimal, parseDecimal, validateRule } from '../domain/registry'

/**
 * Uma regra automática (IOT-07) na aba de regras da tela Dispositivos: o que
 * ela faz em palavras, uma régua com os dois limites e a leitura de agora, e,
 * para o admin, os limites editáveis.
 */
const props = defineProps<{
  rule: Rule
  /** O sensor vigiado e o atuador comandado, do cadastro. */
  sensor: Device | undefined
  actuator: Device | undefined
  canEdit: boolean
}>()

const emit = defineEmits<{ saved: [rule: Rule] }>()

const uid = useId()
const now = useNow()
const { value, state } = useLiveValues()

const field = computed(() => props.sensor?.fields.find((f) => f.key === props.rule.field))
const unit = computed(() => field.value?.unit ?? '')
const decimals = computed(() => field.value?.decimals ?? 1)
const sensorLabel = computed(() => field.value?.label ?? `${props.rule.device}.${props.rule.field}`)
const actuatorName = computed(() => props.actuator?.name ?? props.rule.actuator)

const current = computed(() => value(props.rule.device, props.rule.field))
const actuatorOn = computed(() => state(props.rule.actuator, props.actuator?.state_field ?? 'on'))

// --- edição ------------------------------------------------------------------

const onBelowText = ref(formatDecimal(props.rule.on_below))
const offAtText = ref(formatDecimal(props.rule.off_at))

// Quando a regra muda por fora (salvou, recarregou), o formulário acompanha.
watch(
  () => [props.rule.on_below, props.rule.off_at],
  ([onBelow, offAt]) => {
    onBelowText.value = formatDecimal(onBelow)
    offAtText.value = formatDecimal(offAt)
  },
)

const draft = computed(() => ({
  on_below: parseDecimal(onBelowText.value) ?? Number.NaN,
  off_at: parseDecimal(offAtText.value) ?? Number.NaN,
}))
const issues = computed(() => validateRule(draft.value))
const changed = computed(
  () => draft.value.on_below !== props.rule.on_below || draft.value.off_at !== props.rule.off_at,
)
const valid = computed(() => Object.keys(issues.value).length === 0)

/** Os limites que a régua mostra: os digitados, se estiverem válidos. */
const shown = computed(() => (valid.value ? draft.value : { on_below: props.rule.on_below, off_at: props.rule.off_at }))

const saving = ref(false)
const error = ref<string | null>(null)
const savedNote = ref(false)

async function save() {
  if (!valid.value || !changed.value || saving.value) return
  saving.value = true
  error.value = null
  savedNote.value = false
  try {
    const saved = await updateRule(props.rule.id, draft.value)
    savedNote.value = true
    emit('saved', saved)
  } catch (err) {
    if (err instanceof ApiError) error.value = err.status === 403 ? 'Só o administrador muda as regras.' : err.message
    else error.value = 'Não foi possível salvar a regra.'
  } finally {
    saving.value = false
  }
}

function reset() {
  onBelowText.value = formatDecimal(props.rule.on_below)
  offAtText.value = formatDecimal(props.rule.off_at)
  error.value = null
}

// --- régua ---------------------------------------------------------------------

/** De 0 até um pouco além do maior entre o limite de desligar e a leitura. */
const scale = computed(() => {
  const top = Math.max(shown.value.off_at, current.value ?? 0) * 1.35 || 1
  const pos = (x: number) => `${(Math.min(top, Math.max(0, x)) / top) * 100}%`
  return {
    onBelow: pos(shown.value.on_below),
    offAt: pos(shown.value.off_at),
    current: current.value === null ? null : pos(current.value),
  }
})

function fmt(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—'
  const text = n.toLocaleString('pt-BR', { maximumFractionDigits: Math.max(decimals.value, 1) })
  return unit.value ? `${text} ${unit.value}` : text
}

const updatedText = computed(() => {
  if (!props.rule.updated_at) return 'Valores do cadastro inicial.'
  const seconds = Math.max(0, Math.round((now.value - Date.parse(props.rule.updated_at)) / 1000))
  return `Alterada por ${props.rule.updated_by ?? 'alguém'} ${formatAge(seconds)}.`
})
</script>

<template>
  <article class="panel rule-card" :aria-labelledby="`rule-${uid}`">
    <div class="panel-header">
      <h3 :id="`rule-${uid}`">{{ rule.name }}</h3>
      <span class="small-note">{{ updatedText }}</span>
    </div>

    <p class="rule-sentence">
      Liga o <strong>{{ actuatorName }}</strong> quando o <strong>{{ sensorLabel }}</strong> fica abaixo de
      <strong>{{ fmt(shown.on_below) }}</strong> e desliga quando chega a <strong>{{ fmt(shown.off_at) }}</strong>.
    </p>

    <div class="rule-now">
      <span>
        Agora
        <strong>{{ fmt(current) }}</strong>
      </span>
      <span>
        {{ actuatorName }}
        <strong :class="actuatorOn ? 'is-on' : ''">
          {{ actuatorOn === null ? 'sem dados' : actuatorOn ? 'ligado' : 'desligado' }}
        </strong>
      </span>
    </div>

    <div class="rule-scale" aria-hidden="true">
      <span class="rule-zone zone-on" :style="{ width: scale.onBelow }">liga</span>
      <span class="rule-zone zone-hold" :style="{ left: scale.onBelow, width: `calc(${scale.offAt} - ${scale.onBelow})` }">
        mantém
      </span>
      <span class="rule-zone zone-off" :style="{ left: scale.offAt }">desliga</span>
      <span v-if="scale.current" class="rule-mark" :style="{ left: scale.current }" />
    </div>
    <div class="rule-ticks" aria-hidden="true">
      <span :style="{ left: scale.onBelow }">{{ fmt(shown.on_below) }}</span>
      <span :style="{ left: scale.offAt }">{{ fmt(shown.off_at) }}</span>
    </div>

    <p class="form-hint">
      A distância entre os dois limites evita o liga-desliga a cada leitura: entre eles, o
      {{ actuatorName.toLowerCase() }} fica como está.
    </p>

    <form v-if="canEdit" class="rule-form" novalidate @submit.prevent="save">
      <label class="form-field">
        Liga abaixo de{{ unit ? ` (${unit})` : '' }}
        <input v-model="onBelowText" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issues.on_below)" />
        <span v-if="issues.on_below" class="form-error">{{ issues.on_below }}</span>
      </label>
      <label class="form-field">
        Desliga a partir de{{ unit ? ` (${unit})` : '' }}
        <input v-model="offAtText" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issues.off_at)" />
        <span v-if="issues.off_at" class="form-error">{{ issues.off_at }}</span>
      </label>
      <div class="rule-actions">
        <button type="button" class="button" :disabled="!changed || saving" @click="reset">Desfazer</button>
        <button type="submit" class="button button-primary" :disabled="!changed || !valid || saving">
          <span v-if="saving" class="spinner" aria-hidden="true" />
          Salvar limites
        </button>
      </div>
      <p v-if="error" class="form-alert rule-feedback" role="alert">{{ error }}</p>
      <p v-else-if="savedNote && !changed" class="form-hint rule-feedback" role="status">
        Salvo. O serviço de regras recarrega sozinho; o {{ actuatorName.toLowerCase() }} segue os limites novos nas
        próximas leituras.
      </p>
    </form>
  </article>
</template>

<style scoped>
.rule-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rule-card .panel-header {
  margin-bottom: 4px;
}

.rule-sentence {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.55;
}

.rule-sentence strong {
  font-weight: var(--fw-heavy);
}

.rule-now {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
}

.rule-now strong {
  margin-left: 6px;
  color: var(--ink);
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.rule-now strong.is-on {
  color: var(--accent);
}

/* Régua: as três zonas da regra e o traço da leitura de agora. */
.rule-scale {
  position: relative;
  height: 34px;
  margin-top: 4px;
  overflow: visible;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.rule-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
}

.zone-on {
  left: 0;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  color: #ffffff;
  background: var(--accent);
}

.zone-hold {
  color: var(--muted);
  background: repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--line-soft) 6px 12px);
}

.zone-off {
  right: 0;
  color: var(--muted);
}

.rule-mark {
  position: absolute;
  top: -6px;
  bottom: -6px;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--ink);
  transition: left 0.4s ease;
}

.rule-ticks {
  position: relative;
  height: 18px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: var(--fw-bold);
}

.rule-ticks span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.rule-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px)) 1fr;
  align-items: start;
  gap: 12px;
  padding-top: 14px;
  border-top: var(--bw) solid var(--line-soft);
}

.rule-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 21px;
}

.rule-feedback {
  grid-column: 1 / -1;
}

@media (max-width: 700px) {
  .rule-form {
    grid-template-columns: 1fr 1fr;
  }

  .rule-actions {
    grid-column: 1 / -1;
    padding-top: 0;
  }
}
</style>
