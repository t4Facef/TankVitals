<script setup lang="ts">
// Gêmeo digital 3D (WEB-05 a WEB-08). A cena (src/scene/TwinScene.ts) lê o
// store ao vivo de dentro do próprio loop; esta tela só a cria, entrega o
// cadastro e desmonta tudo ao sair.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useLiveValues } from '../composables/useLiveValues'
import { LEVEL_ICON } from '../icons'
import { TwinScene } from '../scene/TwinScene'
import { useDevicesStore } from '../stores/devices'

const devicesStore = useDevicesStore()
const { value, state } = useLiveValues()

const host = ref<HTMLElement | null>(null)
const scene = shallowRef<TwinScene | null>(null)
const failed = ref(false)

onMounted(() => {
  void devicesStore.load()
  if (!host.value) return
  try {
    scene.value = new TwinScene(host.value, { value, state })
  } catch {
    // Sem WebGL (driver, máquina virtual, navegador antigo) não há cena.
    failed.value = true
    return
  }
  scene.value.setDevices(devicesStore.active)
})

// O cadastro mudou (dispositivo novo, desativado): só então a cena remonta os itens.
watch(
  () => devicesStore.active,
  (devices) => scene.value?.setDevices(devices),
)

onBeforeUnmount(() => {
  scene.value?.dispose()
  scene.value = null
})
</script>

<template>
  <main class="dashboard twin-page">
    <header class="page-header">
      <div>
        <h2>Gêmeo 3D</h2>
        <p>
          O tanque, a bomba e os atuadores em 3D, movidos só pelos dados que chegam ao vivo pelo WebSocket. Arraste para
          girar e use a roda do mouse para aproximar.
        </p>
      </div>
    </header>

    <section class="panel twin-panel" aria-label="Cena 3D do tanque">
      <div ref="host" class="twin-host" role="img" aria-label="Cena 3D do tanque com os sensores, a bomba e os atuadores" />
      <div v-if="failed" class="error-state twin-failed">
        <component :is="LEVEL_ICON.critico" :size="22" aria-hidden="true" />
        <strong>Este navegador não abriu o 3D</strong>
        <span>A cena precisa de WebGL. Tente outro navegador ou ative a aceleração de hardware.</span>
      </div>
    </section>
  </main>
</template>

<style scoped>
.twin-panel {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.twin-host {
  position: relative;
  height: min(68vh, 620px);
  min-height: 380px;
}

.twin-failed {
  position: absolute;
  inset: 0;
  background: var(--surface);
}
</style>

<style>
/* Rótulos da cena: criados pelo Three.js fora do Vue, por isso sem `scoped`. */
.twin-host canvas {
  display: block;
  touch-action: none;
}

.twin-labels {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.twin-label {
  padding: 3px 9px;
  border: var(--bw-strong) solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  font-family: var(--font);
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
  white-space: nowrap;
  background: var(--surface);
  box-shadow: 0 2px 6px rgba(10, 35, 55, 0.18);
}

.twin-label.is-fixture {
  color: var(--muted);
  border-style: dashed;
}
</style>
