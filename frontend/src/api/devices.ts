import { MOCK } from '../config'
import type {
  Alert,
  CommandAck,
  CommandRequest,
  Device,
  DeviceInput,
  DeviceUpdate,
  HistoryResponse,
  Rule,
  RuleUpdate,
} from '../domain/devices'
import {
  mockCreateDevice,
  mockGetAlerts,
  mockGetDevices,
  mockGetHistory,
  mockGetRules,
  mockSendCommand,
  mockUpdateDevice,
  mockUpdateRule,
} from '../mock/api'
import type { HistoryRange } from '../types'
import { request } from './http'

/**
 * Rotas de cadastro, regras, histórico, alertas e comando (BACK-05, BACK-06 e
 * IOT-04). No modo simulado, as mesmas funções respondem pela planta simulada
 * do navegador.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function getDevices(): Promise<Device[]> {
  if (MOCK) return mockGetDevices()
  return request<Device[]>('/api/devices')
}

/** Cadastra um dispositivo (admin). Ele aparece como "sem dados" até publicar. */
export function createDevice(input: DeviceInput): Promise<Device> {
  if (MOCK) return mockCreateDevice(input)
  return request<Device>('/api/devices', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) })
}

/** Edita nome, zona, faixas e o "ativo" de um dispositivo (admin). */
export function updateDevice(id: string, update: DeviceUpdate): Promise<Device> {
  if (MOCK) return mockUpdateDevice(id, update)
  return request<Device>(`/api/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(update),
  })
}

export function getRules(): Promise<Rule[]> {
  if (MOCK) return mockGetRules()
  return request<Rule[]>('/api/rules')
}

/** Muda os limites de uma regra (admin); o serviço `rules` recarrega sozinho. */
export function updateRule(id: string, update: RuleUpdate): Promise<Rule> {
  if (MOCK) return mockUpdateRule(id, update)
  return request<Rule>(`/api/rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(update),
  })
}

/**
 * Histórico agregado de todas as variáveis (ou só das dos dispositivos
 * pedidos), com as estatísticas de cada uma no período.
 */
export function getHistory(range: HistoryRange, devices?: string[]): Promise<HistoryResponse> {
  if (MOCK) return mockGetHistory(range, devices)
  const params = new URLSearchParams({ range })
  devices?.forEach((device) => params.append('device', device))
  return request<HistoryResponse>(`/api/history?${params.toString()}`)
}

export function getAlerts(status: 'open' | 'all' = 'all'): Promise<Alert[]> {
  if (MOCK) return mockGetAlerts(status)
  return request<Alert[]>(`/api/alerts?status=${status}`)
}

/** Manda um comando ao dispositivo; o novo estado chega pela telemetria. */
export function sendCommand(deviceId: string, command: CommandRequest): Promise<CommandAck> {
  if (MOCK) return mockSendCommand(deviceId, command)
  return request<CommandAck>(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(command),
  })
}
