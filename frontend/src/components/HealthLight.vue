<script setup lang="ts">
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'

/**
 * O semáforo da saúde prevista (IA-09): vermelho em cima, amarelo no meio e
 * verde embaixo, com a luz do nível acesa. Sem previsão recente, fica todo
 * apagado.
 */
defineProps<{ level: ItemLevel }>()

const LIGHTS = ['critico', 'atencao', 'ok'] as const
</script>

<template>
  <span class="health-light" role="img" :aria-label="`Semáforo da saúde: ${ITEM_LEVEL_TEXT[level]}`">
    <span v-for="light in LIGHTS" :key="light" :class="['lamp', `lamp-${light}`, { on: level === light }]" />
  </span>
</template>

<style scoped>
.health-light {
  display: inline-flex;
  flex: none;
  flex-direction: column;
  gap: 7px;
  padding: 9px 8px;
  border-radius: 16px;
  background: var(--night);
}

.lamp {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 16%, transparent);
}

.lamp-critico.on {
  background: var(--nivel-critico);
  box-shadow: 0 0 12px var(--nivel-critico);
}

.lamp-atencao.on {
  background: var(--nivel-atencao);
  box-shadow: 0 0 12px var(--nivel-atencao);
}

.lamp-ok.on {
  background: var(--nivel-ok);
  box-shadow: 0 0 12px var(--nivel-ok);
}
</style>
