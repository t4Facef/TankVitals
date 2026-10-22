import { classify } from '../alerts'
import { variableId, type Alert, type CommandRequest, type HistoryResponse, type Series } from '../domain/devices'
import type { HistoryPoint, HistoryRange, MetricThreshold } from '../types'
import { mockRegistry, SEED_DEVICES } from './registry'

/**
 * Planta simulada do modo mock: o tanque, a bomba e os atuadores, com o
 * relógio combinado (1 s real = 1 min simulado; um dia dura 24 min).
 *
 * Ao nascer, ela simula os últimos 7 dias de uma vez, para o histórico ter o
 * que mostrar; depois avança um passo por segundo, alimentando a telemetria ao
 * vivo. Guarda o histórico em agregados por minuto e o último 1 h segundo a
 * segundo, o suficiente para `GET /api/history` em qualquer período.
 *
 * Não é a física de verdade (essa é a IA-01): é só plausível, com a regra do
 * aerador (IOT-07), a reposição, a recirculação, a falha injetada (IOT-08) e
 * alertas de faixa, para as telas terem o que mostrar antes do backend.
 *
 * Simula os dispositivos do seed. As faixas, o "ativo" e os limites da regra
 * vêm do cadastro de agora (`applyRegistry`), então editar pela tela muda os
 * alertas e o aerador sem recarregar, como o enunciado pede.
 */

interface Channel {
  device: string
  field: string
  decimals: number
  /** Faixa e "ativo" do cadastro de agora: mudam pela tela Dispositivos. */
  range: MetricThreshold | null
  active: boolean
  label: string
  unit: string
  /** Campo de estado (liga/desliga), guardado como 1 e 0. */
  isState: boolean
}

const CHANNELS: Channel[] = SEED_DEVICES.flatMap((device) => [
  ...device.fields.map((field) => ({
    device: device.id,
    field: field.key,
    decimals: field.decimals,
    range: field.range,
    active: device.active,
    label: field.label,
    unit: field.unit,
    isState: false,
  })),
  ...(device.state_field
    ? [
        {
          device: device.id,
          field: device.state_field,
          decimals: 0,
          range: null,
          active: device.active,
          label: device.name,
          unit: '',
          isState: true,
        },
      ]
    : []),
])

const CHANNEL_INDEX = new Map(CHANNELS.map((channel, index) => [variableId(channel.device, channel.field), index]))

function channelIndex(device: string, field: string): number {
  const index = CHANNEL_INDEX.get(variableId(device, field))
  if (index === undefined) throw new Error(`Canal ${device}.${field} fora do cadastro simulado`)
  return index
}

// Índices calculados uma vez: a simulação de 7 dias são ~600 mil passos.
const I = {
  temperature: channelIndex('temp-agua-01', 'temperature_c'),
  ph: channelIndex('ph-01', 'ph'),
  level: channelIndex('nivel-01', 'level_pct'),
  turbidity: channelIndex('turbidez-01', 'turbidity_ntu'),
  oxygen: channelIndex('od-01', 'oxygen_mg_l'),
  light: channelIndex('luz-01', 'light_lux'),
  vibration: channelIndex('bomba-rec-01', 'vibration_mm_s'),
  current: channelIndex('bomba-rec-01', 'current_a'),
  motorTemp: channelIndex('bomba-rec-01', 'motor_temp_c'),
  flow: channelIndex('bomba-rec-01', 'flow_l_min'),
  running: channelIndex('bomba-rec-01', 'running'),
  aerator: channelIndex('aerador-01', 'on'),
  refill: channelIndex('bomba-repo-01', 'on'),
}

const RANGE_S: Record<HistoryRange, number> = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 }
const POINTS_PER_SERIES = 360
const BUCKET_S = 60
const BUCKETS = RANGE_S['7d'] / BUCKET_S
const RAW_S = RANGE_S['1h']
/** Leituras de volta dentro da faixa para fechar um alerta: evita abre-fecha no ruído. */
const ALERT_CLOSE_AFTER = 30
const MAX_ALERTS = 300
/** Passo da simulação do passado distante, em segundos. */
const COARSE_STEP_S = 10

export const FAULT_MODES = ['rolamento', 'entupimento', 'superaquecimento', 'desbalanceamento'] as const
export type FaultMode = (typeof FAULT_MODES)[number]

interface OpenAlertState {
  alert: Alert
  okStreak: number
}

export class MockPlant {
  /** Segundo (época Unix) do último passo simulado. */
  t: number

  private oxygen = 6.2
  private level = 72
  private dirt = 0
  private motorTemp = 48
  private aerator = false
  private refill = false
  private recirculation = true
  private fault: { mode: FaultMode; progress: number } | null = null
  private backfilling = true
  /** Limites da regra do aerador, do cadastro (IOT-07). */
  private aeratorRule = { onBelow: 5, offAt: 6.5 }

