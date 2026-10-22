<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useId } from 'vue'
import { Plus, Trash2, X } from 'lucide-vue-next'
import { createDevice, updateDevice } from '../api/devices'
import { ApiError } from '../api/http'
import type { Device, DeviceField, DeviceInput, DeviceKind } from '../domain/devices'
import {
  describeRange,
  formatDecimal,
  KIND_LABEL,
  parseDecimal,
  validateDevice,
  validateRange,
} from '../domain/registry'
import type { MetricThreshold } from '../types'

/**
 * Cadastro e edição de um dispositivo (WEB-03), só para o admin. Abre como
 * diálogo; quem chama monta o componente para abrir e desmonta para fechar.
 *
 * O id e o tipo só se escolhem no cadastro: o id está nos tópicos MQTT e no
 * histórico. Pelo mesmo motivo, a chave de uma variável que já existe não
 * muda nem sai; dá para acrescentar variáveis novas.
 */
const props = defineProps<{
  /** `null` cadastra um dispositivo novo. */
  device: Device | null
  /** O cadastro inteiro, para conferir id repetido. */
  devices: Device[]
}>()

const emit = defineEmits<{
  close: []
  saved: [device: Device, isNew: boolean]
}>()

const isNew = props.device === null
const uid = useId()
const titleId = `device-form-${uid}`
const dialog = ref<HTMLDialogElement | null>(null)
const formEl = ref<HTMLFormElement | null>(null)

/** Campo do formulário: números como texto, para aceitar vírgula e vazio. */
interface FieldDraft {
  uid: number
  existing: boolean
  key: string
  label: string
  short: string
  unit: string
  decimals: string
  critMin: string
  okMin: string
  okMax: string
  critMax: string
}

let nextUid = 0

function fieldDraft(field?: DeviceField): FieldDraft {
  nextUid += 1
  return {
    uid: nextUid,
    existing: field !== undefined,
    key: field?.key ?? '',
    label: field?.label ?? '',
    short: field?.short ?? '',
    unit: field?.unit ?? '',
    decimals: String(field?.decimals ?? 1),
    critMin: formatDecimal(field?.range?.crit_min ?? null),
    okMin: formatDecimal(field?.range?.ok_min ?? null),
    okMax: formatDecimal(field?.range?.ok_max ?? null),
    critMax: formatDecimal(field?.range?.crit_max ?? null),
  }
}

const draft = reactive({
  id: props.device?.id ?? '',
  name: props.device?.name ?? '',
  kind: (props.device?.kind ?? 'sensor') as DeviceKind,
  zone: props.device?.zone ?? 'tanque-01',
  active: props.device?.active ?? true,
  fields: props.device ? props.device.fields.map((field) => fieldDraft(field)) : [fieldDraft()],
})

function rangeOf(field: FieldDraft): MetricThreshold | null {
  const range = {
    ok_min: parseDecimal(field.okMin),
    ok_max: parseDecimal(field.okMax),
    crit_min: parseDecimal(field.critMin),
    crit_max: parseDecimal(field.critMax),
  }
  return Object.values(range).some((v) => v !== null) ? range : null
}

function toField(field: FieldDraft): DeviceField {
  const label = field.label.trim()
  return {
    key: field.key.trim(),
    label,
    // Sem nome curto, a tabela e o seletor usam o nome inteiro.
    short: field.short.trim() || label,
    unit: field.unit.trim(),
    decimals: Number(field.decimals),
    range: rangeOf(field),
  }
}

const input = computed<DeviceInput>(() => ({
  id: draft.id.trim(),
  name: draft.name.trim(),
  kind: draft.kind,
  zone: draft.zone.trim(),
  active: draft.active,
  fields: draft.kind === 'actuator' ? [] : draft.fields.map(toField),
}))

const others = computed(() => props.devices.filter((device) => device.id !== props.device?.id))
const issues = computed(() => validateDevice(input.value, others.value, isNew))

// Os erros só aparecem depois da primeira tentativa de salvar: ninguém quer
// ver "informe o nome" antes de começar a digitar.
const showIssues = ref(false)
function issue(path: string): string | undefined {
  return showIssues.value ? issues.value[path] : undefined
}

/** A faixa em palavras enquanto se digita, ou o que está errado nela. */
function rangePreview(field: FieldDraft, unit: string): { ok: boolean; text: string } {
  const range = rangeOf(field)
  const problem = validateRange(range)
  return problem ? { ok: false, text: problem } : { ok: true, text: describeRange(range, unit) }
}

function addField() {
  draft.fields.push(fieldDraft())
}

function removeField(index: number) {
  draft.fields.splice(index, 1)
}

const saving = ref(false)
const apiError = ref<string | null>(null)

