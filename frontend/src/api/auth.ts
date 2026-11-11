import type { Role } from '../stores/auth'
import { request } from './http'

/** Resposta do login (BACK-03). */
export interface TokenResponse {
  access_token: string
  token_type: string
}

/**
 * Login na API.
 *
 * Vai como formulário (`x-www-form-urlencoded`), que é o que o
 * `OAuth2PasswordRequestForm` do FastAPI espera. É o mesmo formato do botão
 * "Authorize" do `/docs`, então o login funciona igual nos dois lugares.
 */
export function loginRequest(username: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>(
    '/api/auth/login',
    { method: 'POST', body: new URLSearchParams({ username, password }) },
    { auth: false },
  )
}

/** Se o servidor ligou o acesso rápido de demonstração (`DEMO_QUICK_LOGIN`) e para quais papéis. */
export interface DemoAccess {
  enabled: boolean
  roles: Role[]
}

export function demoAccessRequest(): Promise<DemoAccess> {
  return request<DemoAccess>('/api/auth/demo', {}, { auth: false })
}

/** Entra como o usuário de demonstração do papel, sem senha; o servidor registra na auditoria. */
export function demoLoginRequest(role: Role): Promise<TokenResponse> {
  return request<TokenResponse>(
    '/api/auth/demo-login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) },
    { auth: false },
  )
}

/**
 * Ticket de uso único para abrir o WebSocket (BACK-04).
 *
 * O JWT não vai na URL do WebSocket porque URL acaba em log de proxy e no
 * histórico do navegador. O ticket vale 30 s e uma vez só: se vazar, não
 * serve para nada.
 */
export function requestWsTicket(): Promise<{ ticket: string }> {
  return request<{ ticket: string }>('/api/ws/ticket', { method: 'POST' })
}
