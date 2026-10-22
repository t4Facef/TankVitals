<script setup lang="ts">
import { ref, useId } from 'vue'
import { sendCommand } from '../api/devices'
import { ApiError } from '../api/http'
import { FAULT_LABEL, FAULT_MODES, type Device, type FaultMode } from '../domain/devices'
import RoleGate from './RoleGate.vue'

/**
 * Painel do simulador (IOT-05), só para operador e admin: injeta uma falha na
 * bomba (IOT-08) ou a repara. A telemetria nunca diz que há falha; quem
 * percebe é a IA, pela vibração, a corrente e a temperatura subindo aos poucos.
 * Por isso aqui não há "aguardando confirmação": a API só confirma que mandou.
 */
const props = defineProps<{ device: Device }>()

const uid = useId()
const mode = ref<FaultMode>('rolamento')
const busy = ref<'inject' | 'repair' | null>(null)
const notice = ref<string | null>(null)
const error = ref<string | null>(null)

async function run(action: 'inject' | 'repair') {
  busy.value = action
  notice.value = null
  error.value = null
  try {
    if (action === 'inject') {
      await sendCommand(props.device.id, { command: 'inject_fault', value: mode.value })
      notice.value = `Falha "${FAULT_LABEL[mode.value].toLowerCase()}" injetada. A bomba degrada aos poucos, em uns 6 minutos: acompanhe a vibração, a cor e a saúde prevista.`
    } else {
      await sendCommand(props.device.id, { command: 'repair' })
      notice.value = 'Reparo enviado. A bomba volta ao estado de nova.'
    }
  } catch (err) {
    if (err instanceof ApiError) error.value = err.status === 403 ? 'Seu papel não pode comandar o simulador.' : err.message
    else error.value = 'Não foi possível enviar o comando.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <RoleGate permission="command">
    <div class="fault-control">
      <label class="form-field" :for="`fault-${uid}`">
        Modo de falha
        <select :id="`fault-${uid}`" v-model="mode" :disabled="busy !== null">
          <option v-for="item in FAULT_MODES" :key="item" :value="item">{{ FAULT_LABEL[item] }}</option>
        </select>
      </label>
      <div class="fault-actions">
        <button type="button" class="button button-danger" :disabled="busy !== null" @click="run('inject')">
          <span v-if="busy === 'inject'" class="spinner" aria-hidden="true" />
          Injetar falha
        </button>
        <button type="button" class="button" :disabled="busy !== null" @click="run('repair')">
          <span v-if="busy === 'repair'" class="spinner" aria-hidden="true" />
          Reparar
        </button>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="form-hint" role="status">{{ notice }}</p>
    </div>
  </RoleGate>
</template>

<style scoped>
.fault-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fault-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fault-actions .button {
  flex: 1;
}

.button-danger {
  color: #ffffff;
  border-color: var(--nivel-critico);
  background: var(--nivel-critico);
}

.button-danger:hover:not(:disabled) {
  border-color: var(--critico-ink);
  background: var(--critico-ink);
}
</style>
