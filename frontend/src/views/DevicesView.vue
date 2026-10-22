<script setup lang="ts">
// Tela Dispositivos (WEB-03): o cadastro com o estado ao vivo de cada um e,
// para o admin, o formulário de cadastrar, editar e desativar.
import { computed, onMounted, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import DeviceForm from '../components/DeviceForm.vue'
import DeviceList from '../components/DeviceList.vue'
import RoleGate from '../components/RoleGate.vue'
import type { Device } from '../domain/devices'
import { LEVEL_ICON } from '../icons'
import { useAuthStore } from '../stores/auth'
import { useDevicesStore } from '../stores/devices'

const auth = useAuthStore()
const devicesStore = useDevicesStore()

onMounted(() => {
  // Sempre do servidor: outra pessoa pode ter mudado o cadastro.
  void devicesStore.load(true)
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

    <section class="panel">
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

    <DeviceForm
      v-if="editing !== undefined"
      :device="editing"
      :devices="devicesStore.devices"
      @close="editing = undefined"
      @saved="onSaved"
    />
  </main>
</template>
