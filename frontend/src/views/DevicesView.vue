<script setup lang="ts">
// Tela Dispositivos (WEB-03): o cadastro de cada tanque em cartões, com o que
// cada um está publicando agora. O admin cadastra, edita e desativa; na aba de
// regras ficam os limites do aerador.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getRules, updateDevice } from '../api/devices'
import DeviceCard from '../components/DeviceCard.vue'
import DeviceDetail from '../components/DeviceDetail.vue'
import DeviceForm from '../components/DeviceForm.vue'
import RoleGate from '../components/RoleGate.vue'
import RuleCard from '../components/RuleCard.vue'
import { worstLevel } from '../alerts'
import { useAlerts } from '../composables/useAlerts'
import { useDeviceState } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, useItemLevel, type ItemLevel } from '../composables/useItemLevel'
import type { Device, DeviceKind, Rule } from '../domain/devices'
import { LEVEL_ICON, UI_ICON } from '../icons'
import { groupByZone, tankLabel } from '../plant/tanks'
import { useAuthStore } from '../stores/auth'
import { useDevicesStore } from '../stores/devices'
import type { AlertLevel } from '../types'

const auth = useAuthStore()
const devicesStore = useDevicesStore()
const route = useRoute()
const router = useRouter()
const { alerts } = useAlerts()
const { level, insight } = useItemLevel(() => alerts.value)
const { connection } = useDeviceState()

type Tab = 'dispositivos' | 'regras'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'dispositivos', label: 'Dispositivos' },
  { id: 'regras', label: 'Regras' },
]

// A aba fica na URL: dá para mandar o link direto para as regras.
const tab = computed<Tab>(() => (route.query.aba === 'regras' ? 'regras' : 'dispositivos'))
function selectTab(next: Tab) {
  void router.replace({ query: { ...route.query, aba: next === 'dispositivos' ? undefined : next } })
}

const rules = ref<Rule[]>([])
const rulesError = ref<string | null>(null)
const rulesLoading = ref(true)

async function loadRules() {
  try {
    rules.value = await getRules()
    rulesError.value = null
  } catch (err) {
    rulesError.value = err instanceof Error ? err.message : 'Não foi possível carregar as regras.'
  } finally {
    rulesLoading.value = false
  }
}

function onRuleSaved(saved: Rule) {
  rules.value = rules.value.map((rule) => (rule.id === saved.id ? saved : rule))
}

function deviceById(id: string): Device | undefined {
  return devicesStore.devices.find((device) => device.id === id)
}

onMounted(() => {
  // Sempre do servidor: outra pessoa pode ter mudado o cadastro.
  void devicesStore.load(true)
  void loadRules()
})

// --- situação de cada um e o resumo ------------------------------------------------

type Situation = 'online' | 'parado' | 'nunca' | 'desativado'

function situationOf(device: Device): Situation {
  if (!device.active) return 'desativado'
  const link = connection(device.id)
  return link === 'online' ? 'online' : link === 'never' ? 'nunca' : 'parado'
}

function levelOf(device: Device): ItemLevel {
  return device.active ? level(device) : 'vazio'
}

const outOfRange = (device: Device) => device.active && ['atencao', 'critico'].includes(levelOf(device))

const counts = computed(() => {
  const all = devicesStore.devices
  const active = all.filter((d) => d.active)
  return {
    active: active.length,
    inactive: all.length - active.length,
    online: active.filter((d) => situationOf(d) === 'online').length,
    stopped: active.filter((d) => situationOf(d) !== 'online').length,
    problems: active.filter(outOfRange).length,
  }
})

// --- filtros --------------------------------------------------------------------

type SituationFilter = 'todas' | 'online' | 'parados' | 'fora' | 'desativados'
const search = ref('')
const kindFilter = ref<'todos' | DeviceKind>('todos')
const situationFilter = ref<SituationFilter>('todas')

const KINDS: Array<{ id: 'todos' | DeviceKind; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'sensor', label: 'Sensores' },
  { id: 'equipment', label: 'Equipamentos' },
  { id: 'actuator', label: 'Atuadores' },
]

const kindCount = (kind: 'todos' | DeviceKind) =>
  devicesStore.active.filter((d) => kind === 'todos' || d.kind === kind).length

