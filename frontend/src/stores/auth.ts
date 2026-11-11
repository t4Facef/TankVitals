import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { demoLoginRequest, loginRequest } from '../api/auth'
import { configureAuth } from '../api/http'
import { MOCK } from '../config'
import { mockLogin } from '../mock/auth'

export type Role = 'viewer' | 'operator' | 'admin'

export const ROLE_LABEL: Record<Role, string> = {
  viewer: 'Visualizador',
  operator: 'Operador',
  admin: 'Administrador',
}

const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 }

/**
 * O que cada ação exige, do enunciado: o visualizador só vê; o operador
 * comanda atuadores e o simulador; o admin também edita o cadastro, gera
 * dados, treina modelos e vê a auditoria. As telas perguntam `can('train')`
 * em vez de comparar papel, para a regra morar num lugar só.
 */
export type Permission = 'command' | 'editRegistry' | 'generateData' | 'train' | 'viewAudit'

const PERMISSION_ROLE: Record<Permission, Role> = {
  command: 'operator',
  editRegistry: 'admin',
  generateData: 'admin',
  train: 'admin',
  viewAudit: 'admin',
}

interface Session {
  token: string
  username: string
  role: Role
  /** Validade do token, em ms (o `exp` do JWT vem em segundos). */
  expiresAt: number
}

/**
 * `sessionStorage`, e não `localStorage`: recarregar a página mantém o login,
 * mas fechar a aba encerra a sessão, e o token não fica guardado no navegador
 * para sempre.
 */
const STORAGE_KEY = 'tankvitals.session'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(restoreSession())
  /** Vira `true` quando a sessão acaba sozinha (token venceu ou a API disse 401). */
  const expired = ref(false)
  let expiryTimer: number | null = null

  const isAuthenticated = computed(() => session.value !== null)
  const username = computed(() => session.value?.username ?? null)
  const role = computed(() => session.value?.role ?? null)

  function hasRole(min: Role): boolean {
    return session.value !== null && ROLE_RANK[session.value.role] >= ROLE_RANK[min]
  }

  function can(permission: Permission): boolean {
    return hasRole(PERMISSION_ROLE[permission])
  }

  async function login(user: string, password: string): Promise<void> {
    const token = MOCK ? mockLogin(user, password) : (await loginRequest(user, password)).access_token
    const decoded = decodeToken(token)
    if (!decoded) throw new Error('A API devolveu um token sem usuário, papel ou validade.')
    startSession(decoded)
  }

  /** Acesso rápido de demonstração: só funciona se o servidor estiver com ele ligado. */
  async function demoLogin(asRole: Role): Promise<void> {
    const decoded = decodeToken((await demoLoginRequest(asRole)).access_token)
    if (!decoded) throw new Error('A API devolveu um token sem usuário, papel ou validade.')
    startSession(decoded)
  }

  function logout(): void {
    endSession(false)
  }

  function expire(): void {
    if (session.value) endSession(true)
  }

  function startSession(next: Session): void {
    session.value = next
    expired.value = false
    writeStorage(next)
    scheduleExpiry(next)
  }

  function endSession(byExpiry: boolean): void {
    session.value = null
    expired.value = byExpiry
    writeStorage(null)
    if (expiryTimer !== null) window.clearTimeout(expiryTimer)
    expiryTimer = null
  }

  function scheduleExpiry(current: Session): void {
    if (expiryTimer !== null) window.clearTimeout(expiryTimer)
    expiryTimer = window.setTimeout(expire, Math.max(current.expiresAt - Date.now(), 0))
  }

  configureAuth({
    getToken: () => session.value?.token ?? null,
    onUnauthorized: expire,
  })
  if (session.value) scheduleExpiry(session.value)

  return { session, expired, isAuthenticated, username, role, hasRole, can, login, demoLogin, logout, expire }
})

/**
 * Lê usuário, papel e validade de dentro do JWT. O front não confere a
 * assinatura (o segredo fica só no servidor): quem garante que o token é
 * válido é a API, a cada chamada.
 */
function decodeToken(token: string): Session | null {
  try {
    const part = token.split('.')[1]
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>

    if (typeof claims.sub !== 'string' || !isRole(claims.role) || typeof claims.exp !== 'number') {
      return null
    }
    return { token, username: claims.sub, role: claims.role, expiresAt: claims.exp * 1000 }
  } catch {
    return null
  }
}

function isRole(value: unknown): value is Role {
  return value === 'viewer' || value === 'operator' || value === 'admin'
}

function restoreSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const decoded = decodeToken(raw)
    return decoded && decoded.expiresAt > Date.now() ? decoded : null
  } catch {
    return null
  }
}

function writeStorage(current: Session | null): void {
  try {
    if (current) sessionStorage.setItem(STORAGE_KEY, current.token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sem storage (aba privada, por exemplo) a sessão só não sobrevive ao recarregar.
  }
}