async function submit() {
  if (saving.value) return
  showIssues.value = true
  apiError.value = null
  if (Object.keys(issues.value).length) {
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }

  saving.value = true
  try {
    const { name, zone, active, fields } = input.value
    const saved = props.device
      ? await updateDevice(props.device.id, { name, zone, active, fields })
      : await createDevice(input.value)
    emit('saved', saved, isNew)
  } catch (err) {
    apiError.value = saveErrorMessage(err)
  } finally {
    saving.value = false
  }
}

function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Só o administrador pode mudar o cadastro.'
    return err.message
  }
  if (err instanceof TypeError) return 'Não foi possível falar com o servidor.'
  return 'Não foi possível salvar o dispositivo.'
}

const KINDS: DeviceKind[] = ['sensor', 'equipment', 'actuator']

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="app-dialog" :aria-labelledby="titleId" @cancel.prevent="emit('close')">
    <form ref="formEl" novalidate @submit.prevent="submit">
      <header class="dialog-head">
        <h2 :id="titleId">{{ isNew ? 'Cadastrar dispositivo' : `Editar ${device?.name}` }}</h2>
        <button type="button" class="dialog-close" aria-label="Fechar" @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>

      <div class="dialog-body">
        <section class="form-grid" aria-label="Identificação">
          <label class="form-field span-2">
            Nome
            <input
              v-model="draft.name"
              name="name"
              autocomplete="off"
              autofocus
              :aria-invalid="Boolean(issue('name'))"
            />
            <span v-if="issue('name')" class="form-error">{{ issue('name') }}</span>
          </label>

          <label class="form-field">
            Id
            <input
              v-model="draft.id"
              name="id"
              autocomplete="off"
              spellcheck="false"
              :disabled="!isNew"
              :aria-invalid="Boolean(issue('id'))"
            />
            <span v-if="issue('id')" class="form-error">{{ issue('id') }}</span>
            <span v-else class="form-hint">
              {{ isNew ? 'Vai nos tópicos MQTT e no histórico; não muda depois.' : 'Não muda: está nos tópicos e no histórico.' }}
            </span>
          </label>

          <label class="form-field">
            Zona
            <input
              v-model="draft.zone"
              name="zone"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="Boolean(issue('zone'))"
            />
            <span v-if="issue('zone')" class="form-error">{{ issue('zone') }}</span>
          </label>

          <fieldset class="form-field kind-field span-2">
            <legend>Tipo</legend>
            <div v-if="isNew" class="kind-options">
              <label v-for="kind in KINDS" :key="kind">
                <input v-model="draft.kind" type="radio" name="kind" :value="kind" />
                <span>{{ KIND_LABEL[kind] }}</span>
              </label>
            </div>
            <strong v-else class="kind-fixed">{{ KIND_LABEL[draft.kind] }}</strong>
          </fieldset>

          <label v-if="!isNew" class="active-field span-2">
            <input v-model="draft.active" type="checkbox" name="active" />
            <span>
              <strong>Ativo</strong>
              <small>Desativado some do dashboard e do 3D e para de gerar alerta. O histórico continua guardado.</small>
            </span>
          </label>
        </section>

        <section v-if="draft.kind === 'actuator'" class="actuator-note">
          <strong>Atuador não tem variáveis.</strong>
          Ele publica só o estado (<code>{"on": true}</code>) e recebe o comando de ligar e desligar. Nasce com
          controle manual, pelo botão do dashboard.
        </section>

        <section v-else class="fields" aria-labelledby="fields-title">
          <div class="fields-head">
            <h3 id="fields-title">Variáveis</h3>
            <span class="form-hint">Deixe vazio o limite que não existe: o nível da água não tem máximo.</span>
          </div>
          <p v-if="issue('fields')" class="form-error">{{ issue('fields') }}</p>

          <fieldset v-for="(field, index) in draft.fields" :key="field.uid" class="field-card">
            <legend>
              Variável {{ index + 1 }}
              <code v-if="field.existing">{{ field.key }}</code>
            </legend>

            <div class="field-grid">
              <label class="form-field">
                Chave na telemetria
                <input
                  v-model="field.key"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="oxygen_mg_l"
                  :disabled="field.existing"
                  :aria-invalid="Boolean(issue(`fields.${index}.key`))"
                />
                <span v-if="issue(`fields.${index}.key`)" class="form-error">{{ issue(`fields.${index}.key`) }}</span>
              </label>
              <label class="form-field">
                Nome
                <input v-model="field.label" autocomplete="off" :aria-invalid="Boolean(issue(`fields.${index}.label`))" />
                <span v-if="issue(`fields.${index}.label`)" class="form-error">{{ issue(`fields.${index}.label`) }}</span>
              </label>
              <label class="form-field">
                Nome curto
                <input v-model="field.short" autocomplete="off" :placeholder="field.label" />
              </label>
              <label class="form-field">
                Unidade
                <input v-model="field.unit" autocomplete="off" placeholder="mg/L" />
              </label>
              <label class="form-field">
                Casas decimais
                <input
                  v-model="field.decimals"
                  inputmode="numeric"
                  autocomplete="off"
                  :aria-invalid="Boolean(issue(`fields.${index}.decimals`))"
                />
                <span v-if="issue(`fields.${index}.decimals`)" class="form-error">
                  {{ issue(`fields.${index}.decimals`) }}
                </span>
              </label>
            </div>

            <fieldset class="range-fieldset">
              <legend>Faixa{{ field.unit ? ` (${field.unit})` : '' }}</legend>
              <div class="range-grid">
                <label class="form-field">
                  Crítico abaixo de
                  <input v-model="field.critMin" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issue(`fields.${index}.range`))" />
                </label>
                <label class="form-field">
                  Normal a partir de
                  <input v-model="field.okMin" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issue(`fields.${index}.range`))" />
                </label>
                <label class="form-field">
                  Normal até
                  <input v-model="field.okMax" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issue(`fields.${index}.range`))" />
                </label>
                <label class="form-field">
                  Crítico acima de
                  <input v-model="field.critMax" inputmode="decimal" autocomplete="off" :aria-invalid="Boolean(issue(`fields.${index}.range`))" />
                </label>
              </div>
              <p :class="rangePreview(field, field.unit).ok ? 'form-hint range-preview' : 'form-error range-preview'">
                {{ rangePreview(field, field.unit).text }}
              </p>
            </fieldset>

            <button
              v-if="!field.existing"
              type="button"
              class="field-remove"
              :aria-label="`Remover a variável ${index + 1}`"
              @click="removeField(index)"
            >
              <Trash2 :size="15" aria-hidden="true" />
              Remover
            </button>
          </fieldset>

          <button type="button" class="button add-field" @click="addField">
            <Plus :size="16" aria-hidden="true" />
            Adicionar variável
          </button>
        </section>
      </div>

      <footer class="dialog-foot">
        <p v-if="apiError" class="form-alert" role="alert">{{ apiError }}</p>
        <p v-else-if="showIssues && Object.keys(issues).length" class="form-alert" role="alert">
          Confira os campos marcados.
        </p>
        <button type="button" class="button" @click="emit('close')">Cancelar</button>
        <button type="submit" class="button button-primary" :disabled="saving">
          <span v-if="saving" class="spinner" aria-hidden="true" />
          {{ isNew ? 'Cadastrar' : 'Salvar' }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.span-2 {
  grid-column: span 2;
}

.kind-field {
  margin: 0;
  padding: 0;
  border: 0;
}

.kind-field legend {
  margin-bottom: 5px;
  padding: 0;
}

/* Rádio no lugar (teclado e leitor de tela); só o desenho vira botão. */
.kind-options {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.kind-options label {
  position: relative;
  flex: 1;
}

.kind-options input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.kind-options span {
  display: grid;
  place-items: center;
  min-height: 38px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: var(--fw-bold);
}

.kind-options input:checked + span {
  color: #ffffff;
  background: var(--night);
}

.kind-options input:focus-visible + span {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}

.kind-fixed {
  color: var(--ink);
  font-size: 0.9375rem;
}

.active-field {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: var(--bw) solid var(--line-soft);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
}

.active-field input {
  width: 20px;
  height: 20px;
  margin: 1px 0 0;
  accent-color: var(--night);
}

.active-field span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.active-field strong {
  font-weight: var(--fw-heavy);
}

.active-field small {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.actuator-note {
  padding: 12px 14px;
  border: var(--bw) dashed var(--line);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.actuator-note strong {
  display: block;
  color: var(--ink);
  font-weight: var(--fw-heavy);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fields-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}

.fields-head h3 {
  font-size: 1rem;
  font-weight: var(--fw-heavy);
}

.field-card {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 12px 14px 14px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
}

.field-card > legend {
  padding: 0 6px;
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
}

.field-card > legend code {
  margin-left: 6px;
  color: var(--muted);
  font-size: 0.8125rem;
}

.field-remove {
  display: inline-flex;
  align-items: center;
  align-self: flex-end;
  gap: 6px;
  min-height: 36px;
  margin-top: 6px;
  padding: 0 10px;
  border: var(--bw) solid transparent;
  border-radius: var(--radius-sm);
  color: var(--critico-ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  background: transparent;
}

.field-remove:hover {
  border-color: var(--nivel-critico);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 14px;
}

.range-fieldset {
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}

.range-fieldset legend {
  margin-bottom: 6px;
  padding: 0;
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.range-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.range-preview {
  margin-top: 8px;
  font-size: 0.8125rem;
}

.add-field {
  align-self: flex-start;
}

@media (max-width: 620px) {
  .form-grid,
  .range-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-grid > .form-field:not(.span-2) {
    grid-column: span 2;
  }
}
</style>
