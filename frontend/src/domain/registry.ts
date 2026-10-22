import type { MetricThreshold } from '../types'
import type { Device, DeviceInput, RuleUpdate } from './devices'

/**
 * Regras do cadastro (BACK-06), num lugar só: o formulário da tela
 * Dispositivos confere antes de mandar, e o modo simulado responde 422 com a
 * mesma mensagem. A API de verdade valida de novo; aqui é conforto.
 *
 * Os erros vêm por caminho do campo (`id`, `fields.0.key`, `fields.0.range`),
 * para o formulário mostrar cada um ao lado do que está errado.
 */
export type Issues = Record<string, string>

/** Ids e zonas: minúsculas, números e hífen, como nos tópicos MQTT. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** Chave do campo na telemetria: `oxygen_mg_l`. */
const FIELD_KEY = /^[a-z][a-z0-9_]*$/

export const KIND_LABEL: Record<Device['kind'], string> = {
  sensor: 'Sensor',
  equipment: 'Equipamento',
  actuator: 'Atuador',
}

export function validateDevice(input: DeviceInput, others: Device[], isNew: boolean): Issues {
  const issues: Issues = {}

  if (isNew) {
    if (!input.id) issues.id = 'Informe o id.'
    else if (input.id.length > 40 || !SLUG.test(input.id)) {
      issues.id = 'Use só letras minúsculas, números e hífen, como "od-02".'
    } else if (others.some((device) => device.id === input.id)) {
      issues.id = `Já existe um dispositivo com o id "${input.id}".`
    }
  }

  if (!input.name.trim()) issues.name = 'Informe o nome.'
  else if (input.name.length > 60) issues.name = 'Use no máximo 60 caracteres.'

  if (!input.zone) issues.zone = 'Informe a zona.'
  else if (!SLUG.test(input.zone)) issues.zone = 'Use só letras minúsculas, números e hífen, como "tanque-01".'

  if (input.kind === 'actuator') {
    if (input.fields.length) issues.fields = 'Atuador não publica variáveis, só o estado ligado ou desligado.'
  } else if (!input.fields.length) {
    issues.fields = 'Cadastre pelo menos uma variável.'
  }

  const keys = new Set<string>()
  input.fields.forEach((field, index) => {
    const path = `fields.${index}`
    if (!field.key) issues[`${path}.key`] = 'Informe a chave.'
    else if (!FIELD_KEY.test(field.key)) {
      issues[`${path}.key`] = 'Use minúsculas, números e "_", começando por letra: "oxygen_mg_l".'
    } else if (keys.has(field.key)) issues[`${path}.key`] = 'Chave repetida neste dispositivo.'
    keys.add(field.key)

    if (!field.label.trim()) issues[`${path}.label`] = 'Informe o nome.'
    if (!Number.isInteger(field.decimals) || field.decimals < 0 || field.decimals > 4) {
      issues[`${path}.decimals`] = 'De 0 a 4 casas.'
    }
    const rangeIssue = validateRange(field.range)
    if (rangeIssue) issues[`${path}.range`] = rangeIssue
  })

  return issues
}

/**
 * A faixa vai de fora para dentro: crítico mínimo ≤ normal mínimo < normal
 * máximo ≤ crítico máximo. Um limite crítico só existe junto do normal do
 * mesmo lado, senão não há onde a "atenção" começar.
 */
export function validateRange(range: MetricThreshold | null): string | null {
  if (!range) return null
  const { ok_min, ok_max, crit_min, crit_max } = range
  const values = [ok_min, ok_max, crit_min, crit_max]
  if (values.some((v) => v !== null && !Number.isFinite(v))) return 'Os limites precisam ser números.'
  if (crit_min !== null && ok_min === null) return 'O crítico mínimo precisa do normal mínimo.'
  if (crit_max !== null && ok_max === null) return 'O crítico máximo precisa do normal máximo.'
  if (ok_min !== null && ok_max !== null && ok_min >= ok_max) return 'O normal mínimo precisa ser menor que o máximo.'
  if (crit_min !== null && ok_min !== null && crit_min > ok_min) return 'O crítico mínimo não pode passar do normal mínimo.'
  if (crit_max !== null && ok_max !== null && crit_max < ok_max) return 'O crítico máximo não pode ficar abaixo do normal máximo.'
  return null
}

export function validateRule(update: RuleUpdate): Issues {
  const issues: Issues = {}
  if (!Number.isFinite(update.on_below)) issues.on_below = 'Informe um número.'
  else if (update.on_below < 0) issues.on_below = 'Não pode ser negativo.'
  if (!Number.isFinite(update.off_at)) issues.off_at = 'Informe um número.'
  if (!issues.on_below && !issues.off_at && update.off_at <= update.on_below) {
    issues.off_at = 'Precisa ser maior que o limite de ligar, senão o atuador liga e desliga sem parar.'
  }
  return issues
}

/** Primeira mensagem, para a resposta 422 do modo simulado. */
export function firstIssue(issues: Issues): string | null {
  return Object.values(issues)[0] ?? null
}

/**
 * A faixa em português, para o formulário e a lista: "normal de 24 a 28 °C;
 * crítico abaixo de 22 ou acima de 30 °C".
 */
export function describeRange(range: MetricThreshold | null, unit: string): string {
  if (!range || Object.values(range).every((v) => v === null)) return 'sem faixa: não gera alerta'
  const n = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`
  const { ok_min, ok_max, crit_min, crit_max } = range

  let normal: string
  if (ok_min !== null && ok_max !== null) normal = `normal de ${n(ok_min)} a ${n(ok_max)}`
  else if (ok_min !== null) normal = `normal a partir de ${n(ok_min)}`
  else if (ok_max !== null) normal = `normal até ${n(ok_max)}`
  else normal = 'sem faixa normal'

  const critical = [crit_min !== null ? `abaixo de ${n(crit_min)}` : null, crit_max !== null ? `acima de ${n(crit_max)}` : null]
    .filter(Boolean)
    .join(' ou ')
  return critical ? `${normal}; crítico ${critical}` : normal
}

/** Número digitado na tela, aceitando vírgula: "6,5" → 6.5; vazio → `null`. */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  const value = Number(clean)
  return Number.isFinite(value) ? value : Number.NaN
}

/** O contrário de `parseDecimal`, para pôr um número no campo de texto. */
export function formatDecimal(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',')
}
