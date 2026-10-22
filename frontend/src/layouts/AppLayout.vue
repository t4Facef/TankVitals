<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Menu, X } from 'lucide-vue-next'
import BrandMark from '../components/BrandMark.vue'
import UserMenu from '../components/UserMenu.vue'
import { MOCK } from '../config'
import { LIVE_STATUS_LABEL } from '../live/socket'
import { setMockFeedPaused } from '../mock/feed'
import { MENU_GROUPS, PAGES } from '../router/pages'
import { useAuthStore } from '../stores/auth'
import { useLiveStore } from '../stores/live'

const auth = useAuthStore()
const live = useLiveStore()
const route = useRoute()
const menuOpen = ref(false)

// Modo simulado: parar o "simulador" para ver as telas avisarem "sem dados".
const feedPaused = ref(false)
function toggleFeed() {
  feedPaused.value = !feedPaused.value
  setMockFeedPaused(feedPaused.value)
}

// O menu só mostra o que o papel da pessoa pode abrir.
const groups = computed(() =>
  MENU_GROUPS.map((group) => ({
    group,
    pages: PAGES.filter(
      (page) => page.group === group && (!page.permission || auth.can(page.permission)),
    ),
  })).filter((entry) => entry.pages.length > 0),
)


// No celular o menu vira gaveta; trocar de tela fecha a gaveta.
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

// A conexão ao vivo dura enquanto a pessoa está logada, não por tela: trocar
// de página não derruba o WebSocket.
onMounted(() => live.connect())
onUnmounted(() => live.disconnect())
</script>

<template>
  <div class="layout" :class="{ 'menu-open': menuOpen }">
    <aside class="sidebar">
      <div class="sidebar-top">
        <RouterLink :to="{ name: 'dashboard' }" class="brand">
          <BrandMark :size="38" />
          <span>
            <strong>TankVitals</strong>
            <small>aquicultura ao vivo</small>
          </span>
        </RouterLink>

        <button
          type="button"
          class="menu-toggle"
          :aria-expanded="menuOpen"
          :aria-label="menuOpen ? 'Fechar menu' : 'Abrir menu'"
          @click="menuOpen = !menuOpen"
        >
          <component :is="menuOpen ? X : Menu" :size="20" aria-hidden="true" />
        </button>
      </div>

      <nav class="nav" aria-label="Telas">
        <div v-for="entry in groups" :key="entry.group" class="nav-group">
          <span class="nav-group-title">{{ entry.group }}</span>
          <RouterLink
            v-for="page in entry.pages"
            :key="page.name"
            :to="{ name: page.name }"
            class="nav-link"
            active-class="active"
          >
            <component :is="page.icon" :size="18" aria-hidden="true" />
            {{ page.title }}
          </RouterLink>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="live-state" :class="`live-${live.status}`">
          <span class="live-state-dot" />
          {{ LIVE_STATUS_LABEL[live.status] }}
        </div>

        <div v-if="MOCK" class="mock-note">
          <p>Modo simulado: o login e os dados ao vivo são gerados no navegador.</p>
          <button type="button" :aria-pressed="feedPaused" @click="toggleFeed">
            {{ feedPaused ? 'Religar o simulador' : 'Parar o simulador' }}
          </button>
        </div>

        <UserMenu />
      </div>
    </aside>

    <div class="content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
/* O menu é a água funda do app: azul-marinho, com a cor do peixe só na marca
   e no ícone da tela aberta. */
.layout {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
  height: 100vh;
  padding: 18px 12px 16px;
  overflow-y: auto;
  color: var(--night-ink);
  background: var(--night);
}

.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 8px;
  color: #ffffff;
  text-decoration: none;
}

.brand strong,
.brand small {
  display: block;
}

.brand strong {
  font-size: 1.1875rem;
  font-weight: var(--fw-heavy);
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.brand small {
  color: var(--night-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.menu-toggle {
  display: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border: var(--bw) solid var(--night-line);
  border-radius: var(--radius-sm);
  color: #ffffff;
  background: transparent;
}

.nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group-title {
  padding: 0 10px 4px;
  color: var(--night-muted);
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  color: var(--night-ink);
  font-weight: 600;
  text-decoration: none;
}

.nav-link svg {
  flex: 0 0 auto;
  color: var(--night-muted);
}

.nav-link:hover {
  background: var(--night-2);
}

.nav-link.active {
  color: #ffffff;
  font-weight: var(--fw-heavy);
  background: var(--night-active);
}

.nav-link.active svg {
  color: var(--brand-fish);
}

.nav-link:focus-visible {
  outline-color: var(--brand-fish);
  outline-offset: -3px;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 8px 0;
  border-top: var(--bw) solid var(--night-line);
}

.live-state {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--night-muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.live-state-dot {
  width: 9px;
  height: 9px;
  border: 2px solid var(--night-muted);
  border-radius: 50%;
}

.live-live,
.live-simulated {
  color: #a6ebc2;
}

.live-live .live-state-dot,
.live-simulated .live-state-dot {
  border: 0;
  background: #5acb8b;
}

.live-connecting .live-state-dot,
.live-reconnecting .live-state-dot {
  border: 0;
  background: var(--nivel-atencao);
}


.mock-note {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border: var(--bw) dashed var(--night-line);
  border-radius: var(--radius-sm);
  color: var(--night-muted);
  font-size: 0.75rem;
  line-height: 1.4;
}

.mock-note button {
  min-height: 34px;
  padding: 0 10px;
  border: var(--bw) solid var(--night-line);
  border-radius: 8px;
  color: var(--night-ink);
  font-size: 0.75rem;
  font-weight: var(--fw-heavy);
  background: var(--night-2);
}

.mock-note button:hover {
  background: var(--night-active);
}

.mock-note button[aria-pressed='true'] {
  color: var(--night);
  background: var(--nivel-atencao);
}

.content {
  min-width: 0;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    /* Altura da barra do topo, para a barra de status do dashboard grudar logo abaixo. */
    --app-top-offset: 64px;
  }

  .sidebar {
    z-index: 20;
    gap: 0;
    height: auto;
    max-height: 100vh;
    padding: 10px 14px;
  }

  .menu-toggle {
    display: grid;
  }

  .nav,
  .sidebar-footer {
    display: none;
  }

  .menu-open .nav,
  .menu-open .sidebar-footer {
    display: flex;
  }

  .menu-open .nav {
    margin: 16px 0;
  }

  .menu-open .sidebar-footer {
    padding-bottom: 6px;
  }
}
</style>
