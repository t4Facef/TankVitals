import { classify } from '../alerts'
import {
  FAULT_MODES,
  variableId,
  type Alert,
  type CommandRequest,
  type FaultMode,
  type HistoryResponse,
  type Series,
} from '../domain/devices'
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

/** A bomba que a "IA" do modo simulado acompanha. */
const PUMP = 'bomba-rec-01'
/** De quanto em quanto tempo sai uma previsão, como a inferência publicaria. */
const INSIGHT_EVERY_S = 5
const INSIGHT_RAW = RAW_S / INSIGHT_EVERY_S
const INSIGHT_FIELDS = ['health', 'rul_h'] as const
/** Teto da vida útil (IA-05): uma bomba saudável não tem hora marcada para falhar. */
const RUL_CAP_H = 168
/** Previsões ruins seguidas que abrem o alerta da IA, e boas que fecham (IA-08). */
const AI_OPEN_AFTER = 3
const AI_CLOSE_AFTER = 10

interface OpenAlertState {
  alert: Alert
  okStreak: number
}

/** Uma previsão da IA simulada, no formato do payload `insight` (com o segundo em que saiu). */
export interface MockInsight {
  device: string
  t: number
  health: number
  rul_h: number
  model_version: string
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

  /** Última previsão, ou `null` com a bomba desativada (sem telemetria, a IA não prevê). */
  lastInsight: MockInsight | null = null
  // A última hora previsão a previsão; o resto, em baldes por minuto, como as leituras.
  private readonly insightTick = new Float64Array(INSIGHT_RAW).fill(-1)
  private readonly insightRaw = INSIGHT_FIELDS.map(() => new Float32Array(INSIGHT_RAW))
  private readonly insightSum = INSIGHT_FIELDS.map(() => new Float64Array(BUCKETS))
  private readonly insightMin = INSIGHT_FIELDS.map(() => new Float32Array(BUCKETS))
  private readonly insightMax = INSIGHT_FIELDS.map(() => new Float32Array(BUCKETS))
  private readonly insightCount = new Uint8Array(BUCKETS)
  private aiAlert: OpenAlertState | null = null
  private badStreak = 0

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
    const { from, to } = this.window(range)
    const series: Series[] = []

    CHANNELS.forEach((channel, index) => {
      if (devices && !devices.includes(channel.device)) return
      const points = this.sample(range, channel.decimals + 1, (start, end) =>
        range === '1h' ? this.rawMean(index, start, end) : this.bucketMean(index, start, end),
      )
      series.push({ device: channel.device, field: channel.field, points, stats: this.statsOf(index, channel, from, to) })
    })

