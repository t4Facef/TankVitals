import type { AuditEntry, AuditPage, AuditQuery } from '../domain/audit'

/**
 * A auditoria do modo simulado. Nasce com os últimos 3 dias de uso inventados
 * (sempre os mesmos, para a tela não mudar a cada recarga) e recebe o que a
 * pessoa faz no navegador: login, comando, cadastro e regra. Quando a API
 * existir, quem grava é ela (BACK-03, BACK-06, IOT-04, IA-03, BACK-09).
 */

type NewEntry = Omit<AuditEntry, 'id' | 'ts'>

const log: AuditEntry[] = []
let seq = 0

function push(entry: NewEntry, at: Date): void {
  seq += 1
  log.push({ id: `mock-audit-${seq}`, ts: at.toISOString(), ...entry })
}

/** Grava agora. O mock chama no login, nos comandos e nas edições do cadastro. */
export function recordAudit(entry: NewEntry): void {
  push(entry, new Date())
}

export function queryAudit(query: AuditQuery): AuditPage {
  const user = query.user?.trim().toLowerCase()
  const matches = log
    .filter((entry) => (!query.type || entry.type === query.type) && (!user || entry.user === user))
    .reverse()
  const start = (query.page - 1) * query.page_size
  return {
    items: matches.slice(start, start + query.page_size).map((entry) => ({ ...entry })),
    total: matches.length,
    page: query.page,
    page_size: query.page_size,
  }
}

// --- os 3 dias inventados ------------------------------------------------------

/** Sorteio com semente: a mesma auditoria a cada recarga. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const QUESTIONS = [
  'Como está a saúde da bomba de recirculação?',
  'Por que o aerador ligou de madrugada?',
  'Quanto tempo falta para a bomba falhar?',
  'O pH ficou fora da faixa hoje?',
  'Por que o projeto usa RabbitMQ além do Mosquitto?',
]

function seed(): void {
  const random = seeded(2026)
  const now = Date.now()
  const plan: Array<{ day: number; hour: number; entry: NewEntry }> = []

  for (let day = 3; day >= 0; day -= 1) {
    plan.push(
      { day, hour: 7.6, entry: { user: 'operador', type: 'login', action: 'login', target: null, detail: null, ok: true } },
      { day, hour: 8.1, entry: { user: 'visualizador', type: 'login', action: 'login', target: null, detail: null, ok: true } },
      { day, hour: 9.3, entry: { user: 'admin', type: 'login', action: 'login', target: null, detail: null, ok: true } },
      {
        day,
        hour: 10.2,
        entry: { user: 'operador', type: 'command', action: 'command', target: 'bomba-repo-01', detail: 'on = true', ok: true },
      },
      {
        day,
        hour: 10.5,
        entry: { user: 'operador', type: 'command', action: 'command', target: 'bomba-repo-01', detail: 'on = false', ok: true },
      },
      {
        day,
        hour: 14.4,
        entry: {
          user: day % 2 ? 'visualizador' : 'operador',
          type: 'assistant',
          action: 'question',
          target: null,
          detail: QUESTIONS[day % QUESTIONS.length],
          ok: true,
        },
      },
      { day, hour: 16.8, entry: { user: 'operador', type: 'login', action: 'login', target: null, detail: null, ok: true } },
    )
  }

  // Senha errada de vez em quando, e alguém de fora tentando.
  plan.push(
    { day: 3, hour: 7.55, entry: { user: 'operador', type: 'login', action: 'login_failed', target: null, detail: null, ok: false } },
    { day: 2, hour: 22.1, entry: { user: 'root', type: 'login', action: 'login_failed', target: null, detail: null, ok: false } },
    { day: 2, hour: 22.12, entry: { user: 'root', type: 'login', action: 'login_failed', target: null, detail: null, ok: false } },
    { day: 1, hour: 9.28, entry: { user: 'admin', type: 'login', action: 'login_failed', target: null, detail: null, ok: false } },
  )

  // O que só o admin faz: regra, cadastro e os jobs da IA.
  plan.push(
    {
      day: 3,
      hour: 9.6,
      entry: { user: 'admin', type: 'registry', action: 'rule_updated', target: 'aerador-od', detail: 'liga < 5 · desliga ≥ 6,5', ok: true },
    },
    {
      day: 2,
      hour: 11.2,
      entry: {
        user: 'admin',
        type: 'registry',
        action: 'device_updated',
        target: 'turbidez-01',
        detail: 'faixa: normal até 40 NTU, crítico acima de 60',
        ok: true,
      },
    },
    {
      day: 1,
      hour: 10.1,
      entry: {
        user: 'admin',
        type: 'job',
        action: 'datagen_started',
        target: 'job-datagen-7',
        detail: '200 bombas · 180 dias · 30 % falham · semente 42',
        ok: true,
      },
    },
    {
      day: 1,
      hour: 10.9,
      entry: { user: 'admin', type: 'job', action: 'train_started', target: 'job-train-4', detail: 'dataset job-datagen-7', ok: true },
    },
    {
      day: 0,
      hour: 8.4,
      entry: {
        user: 'operador',
        type: 'command',
        action: 'command',
        target: 'bomba-rec-01',
        detail: 'inject_fault = rolamento',
        ok: true,
      },
    },
    {
      day: 0,
      hour: 8.9,
      entry: { user: 'operador', type: 'command', action: 'command', target: 'bomba-rec-01', detail: 'repair', ok: true },
    },
  )

  plan
    .map(({ day, hour, entry }) => {
      const at = new Date(now)
      at.setDate(at.getDate() - day)
      // Alguns minutos de folga para não ficar tudo em horário redondo.
      at.setHours(0, Math.round(hour * 60 + random() * 6), Math.floor(random() * 60), 0)
      return { at, entry }
    })
    .filter(({ at }) => at.getTime() < now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .forEach(({ at, entry }) => push(entry, at))
}

seed()