  private readonly values = new Float64Array(CHANNELS.length)
  private readonly previous = new Float64Array(CHANNELS.length)

  private readonly raw = CHANNELS.map(() => new Float32Array(RAW_S))
  private readonly bucketMinute = new Float64Array(BUCKETS).fill(-1)
  private readonly bucketSum = CHANNELS.map(() => new Float64Array(BUCKETS))
  private readonly bucketMin = CHANNELS.map(() => new Float32Array(BUCKETS))
  private readonly bucketMax = CHANNELS.map(() => new Float32Array(BUCKETS))
  private readonly bucketCount = new Uint8Array(BUCKETS)
  private readonly bucketOut = CHANNELS.map(() => new Uint8Array(BUCKETS))
  private readonly bucketTurnOns = CHANNELS.map(() => new Uint8Array(BUCKETS))

  private readonly alertLog: Alert[] = []
  private readonly openAlerts = new Map<number, OpenAlertState>()
  private alertSeq = 0

  /** Avisado quando um alerta abre, piora ou fecha (o feed manda pelo "WebSocket"). */
  onAlert: ((alert: Alert) => void) | null = null

  constructor(nowS = Math.floor(Date.now() / 1000)) {
    this.applyRegistry()
    // O que tem mais de 24 h só aparece agregado (pontos de ~28 min no período
    // de 7 dias), então anda de 10 em 10 s: o nascimento cai para ~1/5.
    this.t = nowS - RANGE_S['7d']
    while (this.t < nowS - RANGE_S['24h']) this.advance(this.t + COARSE_STEP_S, COARSE_STEP_S)
    while (this.t < nowS - 1) this.advance(this.t + 1)
    this.backfilling = false
  }

  /**
   * Relê faixas, "ativo" e a regra do cadastro do modo simulado. Desativar um
   * dispositivo fecha os alertas dele sozinho: sem faixa a vigiar, as leituras
   * contam como normais.
   */
  applyRegistry(): void {
    const devices = new Map(mockRegistry.devices.map((device) => [device.id, device]))
    for (const channel of CHANNELS) {
      const device = devices.get(channel.device)
      channel.active = device?.active ?? false
      if (!channel.isState) channel.range = device?.fields.find((f) => f.key === channel.field)?.range ?? null
    }
    const rule = mockRegistry.rules.find((r) => r.actuator === 'aerador-01')
    if (rule) this.aeratorRule = { onBelow: rule.on_below, offAt: rule.off_at }
  }

  /** Avança até `nowS`. Depois de muito tempo parado (aba dormindo), pula o buraco. */
  catchUp(nowS = Math.floor(Date.now() / 1000)): void {
    if (nowS - this.t > RAW_S) this.t = nowS - 1
    while (this.t < nowS) this.advance(this.t + 1)
  }

  /** Últimos valores de um dispositivo, no formato do payload da telemetria. */
  payloadOf(deviceId: string): Record<string, number | boolean> {
    const payload: Record<string, number | boolean> = {}
    CHANNELS.forEach((channel, index) => {
      if (channel.device !== deviceId) return
      const value = this.values[index]
      payload[channel.field] = channel.isState ? value === 1 : round(value, channel.decimals)
    })
    return payload
  }

  /** Saúde e vida útil "previstas", até a IA de verdade (IA-07) existir. */
  insight(): { health: number; rul_h: number; model_version: string } {
    const progress = this.fault?.progress ?? 0
    return {
      health: round(Math.max(2, 95 - 90 * progress ** 1.4 + noise(1)), 1),
      rul_h: this.fault ? round((1 - progress) * 6, 1) : 720,
      model_version: 'mock',
    }
  }

  command(deviceId: string, request: CommandRequest): void {
    if (request.command === 'on' && typeof request.value === 'boolean') {
      if (deviceId === 'aerador-01') this.aerator = request.value
      if (deviceId === 'bomba-repo-01') this.refill = request.value
      if (deviceId === 'bomba-rec-01') this.recirculation = request.value
    } else if (request.command === 'inject_fault' && deviceId === 'bomba-rec-01') {
      const mode = FAULT_MODES.find((m) => m === request.value) ?? 'rolamento'
      this.fault = { mode, progress: 0 }
    } else if (request.command === 'repair' && deviceId === 'bomba-rec-01') {
      this.fault = null
    }
  }

  alerts(status: 'open' | 'all'): Alert[] {
    const list = status === 'open' ? this.alertLog.filter((a) => a.closed_at === null) : this.alertLog
    return list.map((a) => ({ ...a })).reverse()
  }

