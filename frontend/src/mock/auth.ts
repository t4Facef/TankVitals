import { ApiError } from '../api/http'
import type { Role } from '../stores/auth'
import { recordAudit } from './audit'

/**
 * Login simulado do modo mock.
 *
 * Só existe no navegador, para a casca andar antes da BACK-03. Os três
 * usuários cobrem os três papéis; qualquer senha não vazia entra. O token tem
 * o mesmo formato de um JWT (cabeçalho.dados.assinatura), então o resto do app
 * lê usuário, papel e validade do mesmo jeito que vai ler o token de verdade.
 */
const MOCK_USERS: Record<string, Role> = {
  visualizador: 'viewer',
  operador: 'operator',
  admin: 'admin',
}

export const MOCK_USERNAMES = Object.keys(MOCK_USERS)

const SESSION_MINUTES = 30

export function mockLogin(username: string, password: string): string {
  const name = username.trim().toLowerCase()
  const role = MOCK_USERS[name]
  // Todo login vai para a auditoria, certo ou errado (BACK-03).
  const ok = Boolean(role && password)
  recordAudit({ user: name, type: 'login', action: ok ? 'login' : 'login_failed', target: null, detail: null, ok })
  if (!role || !password) throw new ApiError('Usuário ou senha inválidos.', 401)

  const claims = {
    sub: name,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
  }
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.mock`
}

function base64url(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
