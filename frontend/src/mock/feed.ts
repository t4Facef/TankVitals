import type { Envelope, MessageType } from '../live/envelope'
import type { LiveStatus } from '../live/socket'
import { getMockPlant } from './plant'
import { mockRegistry } from './registry'

/**
 * Telemetria simulada do modo mock, no mesmo formato que o simulador de
 * verdade (IOT-01) vai publicar: uma mensagem por dispositivo a cada passo,
 * com os ids do cadastro. Os valores vêm da planta simulada (`plant.ts`), a
 * mesma que responde o histórico, então o gráfico e o "agora" batem.
 *
 * Também manda cada previsão nova da IA (a planta calcula uma a cada 5 s) e um
 * aviso a cada alerta que abre, piora ou fecha, como o backend vai fazer pelo
 * WebSocket.
 *
 * Só publica quem está ativo no cadastro e existe na planta: um dispositivo
 * cadastrado pela tela não tem simulação e fica "sem dados", como ficaria um
 * sensor de verdade que ainda não foi ligado.
 */
let paused = false

/**
 * Para o "simulador" do modo simulado: as mensagens deixam de chegar, como
 * quando o processo de verdade cai. Serve para ver o dashboard e o 3D
 * avisarem "sem dados" e voltarem sozinhos (WEB-06).
 */
export function setMockFeedPaused(value: boolean): void {
  paused = value
}

export function startMockFeed(
  onEnvelope: (msg: Envelope) => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  const plant = getMockPlant()
  let seq = 0
  let lastInsightT = -1

  const send = (device: string, payload: Record<string, unknown>, type: MessageType = 'telemetry') => {
    seq += 1
    onEnvelope({ id: `mock-${seq}`, ts: new Date().toISOString(), type, device, payload })
  }

  plant.onAlert = (alert) => {
    send(alert.device, { ...alert }, 'alert')
  }

  const step = () => {
    plant.catchUp()
    if (paused) return
    for (const device of mockRegistry.devices) {
      if (!device.active) continue
      const payload = plant.payloadOf(device.id)
      if (Object.keys(payload).length) send(device.id, payload)
    }
    const insight = plant.lastInsight
    if (insight && insight.t !== lastInsightT) {
      lastInsightT = insight.t
      const { health, rul_h, model_version } = insight
      send(insight.device, { health, rul_h, model_version }, 'insight')
    }
  }

  onStatus('simulated')
  step()
  const timer = window.setInterval(step, 1000)

  return () => {
    window.clearInterval(timer)
    plant.onAlert = null
    onStatus('off')
  }
}