function matches(device: Device): boolean {
  const s = situationFilter.value
  if (s === 'desativados') {
    if (device.active) return false
  } else {
    if (!device.active) return false
    if (s === 'online' && situationOf(device) !== 'online') return false
    if (s === 'parados' && situationOf(device) === 'online') return false
    if (s === 'fora' && !outOfRange(device)) return false
  }
  if (kindFilter.value !== 'todos' && device.kind !== kindFilter.value) return false
  const q = search.value.trim().toLowerCase()
  return !q || [device.name, device.id, device.zone].some((text) => text.toLowerCase().includes(q))
}

const filtering = computed(() => search.value.trim() !== '' || kindFilter.value !== 'todos' || situationFilter.value !== 'todas')

function clearFilters() {
  search.value = ''
  kindFilter.value = 'todos'
  situationFilter.value = 'todas'
}

function pickSituation(next: SituationFilter) {
  situationFilter.value = situationFilter.value === next ? 'todas' : next
}

const KIND_ORDER: Record<DeviceKind, number> = { sensor: 0, equipment: 1, actuator: 2 }

/** Uma seção por tanque (zona), com os cartões do que passou nos filtros. */
const tanks = computed(() =>
  groupByZone(devicesStore.devices).map(({ zone, devices }) => {
    const active = devices.filter((d) => d.active)
    const online = active.filter((d) => situationOf(d) === 'online')
    const levels = online.map(levelOf).filter((l): l is AlertLevel => l !== 'vazio')
    return {
      zone,
      label: tankLabel(zone),
      level: (online.length && levels.length ? worstLevel(levels) : 'vazio') as ItemLevel,
      online: online.length,
      total: active.length,
      cards: devices.filter(matches).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'pt-BR')),
    }
  }),
)

const visibleTanks = computed(() => tanks.value.filter((tank) => tank.cards.length > 0))

// --- detalhe, formulário e avisos -------------------------------------------------

const detailId = ref<string | null>(null)
const detail = computed(() => (detailId.value ? (deviceById(detailId.value) ?? null) : null))
/** `undefined`: formulário fechado; `null`: cadastro novo. */
const editing = ref<Device | null | undefined>(undefined)
const notice = ref<string | null>(null)
const busy = ref(false)

function openForm(device: Device | null) {
  notice.value = null
  detailId.value = null
  editing.value = device
}

async function onSaved(device: Device, isNew: boolean) {
  editing.value = undefined
  // Recarrega para o dashboard e o 3D verem o cadastro novo sem recarregar a página.
  await devicesStore.load(true)
  if (isNew) notice.value = `${device.name} cadastrado. Aparece como "sem dados" até publicar a primeira leitura.`
  else if (!device.active) notice.value = `${device.name} desativado. Saiu do dashboard e do 3D; o histórico continua.`
  else notice.value = `${device.name} salvo. O dashboard e o 3D já usam as faixas novas.`
}

