<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { demoAccessRequest } from '../api/auth'
import { ApiError } from '../api/http'
import BrandMark from '../components/BrandMark.vue'
import { MOCK } from '../config'
import { MOCK_USERNAMES } from '../mock/auth'
import { ROLE_LABEL, type Role, useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const expiredNotice = computed(() => route.query.expirou === '1')

// Só volta para caminhos do próprio app: um `?redirect=//site-qualquer`
// levaria a pessoa para fora depois do login.
const redirectTarget = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/dashboard'
})

async function submit() {
  if (loading.value) return
  error.value = null
  loading.value = true
  try {
    await auth.login(username.value, password.value)
    await router.replace(redirectTarget.value)
  } catch (err) {
    error.value = loginErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Usuário ou senha inválidos.'
    if (err.status === 429) return 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.'
    return err.message
  }
  // O fetch lança TypeError quando nem chega ao servidor.
  if (err instanceof TypeError) return 'Não foi possível falar com o servidor.'
  return err instanceof Error ? err.message : 'Não foi possível entrar.'
}

function quickLogin(name: string) {
  username.value = name
  password.value = 'mock'
  void submit()
}

// Acesso rápido de demonstração: os botões só aparecem se o servidor estiver
// com DEMO_QUICK_LOGIN ligado. Se a consulta falhar, a tela fica só com o formulário.
const demoRoles = ref<Role[]>([])

onMounted(async () => {
  if (MOCK) return
  try {
    const access = await demoAccessRequest()
    demoRoles.value = access.enabled ? access.roles : []
  } catch {
    demoRoles.value = []
  }
})

async function demoLogin(asRole: Role) {
  if (loading.value) return
  error.value = null
  loading.value = true
  try {
    await auth.demoLogin(asRole)
    await router.replace(redirectTarget.value)
  } catch (err) {
    error.value = loginErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <form class="login-card" @submit.prevent="submit">
      <header class="login-head">
        <BrandMark :size="52" />
        <div>
          <strong>TankVitals</strong>
          <small>Monitoramento do tanque e da bomba</small>
        </div>
        <svg class="login-wave" viewBox="0 0 400 16" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 9 C 50 2, 100 16, 150 9 S 250 2, 300 9 S 375 16, 400 9 V 16 H 0 Z" />
        </svg>
      </header>

      <div class="login-body">
        <h1>Entrar</h1>

        <p v-if="expiredNotice" class="login-notice">Sua sessão expirou. Entre de novo para continuar.</p>

        <label class="field">
          <span>Usuário</span>
          <input v-model="username" name="username" autocomplete="username" required autofocus />
        </label>

        <label class="field">
          <span>Senha</span>
          <input
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <p v-if="error" class="login-error" role="alert">{{ error }}</p>

        <button type="submit" class="login-submit" :disabled="loading">
          {{ loading ? 'Entrando…' : 'Entrar' }}
        </button>
      </div>

      <div v-if="MOCK" class="login-mock">
        <p>Modo simulado: entre com um dos papéis de teste.</p>
        <div class="login-mock-users">
          <button v-for="name in MOCK_USERNAMES" :key="name" type="button" @click="quickLogin(name)">
            {{ name }}
          </button>
        </div>
      </div>

      <div v-if="demoRoles.length" class="login-mock">
        <p>Acesso rápido de demonstração, sem senha:</p>
        <div class="login-mock-users">
          <button
            v-for="demoRole in demoRoles"
            :key="demoRole"
            type="button"
            :disabled="loading"
            @click="demoLogin(demoRole)"
          >
            {{ ROLE_LABEL[demoRole] }}
          </button>
        </div>
      </div>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: 32px 16px;
  place-items: center;
}

.login-card {
  width: min(100%, 410px);
  overflow: hidden;
  border: var(--bw) solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

/* Cabeçalho de água funda; a onda embaixo é a superfície do tanque. */
.login-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 24px 34px;
  color: #ffffff;
  background: var(--night);
}

.login-head strong,
.login-head small {
  display: block;
}

.login-head strong {
  font-size: 1.5rem;
  font-weight: var(--fw-heavy);
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.login-head small {
  color: var(--night-muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.login-wave {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 16px;
}

.login-wave path {
  fill: var(--water);
}

.login-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 24px 22px;
  border-top: 0;
}

.login-body h1 {
  font-size: 1.375rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: var(--fw-heavy);
}

.field input {
  min-height: 44px;
  padding: 0 12px;
  border: var(--bw) solid var(--field);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-size: 0.9375rem;
  font-weight: 600;
  background: var(--surface);
}

.login-notice,
.login-error {
  padding: 10px 12px;
  border: var(--bw) solid;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 600;
}

.login-notice {
  color: var(--atencao-text);
  border-color: var(--atencao-line);
  background: #fcefd0;
}

.login-error {
  color: var(--critico-ink);
  border-color: var(--nivel-critico);
  background: #fbe3e0;
}

.login-submit {
  min-height: 46px;
  border: 0;
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 1rem;
  font-weight: var(--fw-heavy);
  background: var(--night);
}

.login-submit:hover {
  background: var(--night-2);
}

.login-submit:disabled {
  cursor: progress;
  opacity: 0.75;
}

.login-mock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 24px 20px;
  border-top: var(--bw) solid var(--line-soft);
  background: var(--surface-2);
}

.login-mock p {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 600;
}

.login-mock-users {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.login-mock-users button {
  min-height: 40px;
  padding: 0 14px;
  border: var(--bw) solid var(--field);
  border-radius: 999px;
  color: var(--ink);
  font-size: 0.875rem;
  font-weight: var(--fw-heavy);
  background: var(--surface);
}

.login-mock-users button:hover {
  border-color: var(--ink);
}
</style>
