<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Construction } from 'lucide-vue-next'
import LiveSnapshot from '../components/LiveSnapshot.vue'
import RoleGate from '../components/RoleGate.vue'

// Tela que ainda não existe: mostra o que ela vai ter e qual tarefa a constrói.
const route = useRoute()
const page = computed(() => route.meta.page)
</script>

<template>
  <main v-if="page" class="dashboard">
    <header class="page-header">
      <div>
        <h2>{{ page.title }}</h2>
        <p v-if="page.description">{{ page.description }}</p>
      </div>

      <RoleGate v-if="page.action" :permission="page.action.permission">
        <button type="button" class="page-action" disabled :title="`Chega com a ${page.task}`">
          {{ page.action.label }}
        </button>
      </RoleGate>
    </header>

    <section class="panel placeholder">
      <Construction :size="22" aria-hidden="true" />
      <div>
        <strong>Tela em construção</strong>
        <span>
          Quem constrói esta tela é a tarefa <b>{{ page.task }}</b> do backlog
          (<code>docs/TAREFAS-2BIM.md</code>).
        </span>
      </div>
    </section>

    <section class="panel">
      <div class="panel-header compact">
        <h3>O que já está chegando pelo store ao vivo</h3>
      </div>
      <LiveSnapshot />
    </section>
  </main>
</template>

<style scoped>
.page-action {
  min-height: 42px;
  padding: 0 16px;
  border: var(--bw) solid var(--field);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-weight: var(--fw-heavy);
  background: var(--surface);
}

.page-action:disabled {
  cursor: not-allowed;
}

/* Borda tracejada: a tela ainda não existe. */
.placeholder {
  display: flex;
  align-items: center;
  gap: 14px;
  border-style: dashed;
  color: var(--muted);
}

.placeholder strong,
.placeholder span {
  display: block;
}

.placeholder strong {
  color: var(--ink);
  font-weight: var(--fw-heavy);
}

.placeholder svg {
  flex: 0 0 auto;
  color: var(--atencao-mark);
}
</style>
