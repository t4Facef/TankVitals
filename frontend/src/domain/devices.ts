import type { AlertLevel, HistoryPoint, HistoryRange, MetricThreshold } from '../types'

/**
 * O cadastro de dispositivos (`GET /api/devices`, BACK-05), de onde as telas
 * se montam: nenhuma tela tem lista fixa de grandezas. Um sensor cadastrado
 * pela tela Dispositivos (WEB-03) aparece no dashboard sem mudar código.
 */
export type DeviceKind = 'sensor' | 'equipment' | 'actuator'

/** Quem manda no atuador: a pessoa, pela tela, ou uma regra de negócio. */
export type DeviceControl = 'manual' | 'rule'

/** Uma variável numérica que o dispositivo publica na telemetria. */
export interface DeviceField {
  key: string
  /** Nome completo, para títulos: "Oxigênio dissolvido". */
  label: string
  /** Nome curto, para tabela e seletor: "Oxigênio". */
  short: string
  unit: string
  decimals: number
  /** Faixa normal e crítica; `null` quando a variável não tem alerta. */
  range: MetricThreshold | null
}

export interface Device {
  id: string
  name: string
  kind: DeviceKind
  zone: string
  active: boolean
  fields: DeviceField[]
  /** Campo booleano de estado: "on" num atuador, "running" numa bomba. */
  state_field: string | null
  /** Comandos aceitos em `POST /api/devices/{id}/command`. */
  commands: string[]
  control: DeviceControl | null
}

/** Uma grandeza: um campo de um dispositivo. O id é "od-01.oxygen_mg_l". */
export interface Variable {
  id: string
  device: Device
  field: DeviceField
}

export function variableId(deviceId: string, fieldKey: string): string {
  return `${deviceId}.${fieldKey}`
}

export function variablesOf(devices: Device[]): Variable[] {
  return devices.flatMap((device) =>
    device.fields.map((field) => ({ id: variableId(device.id, field.key), device, field })),
  )
}

/** Dispositivos com estado de liga/desliga: atuadores e equipamentos. */
export function controllables(devices: Device[]): Device[] {
  return devices.filter((device) => device.state_field !== null)
}

// --- Cadastro editável (BACK-06) --------------------------------------------

/**
 * O que a tela Dispositivos manda ao cadastrar (`POST /api/devices`). O estado,
 * os comandos e quem manda no dispositivo a API completa pelo tipo: atuador
 * novo nasce com `on` e controle manual; equipamento, com `running`.
 */
export type DeviceInput = Pick<Device, 'id' | 'name' | 'kind' | 'zone' | 'active' | 'fields'>

/**
 * O que muda ao editar (`PUT /api/devices/{id}`). O id e o tipo não mudam: o id
 * está nos tópicos MQTT e no histórico, e o tipo decide o que o dispositivo
 * publica.
 */
export type DeviceUpdate = Omit<DeviceInput, 'id' | 'kind'>

/**
 * Regra automática com dois limites (IOT-07): liga o atuador quando a variável
 * cai abaixo de `on_below` e desliga quando ela chega a `off_at`. A distância
 * entre os dois evita o liga-desliga a cada leitura (`GET /api/rules`).
 */
export interface Rule {
  id: string
  name: string
  /** A variável vigiada. */
  device: string
  field: string
  /** O atuador que a regra comanda. */
  actuator: string
  on_below: number
  off_at: number
  /** Última edição; `null` enquanto vale o valor do seed. */
  updated_at: string | null
  updated_by: string | null
}

/** O que a aba de regras edita (`PUT /api/rules/{id}`). */
export type RuleUpdate = Pick<Rule, 'on_below' | 'off_at'>

// --- Histórico (`GET /api/history`) ----------------------------------------

export interface SeriesStats {
  /** Leituras cruas no período (não os pontos agregados do gráfico). */
  count: number
  min?: number
  max?: number
  avg?: number
  last?: number
  /** Segundos fora da faixa normal no período, nas variáveis com faixa. */
  out_of_range_s?: number
  /** Nos campos de estado: segundos ligado e quantas vezes ligou. */
  on_s?: number
  turn_ons?: number
}

export interface Series {
  device: string
  field: string
  points: HistoryPoint[]
  stats: SeriesStats
}

export interface HistoryResponse {
  range: HistoryRange
  from: string
  to: string
  /** Largura de cada ponto agregado, em segundos. */
  step_s: number
  series: Series[]
}

// --- Alertas (`GET /api/alerts`) -------------------------------------------

export interface Alert {
  id: string
  device: string
  field: string | null
  level: Exclude<AlertLevel, 'ok'>
  message: string
  value: number | null
  opened_at: string
  /** `null` enquanto o alerta está aberto. */
  closed_at: string | null
}

// --- Comandos (`POST /api/devices/{id}/command`) ----------------------------

export interface CommandRequest {
  command: string
  value?: boolean | string
}

/**
 * Modos de falha do comando `inject_fault` (IOT-08): o valor vai como texto.
 * A bomba degrada aos poucos até quebrar; `repair` volta ao estado de nova.
 */
export const FAULT_MODES = ['rolamento', 'entupimento', 'superaquecimento', 'desbalanceamento'] as const
export type FaultMode = (typeof FAULT_MODES)[number]

export const FAULT_LABEL: Record<FaultMode, string> = {
  rolamento: 'Rolamento gasto',
  entupimento: 'Filtro entupido',
  superaquecimento: 'Superaquecimento',
  desbalanceamento: 'Rotor desbalanceado',
}

/** A API só confirma que mandou; quem confirma o novo estado é a telemetria. */
export interface CommandAck {
  id: string
  status: 'sent'
}