  history(range: HistoryRange, devices?: string[]): HistoryResponse {
    const span = RANGE_S[range]
    const to = this.t
    const from = to - span + 1
    const step = span / POINTS_PER_SERIES
    const series: Series[] = []

    CHANNELS.forEach((channel, index) => {
      if (devices && !devices.includes(channel.device)) return
      const points: HistoryPoint[] = []
      for (let k = 0; k < POINTS_PER_SERIES; k += 1) {
        const start = from + k * step
        const end = start + step
        const mean = range === '1h' ? this.rawMean(index, start, end) : this.bucketMean(index, start, end)
        if (mean !== null) {
          points.push({ t: new Date(end * 1000).toISOString(), v: round(mean, channel.decimals + 1) })
        }
      }
      series.push({ device: channel.device, field: channel.field, points, stats: this.statsOf(index, channel, from, to) })
    })

    return {
      range,
      from: new Date(from * 1000).toISOString(),
      to: new Date(to * 1000).toISOString(),
      step_s: step,
      series,
    }
  }

  // --- simulação -------------------------------------------------------------

  /** Um passo de `dt` segundos (1 ao vivo; maior só no passado distante). */
  private advance(t: number, dt = 1): void {
    this.t = t
    const hour = (t / 60) % 24
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12))

    // Oxigênio: sobe com a fotossíntese, cai à noite e o aerador empurra para cima.
    this.oxygen += dt * (0.035 * daylight - 0.02 + (this.aerator ? 0.05 : 0) - Math.max(0, this.oxygen - 8) * 0.1)
    // Regra do aerador (IOT-07): liga abaixo de 5 mg/L e desliga a partir de 6,5.
    if (this.oxygen < this.aeratorRule.onBelow) this.aerator = true
    else if (this.oxygen >= this.aeratorRule.offAt) this.aerator = false

    // No passado simulado, um "operador" repõe a água quando ela baixa.
    if (this.backfilling) {
      if (!this.refill && this.level < 62) this.refill = true
      else if (this.refill && this.level >= 76) this.refill = false
    }
    this.level = clamp(this.level + dt * (this.refill ? 0.06 : -0.0012), 0, 100)

    // Sem recirculação a água não passa pelo filtro e turva aos poucos.
    this.dirt = this.recirculation ? Math.max(0, this.dirt - 0.02 * dt) : this.dirt + 0.01 * dt

    const progress = this.fault?.progress ?? 0
    const mode = this.fault?.mode
    if (this.fault && this.recirculation) this.fault.progress = Math.min(1, progress + dt / 360)

    const v = this.values
    v[I.temperature] = 26 + 1.4 * Math.sin((2 * Math.PI * (hour - 9)) / 24) + noise(0.05)
    v[I.ph] = 7.2 + 0.12 * Math.sin(t / 90) + noise(0.02)
    v[I.level] = clamp(this.level + noise(0.2), 0, 100)
    v[I.turbidity] = Math.max(0, 18 + 4 * Math.sin(t / 200) + this.dirt + noise(0.6))
    v[I.oxygen] = Math.max(0, this.oxygen + noise(0.05))
    v[I.light] = Math.max(0, 20 + 32000 * daylight + noise(150))

    const motorTarget = this.recirculation
      ? 47 + 5 * daylight + (mode === 'superaquecimento' ? 35 : 8) * progress
      : 27
    this.motorTemp += (motorTarget - this.motorTemp) * (1 - 0.95 ** dt)
    if (this.recirculation) {
      const vibration =
        1.1 + (mode === 'rolamento' ? 4.5 * progress ** 2 : mode === 'desbalanceamento' ? 3 * progress : 0.3 * progress)
      v[I.vibration] = vibration + noise(0.12)
      v[I.current] = 2.6 + (mode === 'entupimento' ? 1 : 0.3) * progress + noise(0.04)
      v[I.flow] = 49 - (mode === 'entupimento' ? 30 : 5) * progress + noise(0.8)
    } else {
      v[I.vibration] = Math.abs(noise(0.02))
      v[I.current] = 0
      v[I.flow] = 0
    }
    v[I.motorTemp] = this.motorTemp + noise(0.3)

    v[I.aerator] = this.aerator ? 1 : 0
    v[I.refill] = this.refill ? 1 : 0
    v[I.running] = this.recirculation ? 1 : 0

    this.record(t, dt)
  }

  private record(t: number, dt: number): void {
    const minute = Math.floor(t / BUCKET_S)
    const slot = minute % BUCKETS
    if (this.bucketMinute[slot] !== minute) {
      this.bucketMinute[slot] = minute
      this.bucketCount[slot] = 0
      for (let i = 0; i < CHANNELS.length; i += 1) {
        this.bucketSum[i][slot] = 0
        this.bucketMin[i][slot] = Infinity
        this.bucketMax[i][slot] = -Infinity
        this.bucketOut[i][slot] = 0
        this.bucketTurnOns[i][slot] = 0
      }
    }
    this.bucketCount[slot] += dt

    for (let i = 0; i < CHANNELS.length; i += 1) {
      const channel = CHANNELS[i]
      const value = this.values[i]
      this.raw[i][t % RAW_S] = value
      this.bucketSum[i][slot] += value * dt
      if (value < this.bucketMin[i][slot]) this.bucketMin[i][slot] = value
      if (value > this.bucketMax[i][slot]) this.bucketMax[i][slot] = value
      if (channel.isState) {
        if (value === 1 && this.previous[i] === 0) this.bucketTurnOns[i][slot] += 1
      } else {
        const level = channel.active ? classify(value, channel.range) : 'ok'
        if (level !== 'ok') this.bucketOut[i][slot] += dt
        this.trackAlert(i, channel, level, value, t)
      }
      this.previous[i] = value
    }
  }

  private trackAlert(index: number, channel: Channel, level: ReturnType<typeof classify>, value: number, t: number): void {
    const open = this.openAlerts.get(index)
    if (level !== 'ok') {
      if (!open) {
        this.alertSeq += 1
        const alert: Alert = {
          id: `mock-alert-${this.alertSeq}`,
          device: channel.device,
          field: channel.field,
          level,
          message: alertMessage(channel, level),
          value: round(value, channel.decimals),
          opened_at: new Date(t * 1000).toISOString(),
          closed_at: null,
        }
        this.alertLog.push(alert)
        if (this.alertLog.length > MAX_ALERTS) this.alertLog.shift()
        this.openAlerts.set(index, { alert, okStreak: 0 })
        this.notify(alert)
      } else {
        open.okStreak = 0
        if (level === 'critico' && open.alert.level === 'atencao') {
          open.alert.level = 'critico'
          open.alert.message = alertMessage(channel, 'critico')
          open.alert.value = round(value, channel.decimals)
          this.notify(open.alert)
        }
      }
    } else if (open) {
      open.okStreak += 1
      if (open.okStreak >= ALERT_CLOSE_AFTER) {
        open.alert.closed_at = new Date(t * 1000).toISOString()
        this.openAlerts.delete(index)
        this.notify(open.alert)
      }
    }
  }

  private notify(alert: Alert): void {
    if (!this.backfilling) this.onAlert?.({ ...alert })
  }

  // --- leitura do histórico ----------------------------------------------------

  private rawMean(index: number, start: number, end: number): number | null {
    let sum = 0
    let count = 0
    for (let s = Math.ceil(start); s < end && s <= this.t; s += 1) {
      if (this.t - s >= RAW_S) continue
      sum += this.raw[index][s % RAW_S]
      count += 1
    }
    return count ? sum / count : null
  }

  private bucketMean(index: number, start: number, end: number): number | null {
    let sum = 0
    let count = 0
    for (let minute = Math.floor(start / BUCKET_S); minute < Math.ceil(end / BUCKET_S); minute += 1) {
      const slot = minute % BUCKETS
      if (this.bucketMinute[slot] !== minute) continue
      sum += this.bucketSum[index][slot]
      count += this.bucketCount[slot]
    }
    return count ? sum / count : null
  }

  private statsOf(index: number, channel: Channel, from: number, to: number): Series['stats'] {
    let count = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    let out = 0
    let turnOns = 0
    for (let minute = Math.floor(from / BUCKET_S); minute <= Math.floor(to / BUCKET_S); minute += 1) {
      const slot = minute % BUCKETS
      if (this.bucketMinute[slot] !== minute) continue
      count += this.bucketCount[slot]
      sum += this.bucketSum[index][slot]
      min = Math.min(min, this.bucketMin[index][slot])
      max = Math.max(max, this.bucketMax[index][slot])
      out += this.bucketOut[index][slot]
      turnOns += this.bucketTurnOns[index][slot]
    }
    if (!count) return { count: 0 }
    const last = this.values[index]
    if (channel.isState) {
      return { count, on_s: Math.round(sum), turn_ons: turnOns, last }
    }
    const d = channel.decimals
    return {
      count,
      min: round(min, d),
      max: round(max, d),
      avg: round(sum / count, d + 1),
      last: round(last, d),
      ...(channel.range ? { out_of_range_s: out } : {}),
    }
  }
}

function alertMessage(channel: Channel, level: 'atencao' | 'critico'): string {
  return `${channel.label} ${level === 'critico' ? 'em nível crítico' : 'fora da faixa normal'}`
}

let plant: MockPlant | null = null

/** A planta é uma só, criada no primeiro uso (feed ao vivo ou histórico). */
export function getMockPlant(): MockPlant {
  plant ??= new MockPlant()
  return plant
}

function noise(amplitude: number): number {
  return (Math.random() * 2 - 1) * amplitude
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
