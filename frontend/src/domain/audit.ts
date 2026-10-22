/**
 * A auditoria (`GET /api/audit`, BACK-06): quem fez o quê e quando, gravado no
 * PostgreSQL. O enunciado pede logins, comandos e jobs; entram também as
 * mudanças no cadastro e as perguntas ao assistente (BACK-09).
 */
export type AuditType = 'login' | 'command' | 'registry' | 'job' | 'assistant'

export interface AuditEntry {
  id: string
  ts: string
  /** Quem fez: o usuário logado, ou o nome digitado num login recusado. */
  user: string
  type: AuditType
  /**
   * O que aconteceu, como código: `login`, `login_failed`, `command`,
   * `device_created`, `rule_updated`, `datagen_started`... A tela traduz os
   * conhecidos e mostra o código dos outros.
   */
  action: string
  /** Sobre o quê: id do dispositivo, da regra ou do job. */
  target: string | null
  /** Detalhe livre: o valor do comando, os parâmetros do job, a pergunta. */
  detail: string | null
  /** `false` no que foi recusado: senha errada, usuário bloqueado. */
  ok: boolean
}

export interface AuditQuery {
  page: number
  page_size: number
  type?: AuditType
  /** Filtro pelo usuário, exato. */
  user?: string
}

/** Uma página da auditoria, da mais nova para a mais velha. */
export interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
}

export const AUDIT_TYPE_LABEL: Record<AuditType, string> = {
  login: 'Login',
  command: 'Comando',
  registry: 'Cadastro',
  job: 'Job',
  assistant: 'Assistente',
}

const ACTION_LABEL: Record<string, string> = {
  login: 'Entrou',
  login_failed: 'Senha ou usuário errado',
  login_blocked: 'Bloqueado por tentativas',
  command: 'Mandou comando',
  device_created: 'Cadastrou dispositivo',
  device_updated: 'Editou dispositivo',
  device_deactivated: 'Desativou dispositivo',
  rule_updated: 'Mudou os limites da regra',
  datagen_started: 'Disparou geração de dados',
  train_started: 'Disparou treino',
  question: 'Perguntou ao assistente',
}

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}
