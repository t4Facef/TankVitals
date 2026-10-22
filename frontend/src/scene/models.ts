import {
  BoxGeometry,
  type BufferGeometry,
  type Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { TANK_3D, type ModelKind, type Vec3 } from '../plant/layout'
import type { Palette } from './tokens'

/**
 * Os modelos da cena, de poucos polígonos e feitos em código (WEB-05). Cada
 * um diz onde ficam os seus bocais: os tubos saem e chegam exatamente neles.
 *
 * Um bocal é um `Object3D` na ponta, com o +Y local apontando para fora: é
 * por ali que o tubo sai.
 */

export interface ItemModel {
  root: Group
  /** Peças pintadas com a cor do estado: normal, atenção, crítico ou sem dados. */
  status: MeshStandardMaterial[]
  /** Lâmpada que acende com o atuador ligado. */
  lamp: MeshStandardMaterial | null
  nozzles: Record<string, Object3D>
  labelAnchor: Object3D
  /** Peças que a cena anima. */
  parts: {
    /** O que treme com a vibração (sem os bocais, que ficam presos nos tubos). */
    body?: Object3D
    /** Gira com o equipamento ligado. */
    fan?: Object3D
    /** Feixe do sensor de nível até a água. */
    beam?: Mesh
  }
}

export interface TankModel {
  root: Group
  water: Mesh
  waterMaterial: MeshStandardMaterial
  surface: Mesh
  nozzles: Record<string, Object3D>
  /** De onde saem as bolhas e os jatos, em coordenadas do mundo. */
  emitters: { airstone: Vector3; refill: Vector3; return: Vector3 }
}

const UP = new Vector3(0, 1, 0)

function material(color: Color, params: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: color.clone(), roughness: 0.65, metalness: 0.1, flatShading: true, ...params })
}

