import type { MetricThreshold } from '../types'
import type { Alert, Device, DeviceField } from './devices'

/**
 * Como ler a previsão da IA e o que fazer com cada alerta de um equipamento
 * (IA-09). Não é a IA: é o texto que a tela Insights mostra ao lado dela.
 */

/**
 * Faixas da saúde, as mesmas do `healthLevel` (`src/alerts.ts`): abaixo de 70
 * é atenção e abaixo de 40 é crítico. Servem para o gráfico de tendência.
 */
export const HEALTH_RANGE: MetricThreshold = { ok_min: 70, ok_max: null, crit_min: 40, crit_max: null }

/** Teto da vida útil (IA-05). No teto, a IA não vê falha à vista. */
export const RUL_CAP_H = 168

/** Abaixo de 24 h de vida útil a previsão já é crítica (IA-08). */
export const RUL_RANGE: MetricThreshold = { ok_min: 24, ok_max: null, crit_min: 24, crit_max: null }

/** "168 h ou mais", "41 h", "menos de 1 h". */
export function formatRul(hours: number): string {
  if (hours >= RUL_CAP_H) return `${RUL_CAP_H} h ou mais`
  if (hours < 1) return 'menos de 1 h'
  return `${Math.round(hours).toLocaleString('pt-BR')} h`
}

export interface Advice {
  /** O que o alerta ou o sinal quer dizer. */
  meaning: string
  /** O que fazer. */
  action: string
}

/** O alerta da IA (o que vem sem `field`): ele nasce da previsão, não de uma faixa. */
export const AI_ALERT_ADVICE: Advice = {
  meaning:
    'Três previsões seguidas deram saúde abaixo de 40 % ou menos de 24 h de vida útil. A IA espera que o equipamento pare em breve.',
  action:
    'Programe a parada para a revisão ainda hoje e deixe a peça de troca separada. Os sinais das leituras ajudam a achar a causa.',
}

export type RangeSide = 'high' | 'low'

/**
 * O sintoma de cada variável da bomba fora da faixa, com as causas prováveis
 * pelos modos de falha da IA-01: rolamento gasto, filtro entupido,
 * superaquecimento e rotor desbalanceado.
 */
const FIELD_ADVICE: Record<string, Partial<Record<RangeSide, Advice>>> = {
  vibration_mm_s: {
    high: {
      meaning: 'Vibração alta costuma ser rolamento gasto ou rotor desbalanceado.',
      action: 'Escute se há ruído no rolamento e confira a folga do eixo e o balanceamento do rotor.',
    },
  },
  current_a: {
    high: {
      meaning: 'O motor está fazendo mais força que o normal, por atrito no rolamento ou por aquecimento.',
      action: 'Confira se o eixo gira solto e se a ventilação do motor está livre.',
    },
    low: {
      meaning: 'O motor está fazendo menos força: a bomba está puxando pouca água, com o filtro entupido ou a sucção obstruída.',
      action: 'Limpe o filtro e confira a entrada de água.',
    },
  },
  motor_temp_c: {
    high: {
      meaning: 'O motor está esquentando demais, por ventilação ruim, sobrecarga ou rolamento travando.',
      action: 'Libere a ventilação e confira a carga. No nível crítico, desligue a bomba até esfriar.',
    },
  },
  flow_l_min: {
    low: {
      meaning: 'Está passando pouca água pela bomba, e o filtro entupido é a causa mais comum.',
      action: 'Limpe ou troque o elemento do filtro e confira se entra ar ou há obstrução na sucção.',
    },
  },
}

/** De que lado da faixa normal o valor saiu, ou `null` se está dentro. */
export function rangeSide(value: number, range: MetricThreshold | null): RangeSide | null {
  if (!range) return null
  if (range.ok_max !== null && value > range.ok_max) return 'high'
  if (range.ok_min !== null && value < range.ok_min) return 'low'
  return null
}

export function fieldAdvice(field: DeviceField, side: RangeSide): Advice {
  return (
    FIELD_ADVICE[field.key]?.[side] ?? {
      meaning: `${field.label} ${side === 'high' ? 'acima' : 'abaixo'} da faixa normal.`,
      action: 'Confira o equipamento e se a faixa cadastrada em Dispositivos ainda faz sentido.',
    }
  )
}

/** O que um alerta significa e o que fazer; `null` se a variável saiu do cadastro. */
export function explainAlert(alert: Alert, device: Device | undefined): Advice | null {
  if (alert.field === null) return AI_ALERT_ADVICE
  const field = device?.fields.find((f) => f.key === alert.field)
  if (!field) return null
  const side = alert.value === null ? null : rangeSide(alert.value, field.range)
  return fieldAdvice(field, side ?? (field.range?.ok_max != null ? 'high' : 'low'))
}
