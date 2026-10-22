<script setup lang="ts">
// Tela Dispositivos (WEB-03): o cadastro com o estado ao vivo de cada um e,
// para o admin, o formulário de cadastrar, editar e desativar. Na aba de
// regras, os limites do aerador.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, X } from 'lucide-vue-next'
import { getRules } from '../api/devices'
import DeviceForm from '../components/DeviceForm.vue'
import DeviceList from '../components/DeviceList.vue'
import RoleGate from '../components/RoleGate.vue'
import RuleCard from '../components/RuleCard.vue'
import type { Device, Rule } from '../domain/devices'
import { LEVEL_ICON } from '../icons'
import { useAuthStore } from '../stores/auth'
import { useDevicesStore } from '../stores/devices'

const auth = useAuthStore()
const devicesStore = useDevicesStore()
const route = useRoute()
const router = useRouter()

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

const summary = computed(() => {
  const all = devicesStore.devices
  const active = all.filter((device) => device.active).length
  const inactive = all.length - active
  return inactive ? `${active} ativos · ${inactive} desativados` : `${active} ativos`
})

/** `undefined`: formulário fechado; `null`: cadastro novo. */
const editing = ref<Device | null | undefined>(undefined)
const notice = ref<string | null>(null)

function openForm(device: Device | null) {
  notice.value = null
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
</script>

<template>
  <main class="dashboard">
    <header class="page-header">
      <div>
        <h2>Dispositivos</h2>
        <p>
          Os sensores, a bomba e os atuadores do tanque, com o que cada um está publicando agora.
          É deste cadastro que o dashboard e o 3D se montam.
        </p>
      </div>

      <RoleGate permission="editRegistry">
        <button type="button" class="button button-primary" @click="openForm(null)">
          <Plus :size="18" aria-hidden="true" />
          Cadastrar dispositivo
        </button>
      </RoleGate>
    </header>

    <div v-if="notice" class="form-success" role="status">
      <component :is="LEVEL_ICON.ok" :size="18" aria-hidden="true" />
      {{ notice }}
      <button type="button" aria-label="Fechar aviso" @click="notice = null">
        <X :size="16" aria-hidden="true" />
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
        <span class="tab-count">{{ item.id === 'regras' ? rules.length : devicesStore.devices.length }}</span>
      </button>
    </div>

    <section
      v-if="tab === 'dispositivos'"
      id="painel-dispositivos"
      class="panel"
      role="tabpanel"
      aria-labelledby="aba-dispositivos"
    >
      <div class="panel-header">
        <h3>Cadastro</h3>
        <span class="small-note">{{ summary }}</span>
      </div>

      <div v-if="devicesStore.loading && !devicesStore.devices.length" class="loading-state">
        <span class="spinner" />
        Carregando o cadastro…
      </div>

      <DeviceList
        v-else
        :devices="devicesStore.devices"
        :can-edit="auth.can('editRegistry')"
        @edit="openForm"
      />
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
/* Abas: o mesmo desenho do seletor de período, um pouco maior. */
.tabs {
  display: inline-flex;
  gap: 2px;
  margin-bottom: 14px;
  padding: 3px;
  border: var(--bw) solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}

.tabs button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 9px;
  color: var(--muted);
  font-size: 0.9375rem;
  font-weight: var(--fw-bold);
  background: transparent;
}

.tabs button:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.tabs button.active {
  color: #ffffff;
  font-weight: var(--fw-heavy);
  background: var(--night);
}

.tab-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
  background: var(--line-soft);
  color: var(--ink);
}

.tabs button.active .tab-count {
  color: var(--night);
  background: #ffffff;
}

.rules {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