function add(parent: Object3D, geometry: BufferGeometry, mat: MeshStandardMaterial, position: Vec3): Mesh {
  const mesh = new Mesh(geometry, mat)
  mesh.position.set(...position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

/** Cilindro deitado no eixo x. */
function addAlongX(parent: Object3D, radius: number, length: number, mat: MeshStandardMaterial, position: Vec3): Mesh {
  const mesh = add(parent, new CylinderGeometry(radius, radius, length, 14), mat, position)
  mesh.rotation.z = Math.PI / 2
  return mesh
}

/**
 * Bocal: um toco de cano que entra no equipamento e um flange na ponta. A
 * ponta fica em `tip`; `stub` é quanto o toco entra para dentro, até encostar
 * no corpo.
 */
function addNozzle(
  parent: Object3D,
  nozzles: Record<string, Object3D>,
  name: string,
  tip: Vec3,
  direction: Vec3,
  radius: number,
  stub: number,
  mat: MeshStandardMaterial,
): void {
  const nozzle = new Object3D()
  nozzle.name = name
  nozzle.position.set(...tip)
  nozzle.quaternion.copy(new Quaternion().setFromUnitVectors(UP, new Vector3(...direction).normalize()))
  const pipe = new Mesh(new CylinderGeometry(radius * 1.15, radius * 1.15, stub, 12), mat)
  pipe.position.y = -stub / 2
  const flange = new Mesh(new CylinderGeometry(radius * 1.7, radius * 1.7, 0.03, 14), mat)
  flange.position.y = -0.015
  pipe.castShadow = flange.castShadow = true
  nozzle.add(pipe, flange)
  parent.add(nozzle)
  nozzles[name] = nozzle
}

function anchor(parent: Object3D, position: Vec3): Object3D {
  const point = new Object3D()
  point.position.set(...position)
  parent.add(point)
  return point
}

function statusMaterial(palette: Palette): MeshStandardMaterial {
  return material(palette['--scene-nodata'], { roughness: 0.5 })
}

function lampMaterial(palette: Palette): MeshStandardMaterial {
  return material(palette['--metal'], { roughness: 0.3, flatShading: false })
}

// --- tanque ----------------------------------------------------------------------

export function buildTank(palette: Palette): TankModel {
  const { width: W, depth: D, height: H, sand: S } = TANK_3D
  const root = new Group()
  root.name = 'tank'
  const nozzles: Record<string, Object3D> = {}

  // Vidro: quatro paredes transparentes, sem tampa.
  const glass = material(palette['--surface'], {
    transparent: true,
    opacity: 0.14,
    roughness: 0.05,
    side: DoubleSide,
    depthWrite: false,
    flatShading: false,
  })
  for (const z of [-D / 2, D / 2]) {
    const pane = new Mesh(new PlaneGeometry(W, H), glass)
    pane.position.set(0, H / 2, z)
    pane.renderOrder = 2
    root.add(pane)
  }
  for (const x of [-W / 2, W / 2]) {
    const pane = new Mesh(new PlaneGeometry(D, H), glass)
    pane.position.set(x, H / 2, 0)
    pane.rotation.y = Math.PI / 2
    pane.renderOrder = 2
    root.add(pane)
  }

  // Armação nas 12 arestas.
  const frame = material(palette['--night'], { metalness: 0.3, roughness: 0.4 })
  const f = 0.06
  for (const y of [f / 2, H]) {
    for (const z of [-D / 2, D / 2]) add(root, new BoxGeometry(W + f, f, f), frame, [0, y, z])
    for (const x of [-W / 2, W / 2]) add(root, new BoxGeometry(f, f, D + f), frame, [x, y, 0])
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) add(root, new BoxGeometry(f, H, f), frame, [x, H / 2, z])

  add(root, new BoxGeometry(W - 0.02, S, D - 0.02), material(palette['--sand'], { roughness: 1 }), [0, S / 2, 0])

  // Água: um cubo de lado 1, esticado até o nível lido.
  const waterMaterial = material(palette['--water'], {
    transparent: true,
    opacity: 0.5,
    roughness: 0.15,
    depthWrite: false,
    flatShading: false,
  })
  const water = new Mesh(new BoxGeometry(1, 1, 1), waterMaterial)
  water.scale.set(W - 0.04, 0.001, D - 0.04)
  water.position.y = S
  water.renderOrder = 1
  water.visible = false
  root.add(water)

  const surface = new Mesh(
    new PlaneGeometry(W - 0.04, D - 0.04),
    material(palette['--water-line'], { transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }),
  )
  surface.rotation.x = -Math.PI / 2
  surface.renderOrder = 1
  surface.visible = false
  root.add(surface)

  // Plantas e pedras: repetição, então InstancedMesh (um objeto desenha todas).
  const plantSpots: Array<[number, number, number]> = [
    [-1.75, -0.7, 1.2],
    [-1.6, -0.55, 0.8],
    [-1.8, -0.4, 1],
    [-1.45, -0.75, 0.7],
    [1.7, 0.6, 1.1],
    [1.55, 0.75, 0.8],
    [1.8, 0.4, 0.9],
    [-0.2, 0.75, 0.6],
    [0.1, 0.7, 0.75],
  ]
  const plants = new InstancedMesh(new ConeGeometry(0.07, 0.6, 5), material(palette['--surface']), plantSpots.length)
  const m = new Matrix4()
  plantSpots.forEach(([x, z, scale], i) => {
    m.compose(new Vector3(x, S + 0.3 * scale, z), new Quaternion(), new Vector3(1, scale, 1))
    plants.setMatrixAt(i, m)
    plants.setColorAt(i, i % 2 ? palette['--plant-2'] : palette['--plant'])
  })
  root.add(plants)

  const rockSpots: Vec3[] = [
    [-1.2, S, -0.2],
    [-0.9, S, 0.6],
    [0.7, S, -0.1],
    [1.2, S, 0.55],
    [1.5, S, -0.3],
  ]
  const rocks = new InstancedMesh(new DodecahedronGeometry(0.12, 0), material(palette['--sand-dot']), rockSpots.length)
  rockSpots.forEach((p, i) => {
    m.compose(new Vector3(...p), new Quaternion().setFromAxisAngle(UP, i), new Vector3(1.2, 0.6, 1))
    rocks.setMatrixAt(i, m)
  })
  root.add(rocks)

  // Bocais do tanque: saída no fundo, retorno e reposição por cima, pedra porosa.
  const metal = material(palette['--metal'], { metalness: 0.4, roughness: 0.4 })
  addNozzle(root, nozzles, 'outlet', [W / 2 + 0.12, 0.3, 0.35], [1, 0, 0], 0.06, 0.15, metal)
  addNozzle(root, nozzles, 'return', [1.55, 2.3, -0.75], [0, 1, 0], 0.06, 0.3, metal)
  addNozzle(root, nozzles, 'refill', [-1.5, 2.3, -0.6], [0, 1, 0], 0.05, 0.3, metal)
  add(root, new CylinderGeometry(0.13, 0.13, 0.07, 12), material(palette['--sand-dot']), [-1.35, S + 0.035, 0.5])
  addNozzle(root, nozzles, 'airstone', [-1.35, S + 0.1, 0.5], [0, 1, 0], 0.025, 0.03, metal)

  return {
    root,
    water,
    waterMaterial,
    surface,
    nozzles,
    emitters: {
      airstone: new Vector3(-1.35, S + 0.08, 0.5),
      refill: new Vector3(-1.5, 2.0, -0.6),
      return: new Vector3(1.55, 2.0, -0.75),
    },
  }
}

// --- filtro (peça fixa, não é dispositivo) -------------------------------------------

export function buildFilter(palette: Palette): { root: Group; nozzles: Record<string, Object3D>; labelAnchor: Object3D } {
  const root = new Group()
  root.name = 'filter'
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.4, roughness: 0.4 })
  add(root, new CylinderGeometry(0.3, 0.32, 0.1, 16), metal, [0, 0.05, 0])
  add(root, new CylinderGeometry(0.28, 0.28, 0.9, 16), material(palette['--surface'], { roughness: 0.4 }), [0, 0.55, 0])
  add(root, new CylinderGeometry(0.31, 0.31, 0.12, 16), metal, [0, 1.06, 0])
  addNozzle(root, nozzles, 'inlet', [0.12, 1.15, 0], [0, 1, 0], 0.06, 0.05, metal)
  addNozzle(root, nozzles, 'outlet', [-0.12, 1.15, 0], [0, 1, 0], 0.06, 0.05, metal)
  return { root, nozzles, labelAnchor: anchor(root, [0, 1.45, 0]) }
}

