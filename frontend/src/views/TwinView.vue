<script setup lang="ts">
// Gêmeo digital 3D (WEB-05 a WEB-08). A cena (src/scene/TwinScene.ts) lê o
// store ao vivo de dentro do próprio loop; esta tela só a cria, entrega o
// cadastro e desmonta tudo ao sair.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useAlerts } from '../composables/useAlerts'
import { formatAge } from '../composables/useDeviceState'
import { ITEM_LEVEL_TEXT, useItemLevel, type ItemLevel } from '../composables/useItemLevel'
import { useLiveValues } from '../composables/useLiveValues'
import { useNow } from '../composables/useNow'
import { LEVEL_ICON, UI_ICON } from '../icons'
import { STALE_AFTER_MS } from '../live/freshness'
import { TwinScene } from '../scene/TwinScene'
import { useDevicesStore } from '../stores/devices'
import { useLiveStore } from '../stores/live'

const devicesStore = useDevicesStore()
const live = useLiveStore()
const now = useNow()
const { value, state } = useLiveValues()
const { alerts } = useAlerts()
const { level } = useItemLevel(() => alerts.value)

/** A cena congela se nada chegar por 10 s, de nenhum dispositivo (WEB-06). */
function isFrozen(at: number): boolean {
  return live.lastMessageAt === null || at - live.lastMessageAt > STALE_AFTER_MS
}
const frozen = computed(() => isFrozen(now.value))
const silentFor = computed(() =>
  live.lastMessageAt === null ? null : Math.max(0, Math.round((now.value - live.lastMessageAt) / 1000)),
)

const LEGEND: ItemLevel[] = ['ok', 'atencao', 'critico', 'vazio']

const host = ref<HTMLElement | null>(null)
const scene = shallowRef<TwinScene | null>(null)
const failed = ref(false)

onMounted(() => {
  void devicesStore.load()
  if (!host.value) return
  try {
    scene.value = new TwinScene(host.value, { value, state, level, frozen: () => isFrozen(Date.now()) })
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

      <ul class="twin-legend" aria-label="Legenda das cores">
        <li v-for="item in LEGEND" :key="item">
          <span :class="['twin-swatch', `swatch-${item}`]" aria-hidden="true" />
          {{ ITEM_LEVEL_TEXT[item] }}
        </li>
      </ul>

      <div v-if="frozen && !failed" class="twin-frozen" role="status">
        <component :is="UI_ICON.offline" :size="22" aria-hidden="true" />
        <div>
          <strong>{{ silentFor === null ? 'Aguardando os primeiros dados' : `Sem dados ${formatAge(silentFor)}` }}</strong>
          <span>
            A cena só anda com o que chega ao vivo pelo WebSocket. Ela ficou parada e volta sozinha quando as leituras
            voltarem.
          </span>
        </div>
      </div>

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

.twin-legend {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 8px 12px;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: var(--fw-bold);
  list-style: none;
  background: var(--surface);
  z-index: 2;
}

.twin-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.twin-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.swatch-ok {
  background: var(--nivel-ok);
}

.swatch-atencao {
  background: var(--nivel-atencao);
}

.swatch-critico {
  background: var(--nivel-critico);
}

.swatch-vazio {
  border: 2px dashed var(--muted);
  background: var(--scene-nodata);
}

/* Aviso de "sem dados": no meio da cena, impossível de não ver. */
.twin-frozen {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(440px, calc(100% - 32px));
  padding: 14px 16px;
  border: var(--bw-alert) solid var(--atencao-line);
  border-radius: var(--radius);
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 10px 30px rgba(10, 35, 55, 0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}

.twin-frozen svg {
  flex: 0 0 auto;
  color: var(--atencao-mark);
}

.twin-frozen strong {
  display: block;
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.twin-frozen span {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>

<style>
/* Rótulos da cena: criados pelo Three.js fora do Vue, por isso sem `scoped`. */
.twin-host canvas {
  display: block;
  touch-action: none;
}

/* O CSS2DRenderer dá z-index a cada rótulo; o z-index aqui prende todos eles
   abaixo do aviso de "sem dados" e da legenda. */
.twin-labels {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
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

/* O estado aparece na borda e escrito no texto do rótulo. */
.twin-label.level-ok {
  border-color: var(--nivel-ok);
}

.twin-label.level-atencao {
  border-color: var(--atencao-mark);
  background: #fcefd0;
}

.twin-label.level-critico {
  color: #ffffff;
  border-color: var(--nivel-critico);
  background: var(--nivel-critico);
}

.twin-label.level-vazio {
  color: var(--muted);
  border-style: dashed;
}
</style>
