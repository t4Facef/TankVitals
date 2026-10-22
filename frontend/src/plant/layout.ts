/**
 * Onde cada dispositivo do cadastro entra no desenho do tanque, pelo id.
 *
 * O cadastro diz o que existe; este arquivo diz onde cada coisa fica na
 * representação visual da planta. É aqui que a cena 3D (WEB-05) vai guardar a
 * posição de cada item, pelo mesmo id, como o enunciado pede.
 */
export const TANK = {
  id: 'tanque-01',
  level: { device: 'nivel-01', field: 'level_pct' },
  aerator: { device: 'aerador-01', field: 'on' },
  recirculation: { device: 'bomba-rec-01', field: 'running' },
  refill: { device: 'bomba-repo-01', field: 'on' },
} as const

// --- Cena 3D (WEB-05) ---------------------------------------------------------
//
// A posição de cada item fica só aqui, no front, pelo id do cadastro, como o
// enunciado pede. Medidas em metros; y para cima; a câmera olha de frente (+z).
// O tanque fica centrado na origem, com o fundo no chão.

export type Vec3 = [number, number, number]

/** Tanque: 4 m de largura, 2 de fundo e 2 de altura. */
export const TANK_3D = { width: 4, depth: 2, height: 2, sand: 0.12 } as const

/** Que modelo desenhar para cada item. */
export type ModelKind = 'probe' | 'level-sensor' | 'light-sensor' | 'pump' | 'aerator' | 'refill' | 'generic'

export interface Placement {
  model: ModelKind
  /** Ponto de montagem: no chão para equipamentos, na borda do tanque para sondas. */
  position: Vec3
  /** Giro em torno do eixo vertical, em graus. */
  rotationY?: number
  /** Sobe o rótulo, para não encavalar com o do vizinho. */
  labelLift?: number
}

const RIM = TANK_3D.height
const BACK = -TANK_3D.depth / 2 + 0.15

export const SCENE_LAYOUT: Record<string, Placement> = {
  'temp-agua-01': { model: 'probe', position: [-1.05, RIM, BACK] },
  'ph-01': { model: 'probe', position: [-0.5, RIM, BACK], labelLift: 0.36 },
  'nivel-01': { model: 'level-sensor', position: [0.05, RIM, BACK], labelLift: 0.72 },
  'turbidez-01': { model: 'probe', position: [0.55, RIM, BACK] },
  'od-01': { model: 'probe', position: [1.05, RIM, BACK], labelLift: 0.36 },
  'luz-01': { model: 'light-sensor', position: [-2.5, 0, -1.55] },
  'bomba-rec-01': { model: 'pump', position: [3.3, 0, 0.35] },
  'aerador-01': { model: 'aerator', position: [-3, 0, 0.5] },
  'bomba-repo-01': { model: 'refill', position: [-3.2, 0, -0.6] },
}

/**
 * Onde entra o que foi cadastrado pela tela e ainda não tem lugar aqui: sondas
 * novas na borda da frente do tanque, outros itens numa fila no chão, à frente.
 */
export const AUTO_SLOTS = {
  probe: { start: [-1.5, RIM, TANK_3D.depth / 2 - 0.15] as Vec3, step: [0.45, 0, 0] as Vec3 },
  generic: { start: [-3, 0, 2.1] as Vec3, step: [1.1, 0, 0] as Vec3 },
}

/** Peças fixas da planta que não são dispositivos do cadastro. */
export const FIXTURES = {
  filter: { position: [3.18, 0, -0.75] as Vec3 },
}

/**
 * Tubos, sempre de um bocal a outro: `<item>.<bocal>`, onde o item é um id do
 * cadastro, `tank` ou `filter`. Os pontos `via` dão as curvas; o tubo sai e
 * chega no eixo de cada bocal, então não sobra ponta solta.
 *
 * `flow` diz o que corre dentro: a vazão da bomba (partículas mais rápidas com
 * mais vazão) ou o estado de um atuador (corre quando ligado).
 */
export interface PipeSpec {
  id: string
  from: string
  to: string
  via: Vec3[]
  radius: number
  /** Ar (mangueira do aerador) ou água. */
  medium: 'water' | 'air'
  flow: { device: string; field: string; full?: number }
}

export const PIPES: PipeSpec[] = [
  {
    id: 'saida-tanque',
    from: 'tank.outlet',
    to: 'bomba-rec-01.inlet',
    via: [],
    radius: 0.06,
    medium: 'water',
    flow: { device: 'bomba-rec-01', field: 'flow_l_min', full: 50 },
  },
  {
    id: 'bomba-filtro',
    from: 'bomba-rec-01.outlet',
    to: 'filter.inlet',
    via: [
      [3.3, 1.6, 0.35],
      [3.3, 1.6, -0.75],
    ],
    radius: 0.06,
    medium: 'water',
    flow: { device: 'bomba-rec-01', field: 'flow_l_min', full: 50 },
  },
  {
    id: 'filtro-retorno',
    from: 'filter.outlet',
    to: 'tank.return',
    via: [
      [3.06, 2.65, -0.75],
      [1.55, 2.65, -0.75],
    ],
    radius: 0.06,
    medium: 'water',
    flow: { device: 'bomba-rec-01', field: 'flow_l_min', full: 50 },
  },
  {
    id: 'mangueira-ar',
    from: 'aerador-01.outlet',
    to: 'tank.airstone',
    via: [
      [-2.5, 2.45, 0.5],
      [-1.35, 2.45, 0.5],
    ],
    radius: 0.025,
    medium: 'air',
    flow: { device: 'aerador-01', field: 'on' },
  },
  {
    id: 'reposicao',
    from: 'bomba-repo-01.outlet',
    to: 'tank.refill',
    via: [
      [-3.2, 2.6, -0.6],
      [-1.5, 2.6, -0.6],
    ],
    radius: 0.05,
    medium: 'water',
    flow: { device: 'bomba-repo-01', field: 'on' },
  },
]
