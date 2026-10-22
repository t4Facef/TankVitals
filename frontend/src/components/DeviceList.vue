<script setup lang="ts">
import { computed } from 'vue'
import { Pencil } from 'lucide-vue-next'
import { LEVEL_TEXT } from '../alerts'
import { formatAge, useDeviceState } from '../composables/useDeviceState'
import { useLiveValues } from '../composables/useLiveValues'
import type { Device, DeviceKind } from '../domain/devices'
import { KIND_LABEL } from '../domain/registry'
import { KIND_ICON, LEVEL_ICON } from '../icons'

/**
 * A lista do cadastro (WEB-03), agrupada por tipo, com o que a telemetria diz
 * de cada dispositivo agora: se está publicando e a última leitura. Os
 * desativados ficam no fim de cada grupo, apagados: o histórico deles continua.
 */
const props = defineProps<{
  devices: Device[]
  /** Mostra o botão de editar (admin). */
  canEdit: boolean
}>()

const emit = defineEmits<{ edit: [device: Device] }>()

const { connection, ageSeconds, rangeLevel } = useDeviceState()
const { value, state } = useLiveValues()

const GROUPS: Array<{ kind: DeviceKind; title: string }> = [
  { kind: 'sensor', title: 'Sensores' },
  { kind: 'equipment', title: 'Equipamentos monitorados' },
  { kind: 'actuator', title: 'Atuadores' },
]

const groups = computed(() =>
  GROUPS.map((group) => ({
    ...group,
    devices: props.devices
      .filter((device) => device.kind === group.kind)
      .sort((a, b) => Number(b.active) - Number(a.active)),
  })).filter((group) => group.devices.length),
)

function situation(device: Device): { cls: string; text: string } {
  if (!device.active) return { cls: 'is-inactive', text: 'Desativado' }
  const conn = connection(device.id)
  if (conn === 'online') return { cls: 'is-online', text: 'Online' }
  if (conn === 'never') return { cls: 'is-never', text: 'Sem dados' }
  return { cls: 'is-stale', text: `Parou ${formatAge(ageSeconds(device.id) ?? 0)}` }
}

function readings(device: Device): string[] {
  const out: string[] = []
  for (const field of device.fields) {
    const current = value(device.id, field.key)
    if (current === null) continue
    const n = current.toLocaleString('pt-BR', {
      minimumFractionDigits: field.decimals,
      maximumFractionDigits: field.decimals,
    })
    // "pH 7,26", e não "pH 7,26 pH".
    const unit = field.unit && field.unit !== field.short ? ` ${field.unit}` : ''
    out.push(`${field.short} ${n}${unit}`)
  }
  if (device.state_field) {
    const on = state(device.id, device.state_field)
    if (on !== null) out.unshift(on ? 'Ligado' : 'Desligado')
  }
  return out
}

function kindNote(device: Device): string {
  if (device.kind === 'actuator') return device.control === 'rule' ? 'pela regra' : 'manual'
  const count = device.fields.length
  return `${count} ${count === 1 ? 'variável' : 'variáveis'}`
}
</script>

<template>
  <div class="device-table-wrap">
    <table class="device-table">
      <thead>
        <tr>
          <th scope="col">Dispositivo</th>
          <th scope="col">Tipo</th>
          <th scope="col">Zona</th>
          <th scope="col">Situação</th>
          <th scope="col">Última leitura</th>
          <th v-if="canEdit" scope="col"><span class="sr-only">Ações</span></th>
        </tr>
      </thead>

      <tbody v-for="group in groups" :key="group.kind">
        <tr class="device-group">
          <th :colspan="canEdit ? 6 : 5" scope="colgroup">{{ group.title }}</th>
        </tr>

        <tr v-for="device in group.devices" :key="device.id" :class="{ 'is-inactive-row': !device.active }">
          <th scope="row" class="device-name">
            <div>
              <component :is="KIND_ICON[device.kind]" :size="17" aria-hidden="true" />
              <span>
                <strong>{{ device.name }}</strong>
                <code>{{ device.id }}</code>
              </span>
            </div>
          </th>
          <td>
            {{ KIND_LABEL[device.kind] }}
            <small>{{ kindNote(device) }}</small>
          </td>
          <td><code>{{ device.zone }}</code></td>
          <td>
            <span :class="['device-situation', situation(device).cls]">
              <span class="device-dot" aria-hidden="true" />
              {{ situation(device).text }}
            </span>
          </td>
          <td class="device-reading">
            <template v-if="device.active && readings(device).length">
              <span
                v-if="rangeLevel(device)"
                :class="['table-level', `badge-${rangeLevel(device)}`]"
              >
                <component :is="LEVEL_ICON[rangeLevel(device)!]" :size="12" aria-hidden="true" />
                {{ LEVEL_TEXT[rangeLevel(device)!] }}
              </span>
              <span class="device-values">{{ readings(device).join(' · ') }}</span>
            </template>
            <span v-else class="device-empty">—</span>
          </td>
          <td v-if="canEdit" class="device-actions">
            <button
              type="button"
              class="icon-button"
              :aria-label="`Editar ${device.name}`"
              :title="`Editar ${device.name}`"
              @click="emit('edit', device)"
            >
              <Pencil :size="16" aria-hidden="true" />
              Editar
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/* Tabela larga rola no próprio contêiner; a página nunca rola na horizontal. */
.device-table-wrap {
  overflow-x: auto;
}

.device-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.device-table th,
.device-table td {
  padding: 10px;
  border-bottom: 1px solid var(--line-soft);
  text-align: left;
  vertical-align: middle;
}

.device-table thead th {
  border-bottom: var(--bw-strong) solid var(--line);
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.device-group th {
  padding-top: 18px;
  padding-bottom: 6px;
  border-bottom: var(--bw) solid var(--line);
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

tbody:first-of-type .device-group th {
  padding-top: 10px;
}

.device-table td {
  font-weight: 600;
}

.device-table td small {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.device-table code {
  color: var(--muted);
  font-size: 0.8125rem;
  white-space: nowrap;
}

.device-name {
  font-weight: inherit;
}

.device-name > div {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.device-name svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--accent);
}

.device-name span {
  display: flex;
  flex-direction: column;
}

.device-name strong {
  font-weight: var(--fw-heavy);
}

/* Situação: a palavra escrita manda; a bolinha só reforça. */
.device-situation {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
}

.device-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.device-situation.is-online {
  color: var(--ok-ink);
}

.device-situation.is-online .device-dot {
  background: var(--nivel-ok);
}

.device-situation.is-stale {
  color: var(--critico-ink);
}

.device-situation.is-stale .device-dot {
  background: var(--nivel-critico);
}

.device-situation.is-never,
.device-situation.is-inactive {
  color: var(--muted);
}

.device-situation.is-never .device-dot {
  border: 2px dashed var(--muted);
}

.device-situation.is-inactive .device-dot {
  border: 2px solid var(--muted);
}

.device-reading {
  min-width: 220px;
}

.device-reading .table-level {
  margin-right: 8px;
}

.device-values {
  color: var(--ink);
}

.device-empty {
  color: var(--muted);
}

.is-inactive-row th,
.is-inactive-row td {
  color: var(--muted);
}

.is-inactive-row .device-name svg {
  color: var(--muted);
}

.device-actions {
  width: 1%;
  text-align: right;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: var(--bw) solid var(--field);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
  background: var(--surface);
}

.icon-button:hover {
  border-color: var(--ink);
  background: var(--surface-2);
}
</style>