async function toggleActive(device: Device) {
  busy.value = true
  try {
    const saved = await updateDevice(device.id, {
      name: device.name,
      zone: device.zone,
      active: !device.active,
      fields: device.fields,
    })
    detailId.value = null
    await onSaved(saved, false)
    if (saved.active) notice.value = `${saved.name} reativado. Volta ao dashboard e ao 3D na próxima leitura.`
  } catch (err) {
    notice.value = err instanceof Error ? `Não foi possível mudar: ${err.message}` : 'Não foi possível mudar o dispositivo.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="dashboard devices-page">
    <header class="page-header">
      <div>
        <h2>Dispositivos</h2>
        <p>
          Os sensores, as bombas e os atuadores de cada tanque, com o que cada um está publicando agora. É deste cadastro
          que o dashboard e o 3D se montam.
        </p>
      </div>

      <RoleGate permission="editRegistry">
        <button type="button" class="button button-primary" @click="openForm(null)">
          <component :is="UI_ICON.novo" :size="18" aria-hidden="true" />
          Cadastrar dispositivo
        </button>
      </RoleGate>
    </header>

    <div v-if="notice" class="form-success" role="status">
      <component :is="LEVEL_ICON.ok" :size="18" aria-hidden="true" />
      {{ notice }}
      <button type="button" aria-label="Fechar aviso" @click="notice = null">
        <component :is="UI_ICON.fechar" :size="16" aria-hidden="true" />
      </button>
    </div>

    <div v-if="devicesStore.error" class="global-error">
      <component :is="LEVEL_ICON.critico" :size="20" aria-hidden="true" />
      <div>
        <strong>Não foi possível carregar o cadastro</strong>
        <small>{{ devicesStore.error }}</small>
      </div>
      <button type="button" @click="devicesStore.load(true)">Tentar de novo</button>
    </div>

    <div class="tabs" role="tablist" aria-label="Seções do cadastro">
      <button
        v-for="item in TABS"
        :id="`aba-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        :aria-controls="`painel-${item.id}`"
        :class="{ active: tab === item.id }"
        @click="selectTab(item.id)"
      >
        {{ item.label }}
        <span class="tab-count">{{ item.id === 'regras' ? rules.length : counts.active }}</span>
      </button>
    </div>

    <section v-if="tab === 'dispositivos'" id="painel-dispositivos" role="tabpanel" aria-labelledby="aba-dispositivos">
      <!-- O resumo também filtra: clicar em "Fora do normal" mostra só esses. -->
      <div class="summary" aria-label="Resumo do cadastro">
        <button type="button" class="summary-tile" :aria-pressed="!filtering" @click="clearFilters">
          <span>Dispositivos ativos</span>
          <strong>{{ counts.active }}</strong>
          <small>{{ counts.inactive ? `${counts.inactive} desativados` : 'nenhum desativado' }}</small>
        </button>
        <button
          type="button"
          class="summary-tile is-online"
          :aria-pressed="situationFilter === 'online'"
          @click="pickSituation('online')"
        >
          <span>Publicando agora</span>
          <strong>{{ counts.online }}</strong>
          <small>de {{ counts.active }} ativos</small>
        </button>
        <button
          type="button"
          :class="['summary-tile', { 'is-warn': counts.stopped > 0 }]"
          :aria-pressed="situationFilter === 'parados'"
          @click="pickSituation('parados')"
        >
          <span>Parados ou sem dados</span>
          <strong>{{ counts.stopped }}</strong>
          <small>{{ counts.stopped ? 'sem leitura nos últimos 10 s' : 'todos publicando' }}</small>
        </button>
        <button
          type="button"
          :class="['summary-tile', { 'is-bad': counts.problems > 0 }]"
          :aria-pressed="situationFilter === 'fora'"
          @click="pickSituation('fora')"
        >
          <span>Fora do normal</span>
          <strong>{{ counts.problems }}</strong>
          <small>{{ counts.problems ? 'pela faixa ou pela IA' : 'tudo dentro da faixa' }}</small>
        </button>
      </div>

      <div class="toolbar">
        <label class="search">
          <component :is="UI_ICON.buscar" :size="17" aria-hidden="true" />
          <span class="sr-only">Buscar dispositivo</span>
          <input v-model="search" type="search" placeholder="Buscar por nome, id ou tanque" />
        </label>

        <div class="segmented-control" role="group" aria-label="Tipo">
          <button
            v-for="kind in KINDS"
            :key="kind.id"
            type="button"
            :class="{ active: kindFilter === kind.id }"
            :aria-pressed="kindFilter === kind.id"
            @click="kindFilter = kind.id"
          >
            {{ kind.label }} <span class="kind-count">{{ kindCount(kind.id) }}</span>
          </button>
        </div>

        <label class="form-field situation">
          <span class="sr-only">Situação</span>
          <select v-model="situationFilter">
            <option value="todas">Todas as situações</option>
            <option value="online">Publicando agora</option>
            <option value="parados">Parados ou sem dados</option>
            <option value="fora">Fora do normal</option>
            <option v-if="auth.can('editRegistry')" value="desativados">Desativados</option>
          </select>
        </label>
      </div>

      <div v-if="devicesStore.loading && !devicesStore.devices.length" class="panel loading-state">
        <span class="spinner" />
        Carregando o cadastro…
      </div>

      <div v-else-if="!visibleTanks.length" class="panel empty">
        <component :is="UI_ICON.buscar" :size="22" aria-hidden="true" />
        <strong>Nenhum dispositivo com esses filtros</strong>
        <button type="button" class="button" @click="clearFilters">Limpar filtros</button>
      </div>

      <section v-for="tank in visibleTanks" :key="tank.zone" class="tank-section" :aria-labelledby="`tanque-${tank.zone}`">
        <header class="tank-section-head">
          <span class="tank-mark"><component :is="UI_ICON.tanque" :size="20" aria-hidden="true" /></span>
          <div>
            <h3 :id="`tanque-${tank.zone}`">{{ tank.label }}</h3>
            <span><code>{{ tank.zone }}</code> · {{ tank.online }} de {{ tank.total }} publicando</span>
          </div>
          <span :class="['table-level', `badge-${tank.level}`]">{{ ITEM_LEVEL_TEXT[tank.level] }}</span>
          <RouterLink class="button" :to="{ name: 'gemeo-3d', query: { tanque: tank.zone } }">
            Ver no 3D
            <component :is="UI_ICON.abrir" :size="16" aria-hidden="true" />
          </RouterLink>
        </header>

        <div class="device-grid">
          <DeviceCard
            v-for="device in tank.cards"
            :key="device.id"
            :class="{ wide: device.kind === 'equipment' }"
            :device="device"
            :level="levelOf(device)"
            :insight="insight(device.id)"
            @open="detailId = device.id"
          />
        </div>
      </section>
    </section>

    <section v-else id="painel-regras" class="rules" role="tabpanel" aria-labelledby="aba-regras">
      <div v-if="rulesLoading" class="panel loading-state">
        <span class="spinner" />
        Carregando as regras…
      </div>
      <div v-else-if="rulesError" class="global-error">
        <component :is="LEVEL_ICON.critico" :size="20" aria-hidden="true" />
        <div>
          <strong>Não foi possível carregar as regras</strong>
          <small>{{ rulesError }}</small>
        </div>
        <button type="button" @click="loadRules">Tentar de novo</button>
      </div>
      <template v-else>
        <RuleCard
          v-for="rule in rules"
          :key="rule.id"
          :rule="rule"
          :sensor="deviceById(rule.device)"
          :actuator="deviceById(rule.actuator)"
          :can-edit="auth.can('editRegistry')"
          @saved="onRuleSaved"
        />
        <p v-if="!auth.can('editRegistry')" class="small-note">Só o administrador muda os limites das regras.</p>
      </template>
    </section>

    <DeviceDetail
      v-if="detail"
      :key="detail.id"
      :device="detail"
      :level="levelOf(detail)"
      :insight="insight(detail.id)"
      :busy="busy"
      @close="detailId = null"
      @edit="openForm"
      @toggle-active="toggleActive"
    />

    <DeviceForm
      v-if="editing !== undefined"
      :device="editing"
      :devices="devicesStore.devices"
      @close="editing = undefined"
      @saved="onSaved"
    />
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.search {
  display: flex;
  flex: 1 1 260px;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border: var(--bw) solid var(--field);
  border-radius: var(--radius-sm);
  color: var(--muted);
  background: var(--surface);
}

.search:focus-within {
  outline: 3px solid var(--accent);
  outline-offset: 1px;
}

.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  color: var(--ink);
  font: inherit;
  background: transparent;
  outline: none;
}

.kind-count {
  margin-left: 3px;
  opacity: 0.75;
}

.situation {
  min-width: 200px;
}

.tank-section {
  margin-bottom: 26px;
}

.tank-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: var(--bw-strong) solid var(--line);
}

.tank-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: var(--brand-fish);
  background: var(--night);
}

.tank-section-head > div {
  flex: 1 1 220px;
  min-width: 0;
}

.tank-section-head h3 {
  font-size: 1.25rem;
  font-weight: var(--fw-heavy);
  line-height: 1.2;
}

.tank-section-head > div > span {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.tank-section-head .button {
  text-decoration: none;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-auto-flow: dense;
  gap: 14px;
}

/* O equipamento ocupa a linha toda, com as variáveis lado a lado; os outros cartões preenchem os buracos. */
.device-grid .wide {
  grid-column: 1 / -1;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 16px;
  color: var(--muted);
}

.empty strong {
  color: var(--ink);
}

.rules {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 900px) {
  .toolbar .segmented-control {
    max-width: 100%;
    overflow-x: auto;
  }
}
</style>
