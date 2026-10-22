import type { Device, Rule } from '../domain/devices'

/**
 * Cadastro inicial do modo simulado: o mesmo que o seed do PostgreSQL
 * (BACK-02) vai criar. Ids, campos e faixas daqui são o contrato com o
 * simulador (IOT-01) e com a IA.
 */
export const SEED_DEVICES: Device[] = [
  {
    id: 'temp-agua-01',
    name: 'Termômetro da água',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      {
        key: 'temperature_c',
        label: 'Temperatura da água',
        short: 'Temperatura',
        unit: '°C',
        decimals: 1,
        range: { ok_min: 24, ok_max: 28, crit_min: 22, crit_max: 30 },
      },
    ],
  },
  {
    id: 'ph-01',
    name: 'Sonda de pH',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      {
        key: 'ph',
        label: 'pH',
        short: 'pH',
        unit: 'pH',
        decimals: 2,
        range: { ok_min: 6.5, ok_max: 8, crit_min: 6, crit_max: 8.5 },
      },
    ],
  },
  {
    id: 'nivel-01',
    name: 'Sensor de nível',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      {
        key: 'level_pct',
        label: 'Nível da água',
        short: 'Nível',
        unit: '%',
        decimals: 1,
        range: { ok_min: 30, ok_max: null, crit_min: 15, crit_max: null },
      },
    ],
  },
  {
    id: 'turbidez-01',
    name: 'Turbidímetro',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      {
        key: 'turbidity_ntu',
        label: 'Turbidez',
        short: 'Turbidez',
        unit: 'NTU',
        decimals: 1,
        range: { ok_min: null, ok_max: 40, crit_min: null, crit_max: 60 },
      },
    ],
  },
  {
    id: 'od-01',
    name: 'Sonda de oxigênio',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      {
        key: 'oxygen_mg_l',
        label: 'Oxigênio dissolvido',
        short: 'Oxigênio',
        unit: 'mg/L',
        decimals: 2,
        range: { ok_min: 5, ok_max: null, crit_min: 3, crit_max: null },
      },
    ],
  },
  {
    id: 'luz-01',
    name: 'Sensor de luz',
    kind: 'sensor',
    zone: 'tanque-01',
    active: true,
    state_field: null,
    commands: [],
    control: null,
    fields: [
      { key: 'light_lux', label: 'Luminosidade', short: 'Luz', unit: 'lux', decimals: 0, range: null },
    ],
  },
  {
    id: 'bomba-rec-01',
    name: 'Bomba de recirculação',
    kind: 'equipment',
    zone: 'tanque-01',
    active: true,
    state_field: 'running',
    commands: ['on', 'inject_fault', 'repair'],
    control: 'manual',
    fields: [
      {
        key: 'vibration_mm_s',
        label: 'Vibração',
        short: 'Vibração',
        unit: 'mm/s',
        decimals: 2,
        range: { ok_min: null, ok_max: 2.8, crit_min: null, crit_max: 4.5 },
      },
      {
        key: 'current_a',
        label: 'Corrente do motor',
        short: 'Corrente',
        unit: 'A',
        decimals: 2,
        range: { ok_min: null, ok_max: 3.2, crit_min: null, crit_max: 3.8 },
      },
      {
        key: 'motor_temp_c',
        label: 'Temperatura do motor',
        short: 'Temp. do motor',
        unit: '°C',
        decimals: 1,
        range: { ok_min: null, ok_max: 65, crit_min: null, crit_max: 80 },
      },
      {
        key: 'flow_l_min',
        label: 'Vazão',
        short: 'Vazão',
        unit: 'L/min',
        decimals: 1,
        range: { ok_min: 40, ok_max: null, crit_min: 30, crit_max: null },
      },
    ],
  },
  {
    id: 'aerador-01',
    name: 'Aerador',
    kind: 'actuator',
    zone: 'tanque-01',
    active: true,
    state_field: 'on',
    commands: ['on'],
    control: 'rule',
    fields: [],
  },
  {
    id: 'bomba-repo-01',
    name: 'Reposição de água',
    kind: 'actuator',
    zone: 'tanque-01',
    active: true,
    state_field: 'on',
    commands: ['on'],
    control: 'manual',
    fields: [],
  },
]

/** A regra do aerador (IOT-07): liga com OD < 5 mg/L e desliga com OD ≥ 6,5. */
export const SEED_RULES: Rule[] = [
  {
    id: 'aerador-od',
    name: 'Aerador pelo oxigênio',
    device: 'od-01',
    field: 'oxygen_mg_l',
    actuator: 'aerador-01',
    on_below: 5,
    off_at: 6.5,
    updated_at: null,
    updated_by: null,
  },
]

/**
 * O cadastro de agora no modo simulado: nasce do seed e muda pela tela
 * Dispositivos. Fica na memória da aba, como a planta: recarregar a página
 * volta ao seed.
 */
export const mockRegistry = {
  devices: structuredClone(SEED_DEVICES),
  rules: structuredClone(SEED_RULES),
}
