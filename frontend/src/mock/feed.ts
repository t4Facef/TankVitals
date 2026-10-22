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
 * Também manda a previsão da IA a cada 5 passos e um aviso a cada alerta que
 * abre, piora ou fecha, como o backend vai fazer pelo WebSocket.
 *
 * Só publica quem está ativo no cadastro e existe na planta: um dispositivo
 * cadastrado pela tela não tem simulação e fica "sem dados", como ficaria um
 * sensor de verdade que ainda não foi ligado.
 */
export function startMockFeed(
  onEnvelope: (msg: Envelope) => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  const plant = getMockPlant()
  let seq = 0

  const send = (device: string, payload: Record<string, unknown>, type: MessageType = 'telemetry') => {
    seq += 1
    onEnvelope({ id: `mock-${seq}`, ts: new Date().toISOString(), type, device, payload })
  }

  plant.onAlert = (alert) => {
    send(alert.device, { ...alert }, 'alert')
  }

  const step = () => {
    plant.catchUp()
    for (const device of mockRegistry.devices) {
      if (!device.active) continue
      const payload = plant.payloadOf(device.id)
      if (Object.keys(payload).length) send(device.id, payload)
    }
    if (plant.t % 5 === 0) send('bomba-rec-01', plant.insight(), 'insight')
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
