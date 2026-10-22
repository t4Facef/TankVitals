<script setup lang="ts">
// Tela Dispositivos (WEB-03): o cadastro com o estado ao vivo de cada um.
import { computed, onMounted } from 'vue'
import DeviceList from '../components/DeviceList.vue'
import { LEVEL_ICON } from '../icons'
import { useDevicesStore } from '../stores/devices'

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
    </header>

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

      <DeviceList v-else :devices="devicesStore.devices" :can-edit="false" />
    </section>
  </main>
</template>