// --- itens do cadastro -------------------------------------------------------------------

export function buildItem(kind: ModelKind, palette: Palette): ItemModel {
  switch (kind) {
    case 'pump':
      return buildPump(palette)
    case 'aerator':
      return buildAerator(palette)
    case 'refill':
      return buildRefill(palette)
    case 'probe':
      return buildProbe(palette)
    case 'level-sensor':
      return buildLevelSensor(palette)
    case 'light-sensor':
      return buildLightSensor(palette)
    default:
      return buildGeneric(palette)
  }
}

/** Bomba de recirculação: voluta com a entrada de frente, motor e ventoinha atrás. */
function buildPump(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)

  add(root, new BoxGeometry(1.05, 0.08, 0.5), metal, [0.3, 0.04, 0])

  const body = new Group()
  root.add(body)
  addAlongX(body, 0.24, 0.22, metal, [0, 0.3, 0])
  addAlongX(body, 0.19, 0.55, status, [0.385, 0.3, 0])
  add(body, new BoxGeometry(0.1, 0.12, 0.36), metal, [0.2, 0.12, 0])
  add(body, new BoxGeometry(0.1, 0.12, 0.36), metal, [0.55, 0.12, 0])
  addAlongX(body, 0.2, 0.06, metal, [0.69, 0.3, 0])
  add(body, new SphereGeometry(0.05, 12, 8), status, [0.385, 0.52, 0])

  // Ventoinha do motor: gira com a bomba ligada.
  const fan = new Group()
  fan.position.set(0.735, 0.3, 0)
  fan.userData.axis = 'x'
  for (let i = 0; i < 3; i += 1) {
    const blade = new Mesh(new BoxGeometry(0.012, 0.32, 0.06), metal)
    blade.rotation.x = (i * Math.PI) / 3
    fan.add(blade)
  }
  body.add(fan)

  addNozzle(root, nozzles, 'inlet', [-0.45, 0.3, 0], [-1, 0, 0], 0.06, 0.34, metal)
  addNozzle(root, nozzles, 'outlet', [0, 0.8, 0], [0, 1, 0], 0.06, 0.26, metal)

  return { root, status: [status], lamp: null, nozzles, labelAnchor: anchor(root, [-0.2, 1.05, 0]), parts: { body, fan } }
}

/** Aerador: o compressor de ar no chão, com a ventoinha de frente e a lâmpada. */
function buildAerator(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)

  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.5, 0.32, 0.4), status, [0, 0.2, 0])
  add(body, new BoxGeometry(0.32, 0.02, 0.26), metal, [0, 0.37, 0])
  add(body, new SphereGeometry(0.045, 12, 8), lamp, [-0.15, 0.39, 0.12])
  for (const x of [-0.18, 0.18]) add(body, new BoxGeometry(0.08, 0.04, 0.34), metal, [x, 0.02, 0])

  const fan = new Group()
  fan.position.set(0.06, 0.2, 0.205)
  fan.userData.axis = 'z'
  for (let i = 0; i < 3; i += 1) {
    const blade = new Mesh(new BoxGeometry(0.012, 0.22, 0.012), metal)
    blade.rotation.z = (i * Math.PI) / 3
    fan.add(blade)
  }
  body.add(fan)

  addNozzle(root, nozzles, 'outlet', [0.3, 0.3, 0], [1, 0, 0], 0.025, 0.05, metal)
  return { root, status: [status], lamp, nozzles, labelAnchor: anchor(root, [0, 0.7, 0]), parts: { body, fan } }
}

