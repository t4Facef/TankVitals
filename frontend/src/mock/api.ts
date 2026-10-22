import { ApiError } from '../api/http'
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
import { firstIssue, validateDevice, validateRule } from '../domain/registry'
import { useAuthStore, type Role } from '../stores/auth'
import type { HistoryRange } from '../types'
import { FAULT_MODES, getMockPlant } from './plant'
import { mockRegistry } from './registry'

/**
 * As rotas de leitura, de cadastro e de comando no modo simulado, com a mesma
 * forma das de verdade (BACK-05, BACK-06, IOT-04) e uma pequena espera, para a
 * tela mostrar o "carregando" como vai mostrar com a API. Também barram pelo
 * papel, como a API vai barrar: esconder o botão na tela não basta.
 */

/** Tempo até o "simulador" aplicar o comando: o caminho API → RabbitMQ → MQTT. */
const COMMAND_DELAY_MS = 900

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/** O mesmo que o `require_role` da API (BACK-03): 403 para quem não pode. */
function requireRole(role: Role): void {
  if (!useAuthStore().hasRole(role)) throw new ApiError('Seu papel não permite esta ação.', 403)
}

export async function mockGetDevices(): Promise<Device[]> {
  await wait(120)
  return structuredClone(mockRegistry.devices)
}

export async function mockCreateDevice(input: DeviceInput): Promise<Device> {
  await wait(250)
  requireRole('admin')
  const issues = validateDevice(input, mockRegistry.devices, true)
  if (issues.id?.startsWith('Já existe')) throw new ApiError(issues.id, 409)
  const problem = firstIssue(issues)
  if (problem) throw new ApiError(problem, 422)

  // O que o formulário não manda, a API completa pelo tipo.
  const device: Device = {
    ...structuredClone(input),
    state_field: input.kind === 'actuator' ? 'on' : input.kind === 'equipment' ? 'running' : null,
    commands: input.kind === 'sensor' ? [] : ['on'],
    control: input.kind === 'sensor' ? null : 'manual',
  }
  mockRegistry.devices.push(device)
  getMockPlant().applyRegistry()
  return structuredClone(device)
}

export async function mockUpdateDevice(id: string, update: DeviceUpdate): Promise<Device> {
  await wait(250)
  requireRole('admin')
  const index = mockRegistry.devices.findIndex((d) => d.id === id)
  if (index < 0) throw new ApiError('Dispositivo não encontrado.', 404)
  const current = mockRegistry.devices[index]
  const next: Device = { ...current, ...structuredClone(update) }
  const problem = firstIssue(validateDevice(next, mockRegistry.devices, false))
  if (problem) throw new ApiError(problem, 422)

  mockRegistry.devices[index] = next
  getMockPlant().applyRegistry()
  return structuredClone(next)
}

export async function mockGetRules(): Promise<Rule[]> {
  await wait(100)
  return structuredClone(mockRegistry.rules)
}

export async function mockUpdateRule(id: string, update: RuleUpdate): Promise<Rule> {
  await wait(250)
  requireRole('admin')
  const rule = mockRegistry.rules.find((r) => r.id === id)
  if (!rule) throw new ApiError('Regra não encontrada.', 404)
  const problem = firstIssue(validateRule(update))
  if (problem) throw new ApiError(problem, 422)

  rule.on_below = update.on_below
  rule.off_at = update.off_at
  rule.updated_at = new Date().toISOString()
  rule.updated_by = useAuthStore().username
  getMockPlant().applyRegistry()
  return structuredClone(rule)
}

export async function mockGetHistory(range: HistoryRange, devices?: string[]): Promise<HistoryResponse> {
  await wait(150)
  const plant = getMockPlant()
  plant.catchUp()
  return plant.history(range, devices)
}

export async function mockGetAlerts(status: 'open' | 'all'): Promise<Alert[]> {
  await wait(100)
  return getMockPlant().alerts(status)
}

export async function mockSendCommand(deviceId: string, request: CommandRequest): Promise<CommandAck> {
  await wait(150)
  requireRole('operator')
  const device = mockRegistry.devices.find((d) => d.id === deviceId && d.active)
  if (!device) throw new ApiError('Dispositivo não encontrado.', 404)
  if (!device.commands.includes(request.command)) {
    throw new ApiError(`O dispositivo não aceita o comando "${request.command}".`, 422)
  }
  if (request.command === 'on' && typeof request.value !== 'boolean') {
    throw new ApiError('O comando "on" precisa de um valor verdadeiro ou falso.', 422)
  }
  if (request.command === 'inject_fault' && !FAULT_MODES.some((mode) => mode === request.value)) {
    throw new ApiError('Modo de falha desconhecido.', 422)
  }
  window.setTimeout(() => getMockPlant().command(deviceId, request), COMMAND_DELAY_MS)
  return { id: `mock-cmd-${Date.now()}`, status: 'sent' }
}
