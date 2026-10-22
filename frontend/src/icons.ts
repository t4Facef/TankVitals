import {
  Thermometer,
  FlaskConical,
  Waves,
  Microscope,
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  CircleHelp,
  Activity,
  Wifi,
  WifiOff,
  RadioTower,
  ChartNoAxesColumn,
  RefreshCw,
  Droplets,
  Sun,
  Zap,
  Gauge,
  ThermometerSun,
  Cog,
  Power,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import type { DeviceKind } from './domain/devices'
import type { AlertLevel } from './types'

/**
 * Ícones em um lugar só, para os componentes não importarem do lucide direto.
 *
 * Os de nível existem por acessibilidade, não por enfeite: `atencao` e
 * `critico` ficam a ΔE 14,4 em visão normal (abaixo do piso de 15), ou seja,
 * âmbar e vermelho são difíceis de separar só pela cor. A forma do ícone, ao
 * lado do rótulo em texto, é o canal que não depende de enxergar cor.
 */

/**
 * Ícone de cada variável, pelo nome do campo na telemetria. Campo que não está
 * aqui (um sensor novo cadastrado pela tela) usa o medidor genérico.
 */
const FIELD_ICON: Record<string, Component> = {
  temperature_c: Thermometer,
  ph: FlaskConical,
  level_pct: Waves,
  turbidity_ntu: Microscope,
  oxygen_mg_l: Droplets,
  light_lux: Sun,
  vibration_mm_s: Activity,
  current_a: Zap,
  motor_temp_c: ThermometerSun,
  flow_l_min: Gauge,
}

export function fieldIcon(fieldKey: string): Component {
  return FIELD_ICON[fieldKey] ?? Gauge
}

export const LEVEL_ICON: Record<AlertLevel, typeof CircleCheck> = {
  ok: CircleCheck,
  atencao: TriangleAlert,
  critico: OctagonAlert,
}

export const UI_ICON = {
  semDado: CircleHelp,
  aoVivo: Activity,
  online: Wifi,
  offline: WifiOff,
  dispositivo: RadioTower,
  analise: ChartNoAxesColumn,
  atualizando: RefreshCw,
}

/** Ícone do tipo de dispositivo, para a lista do cadastro e o painel do 3D. */
export const KIND_ICON: Record<DeviceKind, Component> = {
  sensor: RadioTower,
  equipment: Cog,
  actuator: Power,
}
