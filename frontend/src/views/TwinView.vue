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
import { usePreferences } from '../composables/usePreferences'
import TwinPanel from '../components/TwinPanel.vue'
import { KIND_ICON, LEVEL_ICON, UI_ICON } from '../icons'
import { STALE_AFTER_MS } from '../live/freshness'
import { TwinScene } from '../scene/TwinScene'
import { useDevicesStore } from '../stores/devices'
import { useLiveStore } from '../stores/live'

const devicesStore = useDevicesStore()
const live = useLiveStore()
const now = useNow()
const { value, state } = useLiveValues()
const { alerts } = useAlerts()
const { level, insight } = useItemLevel(() => alerts.value)

/** A cena congela se nada chegar por 10 s, de nenhum dispositivo (WEB-06). */
function isFrozen(at: number): boolean {
  return live.lastMessageAt === null || at - live.lastMessageAt > STALE_AFTER_MS
}
const frozen = computed(() => isFrozen(now.value))
const silentFor = computed(() =>
  live.lastMessageAt === null ? null : Math.max(0, Math.round((now.value - live.lastMessageAt) / 1000)),
)

const LEGEND: ItemLevel[] = ['ok', 'atencao', 'critico', 'vazio']

// --- item escolhido (WEB-08) ----------------------------------------------------

const selectedId = ref<string | null>(null)
const selected = computed(() => devicesStore.active.find((device) => device.id === selectedId.value) ?? null)

function select(id: string | null) {
  selectedId.value = id
}

// A cena desenha o destaque; um item que saiu do cadastro fecha o painel.
watch(selectedId, (id) => scene.value?.select(id))
watch(selected, (device) => {
  if (!device && selectedId.value) selectedId.value = null
})

const host = ref<HTMLElement | null>(null)
const scene = shallowRef<TwinScene | null>(null)
const failed = ref(false)

onMounted(() => {
  void devicesStore.load()
  if (!host.value) return
  try {
    scene.value = new TwinScene(
      host.value,
      { value, state, level, frozen: () => isFrozen(Date.now()) },
      { onSelect: select },
    )
  } catch {
    // Sem WebGL (driver, máquina virtual, navegador antigo) não há cena.
    failed.value = true
    return
  }
  scene.value.setDevices(devicesStore.active)
})

// Contraste novo: a cena pega as cores dos tokens de novo.
const preferences = usePreferences()
watch(
  () => preferences.contrast,
  () => scene.value?.refreshPalette(),
)

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

    <div class="twin-layout">
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

    <aside class="panel twin-aside">
      <TwinPanel
        v-if="selected"
        :key="selected.id"
        :device="selected"
        :level="level(selected)"
        :insight="insight(selected.id)"
        @close="select(null)"
      />

      <template v-else>
        <h3 class="twin-aside-title">Itens da cena</h3>
        <p class="small-note">Clique num item na cena, no rótulo dele ou aqui para ver a leitura, a saúde e os comandos.</p>
        <ul class="twin-items">
          <li v-for="device in devicesStore.active" :key="device.id">
            <button type="button" @click="select(device.id)">
              <component :is="KIND_ICON[device.kind]" :size="17" aria-hidden="true" />
              <span>{{ device.name }}</span>
              <span :class="['table-level', `badge-${level(device)}`]">{{ ITEM_LEVEL_TEXT[level(device)] }}</span>
            </button>
          </li>
        </ul>
      </template>
    </aside>
    </div>
  </main>
</template>

<style scoped>
/* A cena e, ao lado, a lista de itens ou o painel do item escolhido. */
.twin-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
  gap: 16px;
}

.twin-panel {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.twin-aside {
  max-height: min(68vh, 620px);
  overflow-y: auto;
}

.twin-aside-title {
  margin-bottom: 4px;
  font-size: 1.0625rem;
  font-weight: var(--fw-heavy);
}

.twin-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.twin-items button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  border: var(--bw) solid var(--line-soft);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-weight: var(--fw-bold);
  text-align: left;
  background: var(--surface);
}

.twin-items button:hover {
  border-color: var(--field);
  background: var(--surface-2);
}

.twin-items button svg {
  flex: 0 0 auto;
  color: var(--accent);
}

.twin-items button span:first-of-type {
  flex: 1;
}

@media (max-width: 1100px) {
  .twin-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .twin-aside {
    max-height: none;
  }
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

/* Rótulo de item: clicável, abre o painel. */
.twin-label.is-item {
  cursor: pointer;
  pointer-events: auto;
}

.twin-label.is-selected {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
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