    return this.response(range, series)
  }

  /**
   * Histórico das previsões (`GET /api/insights/history`): o mesmo formato do
   * histórico das leituras, com as séries `health` e `rul_h` da bomba.
   */
  insightHistory(range: HistoryRange, devices?: string[]): HistoryResponse {
    const { from, to } = this.window(range)
    const series: Series[] = []
    if (!devices || devices.includes(PUMP)) {
      INSIGHT_FIELDS.forEach((field, k) => {
        const points = this.sample(range, 1, (start, end) =>
          range === '1h' ? this.insightRawMean(k, start, end) : this.insightBucketMean(k, start, end),
        )
        series.push({ device: PUMP, field, points, stats: this.insightStats(k, from, to) })
      })
    }
    return this.response(range, series)
  }

  private window(range: HistoryRange): { from: number; to: number; step: number } {
    const span = RANGE_S[range]
    return { from: this.t - span + 1, to: this.t, step: span / POINTS_PER_SERIES }
  }

  /** Os ~360 pontos do gráfico: a média de cada fatia do período. */
  private sample(range: HistoryRange, decimals: number, mean: (start: number, end: number) => number | null): HistoryPoint[] {
    const { from, step } = this.window(range)
    const points: HistoryPoint[] = []
    for (let k = 0; k < POINTS_PER_SERIES; k += 1) {
      const start = from + k * step
      const end = start + step
      const value = mean(start, end)
      if (value !== null) points.push({ t: new Date(end * 1000).toISOString(), v: round(value, decimals) })
    }
    return points
  }

  private response(range: HistoryRange, series: Series[]): HistoryResponse {
    const { from, to, step } = this.window(range)
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
    // A reposição enche 15 % por hora simulada (um quarto de ponto por segundo
    // real): ligar e ver a água subir no dashboard e no 3D em poucos segundos.
    this.level = clamp(this.level + dt * (this.refill ? 0.25 : -0.0012), 0, 100)

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
      // Filtro entupido: passa menos água, o motor faz menos força e a corrente cai junto com a vazão (IA-01).
      v[I.current] = 2.6 + (mode === 'entupimento' ? -0.9 : 0.3) * progress + noise(0.04)
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
    if (Math.floor(t / INSIGHT_EVERY_S) > Math.floor((t - dt) / INSIGHT_EVERY_S)) this.predict(t)
  }

  /**
   * Saúde e vida útil "previstas", até a IA de verdade (IA-07) existir. Imita
   * um modelo: não sabe da falha na hora em que ela entra, só percebe a
   * degradação aos poucos, e a vida útil fica no teto de 168 h enquanto a
   * bomba está boa. Com a falha injetada, a bomba passa a atenção em uns
   * 2,5 min e a crítico em uns 3; o alerta da IA abre logo depois.
   */
  private predict(t: number): void {
    if (!CHANNELS[I.vibration].active) {
      this.lastInsight = null
      this.badStreak = 0
      if (this.aiAlert) this.closeAiAlert(t)
      return
    }
    const progress = this.fault?.progress ?? 0
    const health = round(clamp(95 - 90 * progress ** 1.4 + noise(1), 2, 100), 1)
    const rul = round(clamp(190 * (1 - progress) ** 3 + noise(2), 0.5, RUL_CAP_H), 1)
    this.lastInsight = { device: PUMP, t, health, rul_h: rul, model_version: 'mock' }

    const tick = Math.floor(t / INSIGHT_EVERY_S)
    const raw = tick % INSIGHT_RAW
    const slot = Math.floor(t / BUCKET_S) % BUCKETS
    this.insightTick[raw] = tick
    ;[health, rul].forEach((value, k) => {
      this.insightRaw[k][raw] = value
      this.insightSum[k][slot] += value
      this.insightMin[k][slot] = Math.min(this.insightMin[k][slot], value)
      this.insightMax[k][slot] = Math.max(this.insightMax[k][slot], value)
    })
    this.insightCount[slot] += 1

    this.trackAiAlert(health, rul, t)
  }

  /**
   * Alerta da IA com histerese (IA-08): 3 previsões ruins seguidas (saúde
   * abaixo de 40 ou vida útil abaixo de 24 h) abrem, 10 boas fecham. Sem isso
   * o ruído abriria e fecharia o alerta a cada previsão.
   */
  private trackAiAlert(health: number, rul: number, t: number): void {
    if (health < 40 || rul < 24) {
      this.badStreak += 1
      if (this.aiAlert) this.aiAlert.okStreak = 0
      else if (this.badStreak >= AI_OPEN_AFTER) {
        const pt = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
        this.aiAlert = {
          alert: this.openAlert({
            device: PUMP,
            field: null,
            level: 'critico',
            message: `Falha prevista pela IA: saúde em ${pt(health)} % e vida útil de ${pt(rul)} h`,
            value: null,
            opened_at: new Date(t * 1000).toISOString(),
          }),
          okStreak: 0,
        }
      }
      return
    }
    this.badStreak = 0
    if (!this.aiAlert) return
    this.aiAlert.okStreak += 1
    if (this.aiAlert.okStreak >= AI_CLOSE_AFTER) this.closeAiAlert(t)
  }

  private closeAiAlert(t: number): void {
    if (!this.aiAlert) return
    this.aiAlert.alert.closed_at = new Date(t * 1000).toISOString()
    this.notify(this.aiAlert.alert)
    this.aiAlert = null
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
      this.insightCount[slot] = 0
      for (let k = 0; k < INSIGHT_FIELDS.length; k += 1) {
        this.insightSum[k][slot] = 0
        this.insightMin[k][slot] = Infinity
        this.insightMax[k][slot] = -Infinity
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
        const alert = this.openAlert({
          device: channel.device,
          field: channel.field,
          level,
          message: alertMessage(channel, level),
          value: round(value, channel.decimals),
          opened_at: new Date(t * 1000).toISOString(),
        })
        this.openAlerts.set(index, { alert, okStreak: 0 })
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

  private openAlert(fields: Omit<Alert, 'id' | 'closed_at'>): Alert {
    this.alertSeq += 1
    const alert: Alert = { id: `mock-alert-${this.alertSeq}`, ...fields, closed_at: null }
    this.alertLog.push(alert)
    if (this.alertLog.length > MAX_ALERTS) this.alertLog.shift()
    this.notify(alert)
    return alert
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

  private insightRawMean(k: number, start: number, end: number): number | null {
    let sum = 0
    let count = 0
    for (let tick = Math.ceil(start / INSIGHT_EVERY_S); tick * INSIGHT_EVERY_S < end; tick += 1) {
      const raw = tick % INSIGHT_RAW
      if (this.insightTick[raw] !== tick) continue
      sum += this.insightRaw[k][raw]
      count += 1
    }
    return count ? sum / count : null
  }

  private insightBucketMean(k: number, start: number, end: number): number | null {
    let sum = 0
    let count = 0
    for (let minute = Math.floor(start / BUCKET_S); minute < Math.ceil(end / BUCKET_S); minute += 1) {
      const slot = minute % BUCKETS
      if (this.bucketMinute[slot] !== minute) continue
      sum += this.insightSum[k][slot]
      count += this.insightCount[slot]
    }
    return count ? sum / count : null
  }

  private insightStats(k: number, from: number, to: number): Series['stats'] {
    let count = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (let minute = Math.floor(from / BUCKET_S); minute <= Math.floor(to / BUCKET_S); minute += 1) {
      const slot = minute % BUCKETS
      if (this.bucketMinute[slot] !== minute || !this.insightCount[slot]) continue
      count += this.insightCount[slot]
      sum += this.insightSum[k][slot]
      min = Math.min(min, this.insightMin[k][slot])
      max = Math.max(max, this.insightMax[k][slot])
    }
    if (!count) return { count: 0 }
    const last = this.lastInsight ? [this.lastInsight.health, this.lastInsight.rul_h][k] : undefined
    return { count, min: round(min, 1), max: round(max, 1), avg: round(sum / count, 2), last }
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