/** Reposição: o reservatório e a bombinha em cima dele. */
function buildRefill(palette: Palette): ItemModel {
  const root = new Group()
  const nozzles: Record<string, Object3D> = {}
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)

  add(root, new CylinderGeometry(0.4, 0.4, 1, 18), material(palette['--surface'], { roughness: 0.4 }), [0, 0.5, 0])
  add(root, new CylinderGeometry(0.41, 0.41, 0.06, 18), metal, [0, 0.03, 0])
  add(root, new CylinderGeometry(0.41, 0.41, 0.04, 18), metal, [0, 0.98, 0])
  add(root, new BoxGeometry(0.06, 0.6, 0.01), material(palette['--water']), [0, 0.45, 0.405])

  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.32, 0.12, 0.32), status, [0, 1.06, 0])
  add(body, new SphereGeometry(0.04, 12, 8), lamp, [0.12, 1.14, 0.12])

  addNozzle(root, nozzles, 'outlet', [0, 1.15, 0], [0, 1, 0], 0.05, 0.03, metal)
  return { root, status: [status], lamp, nozzles, labelAnchor: anchor(root, [0, 1.5, 0]), parts: { body } }
}

/** Sonda presa na borda: cabeça colorida pelo estado, haste e ponta dentro da água. */
function buildProbe(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new BoxGeometry(0.12, 0.1, 0.16), metal, [0, 0.02, 0])
  add(root, new CylinderGeometry(0.07, 0.07, 0.15, 12), status, [0, 0.15, 0])
  add(root, new CylinderGeometry(0.022, 0.022, 1.4, 8), metal, [0, -0.62, 0])
  add(root, new SphereGeometry(0.045, 10, 8), status, [0, -1.33, 0])
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 0.42, 0]), parts: {} }
}

/** Sensor de nível ultrassônico: um braço sobre a água e o feixe até a superfície. */
function buildLevelSensor(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new BoxGeometry(0.12, 0.1, 0.16), metal, [0, 0.02, 0])
  add(root, new BoxGeometry(0.05, 0.05, 0.34), metal, [0, 0.12, 0.17])
  add(root, new CylinderGeometry(0.08, 0.08, 0.12, 14), status, [0, 0.08, 0.32])
  const beam = new Mesh(
    new CylinderGeometry(0.012, 0.012, 1, 6),
    material(palette['--accent'], { transparent: true, opacity: 0.5, depthWrite: false }),
  )
  beam.position.set(0, 0, 0.32)
  beam.visible = false
  root.add(beam)
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 0.42, 0.17]), parts: { beam } }
}

/** Sensor de luz: um poste com a cúpula em cima. */
function buildLightSensor(palette: Palette): ItemModel {
  const root = new Group()
  const metal = material(palette['--metal'], { metalness: 0.45, roughness: 0.4 })
  const status = statusMaterial(palette)
  add(root, new CylinderGeometry(0.15, 0.18, 0.06, 12), metal, [0, 0.03, 0])
  add(root, new CylinderGeometry(0.035, 0.04, 2.45, 8), metal, [0, 1.25, 0])
  add(root, new CylinderGeometry(0.13, 0.13, 0.03, 14), metal, [0, 2.48, 0])
  add(root, new SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), status, [0, 2.49, 0])
  return { root, status: [status], lamp: null, nozzles: {}, labelAnchor: anchor(root, [0, 2.8, 0]), parts: {} }
}

/** Item cadastrado pela tela que ainda não tem modelo próprio: uma caixa com lâmpada. */
function buildGeneric(palette: Palette): ItemModel {
  const root = new Group()
  const status = statusMaterial(palette)
  const lamp = lampMaterial(palette)
  const body = new Group()
  root.add(body)
  add(body, new BoxGeometry(0.45, 0.45, 0.45), status, [0, 0.225, 0])
  add(body, new SphereGeometry(0.05, 12, 8), lamp, [0, 0.5, 0])
  return { root, status: [status], lamp, nozzles: {}, labelAnchor: anchor(root, [0, 0.8, 0]), parts: { body } }
}
