import {
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Timer,
  TubeGeometry,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Device } from '../domain/devices'
import { AUTO_SLOTS, FIXTURES, PIPES, SCENE_LAYOUT, TANK, TANK_3D, type Placement, type Vec3 } from '../plant/layout'
import { buildFilter, buildItem, buildTank, type ItemModel, type TankModel } from './models'
import { roundedPath, routePoints } from './pipes'
import { readPalette, type Palette } from './tokens'

/**
 * O gêmeo digital do tanque (WEB-05), em Three.js puro: o loop de animação
 * fica aqui, explícito. A cena nunca é refeita a cada mensagem: ela lê o store
 * ao vivo de dentro do loop, por `TwinSource`. Só o cadastro (itens que entram
 * e saem) e a troca de contraste reconstroem os objetos.
 */

/** O que a cena lê do app, de dentro do loop. */
export interface TwinSource {
  /** Leitura recente, ou `null` quando não há (ou ficou velha). */
  value(device: string, field: string): number | null
  state(device: string, field: string): boolean | null
}

interface SceneItem {
  device: Device
  model: ItemModel
  labelEl: HTMLElement
  labelText: string
}

/** Os rótulos são texto do DOM: mudam 4 vezes por segundo, e só se o texto mudou. */
const LABEL_EVERY_S = 0.25

export class TwinScene {
  private readonly container: HTMLElement
  private readonly source: TwinSource
  private readonly renderer: WebGLRenderer
  private readonly labels: CSS2DRenderer
  private readonly camera: PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly scene = new Scene()
  private readonly timer = new Timer()
  private readonly resize: ResizeObserver
  private palette: Palette

  /** O que não depende do cadastro: chão, luzes, tanque e filtro. */
  private fixed = new Group()
  /** Itens do cadastro e os tubos entre eles. */
  private dynamic = new Group()
  private tank!: TankModel
  private items = new Map<string, SceneItem>()
  private nozzles = new Map<string, Object3D>()

  private labelTimer = 0
  /** Nível da água desenhado agora, em %; anda suave até a leitura. */
  private shownLevel: number | null = null

  constructor(container: HTMLElement, source: TwinSource) {
    this.container = container
    this.source = source
    this.palette = readPalette()

    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.domElement.classList.add('twin-canvas')
    container.append(this.renderer.domElement)

    // Rótulos em HTML por cima do canvas: texto nítido em qualquer zoom.
    this.labels = new CSS2DRenderer()
    this.labels.domElement.classList.add('twin-labels')
    container.append(this.labels.domElement)

    this.camera = new PerspectiveCamera(38, 1, 0.1, 100)
    this.camera.position.set(5.3, 3.9, 6.9)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0.15, 0.95, 0)
    this.controls.enableDamping = true
    this.controls.minDistance = 4
    this.controls.maxDistance = 18
    this.controls.maxPolarAngle = 1.45

    this.scene.add(this.fixed, this.dynamic)
    this.buildFixed()

    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()

    this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  /** Monta os itens do cadastro. Chamado quando o cadastro muda, nunca por mensagem. */
  setDevices(devices: Device[]): void {
    this.clear(this.dynamic)
    this.items.clear()
    for (const key of [...this.nozzles.keys()]) {
      if (!key.startsWith('tank.') && !key.startsWith('filter.')) this.nozzles.delete(key)
    }

    const used = { probe: 0, generic: 0 }
    for (const device of devices) {
      const placement = SCENE_LAYOUT[device.id] ?? autoPlacement(device, used)
      const model = buildItem(placement.model, this.palette)
      model.root.position.set(...placement.position)
      model.root.rotation.y = ((placement.rotationY ?? 0) * Math.PI) / 180
      model.labelAnchor.position.y += placement.labelLift ?? 0
      model.root.traverse((object) => {
        object.userData.deviceId = device.id
      })
      this.dynamic.add(model.root)
      for (const [name, nozzle] of Object.entries(model.nozzles)) this.nozzles.set(`${device.id}.${name}`, nozzle)

      const labelEl = makeLabel()
      model.labelAnchor.add(new CSS2DObject(labelEl))
      this.items.set(device.id, { device, model, labelEl, labelText: '' })
    }

    this.scene.updateMatrixWorld(true)
    this.buildPipes()
    this.labelTimer = 0
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resize.disconnect()
    this.controls.dispose()
    this.clear(this.dynamic)
    this.clear(this.fixed)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  // --- montagem ---------------------------------------------------------------------

  private buildFixed(): void {
    const p = this.palette
    this.scene.background = p['--scene-sky-day'].clone()

    const hemi = new HemisphereLight(p['--scene-sky-day'], p['--scene-floor'], 1.1)
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.set(6, 10, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 })
    const lamp = new PointLight(0xffffff, 0.6, 9)
    lamp.position.set(0, 3.4, 0.4)
    this.fixed.add(hemi, sun, lamp)

    const floor = new Mesh(
      new PlaneGeometry(30, 30),
      new MeshStandardMaterial({ color: p['--scene-floor'], roughness: 1, side: DoubleSide }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    const grid = new GridHelper(30, 30, p['--metal'], p['--metal'])
    grid.position.y = 0.002
    for (const material of [grid.material].flat()) Object.assign(material, { transparent: true, opacity: 0.18 })
    this.fixed.add(floor, grid)

    this.tank = buildTank(p)
    this.fixed.add(this.tank.root)
    for (const [name, nozzle] of Object.entries(this.tank.nozzles)) this.nozzles.set(`tank.${name}`, nozzle)

    const filter = buildFilter(p)
    filter.root.position.set(...FIXTURES.filter.position)
    this.fixed.add(filter.root)
    for (const [name, nozzle] of Object.entries(filter.nozzles)) this.nozzles.set(`filter.${name}`, nozzle)
    const filterLabel = makeLabel()
    filterLabel.classList.add('is-fixture')
    filterLabel.textContent = 'Filtro'
    filter.labelAnchor.add(new CSS2DObject(filterLabel))

    const tankLabel = makeLabel()
    tankLabel.classList.add('is-fixture')
    tankLabel.textContent = TANK.id
    const tankAnchor = new Group()
    tankAnchor.position.set(0, 0.05, TANK_3D.depth / 2 + 0.25)
    tankAnchor.add(new CSS2DObject(tankLabel))
    this.fixed.add(tankAnchor)

    this.scene.updateMatrixWorld(true)
  }

  /** Só monta o tubo com os dois bocais na cena: item desativado leva o tubo junto. */
  private buildPipes(): void {
    const water = new MeshStandardMaterial({
      color: this.palette['--surface'],
      transparent: true,
      opacity: 0.42,
      roughness: 0.2,
      depthWrite: false,
    })
    const air = water.clone()
    air.opacity = 0.6

    for (const spec of PIPES) {
      const from = this.nozzles.get(spec.from)
      const to = this.nozzles.get(spec.to)
      if (!from || !to) continue
      const path = roundedPath(routePoints(from, to, spec.via))
      const length = path.getLength()
      const tube = new Mesh(
        new TubeGeometry(path, Math.ceil(length * 28), spec.radius, 10, false),
        spec.medium === 'air' ? air : water,
      )
      tube.renderOrder = 3
      tube.userData.pipe = spec.id
      this.dynamic.add(tube)
    }
  }

  // --- loop ---------------------------------------------------------------------------

  private frame(time: number): void {
    this.timer.update(time)
    const dt = Math.min(this.timer.getDelta(), 0.1)

    this.labelTimer -= dt
    if (this.labelTimer <= 0) {
      this.labelTimer = LABEL_EVERY_S
      this.refreshLabels()
    }
    this.updateWater(dt)

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }

  /** A água vai até o nível lido, sem pular: anda uma fração do caminho por quadro. */
  private updateWater(dt: number): void {
    const level = this.source.value(TANK.level.device, TANK.level.field)
    if (level !== null) {
      const target = Math.min(100, Math.max(0, level))
      this.shownLevel = this.shownLevel === null ? target : this.shownLevel + (target - this.shownLevel) * Math.min(1, dt * 2)
    }
    const { water, surface } = this.tank
    if (this.shownLevel === null) {
      water.visible = surface.visible = false
      return
    }
    const inner = TANK_3D.height - TANK_3D.sand - 0.08
    const height = Math.max(0.001, (this.shownLevel / 100) * inner)
    water.visible = surface.visible = true
    water.scale.y = height
    water.position.y = TANK_3D.sand + height / 2
    surface.position.y = TANK_3D.sand + height + 0.002

    // O feixe do sensor de nível vai até a superfície.
    const beam = this.items.get(TANK.level.device)?.model.parts.beam
    if (beam) {
      const top = beam.parent!.position.y + 0.02
      const length = Math.max(0.02, top - surface.position.y)
      beam.visible = true
      beam.scale.y = length
      beam.position.y = 0.02 - length / 2
    }
  }

  private refreshLabels(): void {
    for (const item of this.items.values()) {
      const text = labelText(item.device, this.source)
      if (text !== item.labelText) {
        item.labelText = text
        item.labelEl.textContent = text
      }
    }
  }

  private fit(): void {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height)
    this.labels.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Tira tudo de um grupo e devolve a memória de vídeo. */
  private clear(group: Group): void {
    group.traverse((object) => {
      const mesh = object as Mesh
      mesh.geometry?.dispose()
      for (const material of [mesh.material ?? []].flat()) material.dispose()
      if (object instanceof CSS2DObject) object.element.remove()
    })
    group.clear()
  }
}

function makeLabel(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'twin-label'
  // A lista de itens ao lado da cena é o caminho acessível; o rótulo é visual.
  el.setAttribute('aria-hidden', 'true')
  return el
}

/** "pH 7,21", "Aerador · ligado", "Bomba de recirculação · 1,21 mm/s". */
function labelText(device: Device, source: TwinSource): string {
  const field = device.fields[0]
  if (field) {
    const v = source.value(device.id, field.key)
    const n = v === null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: field.decimals, maximumFractionDigits: field.decimals })
    const unit = field.unit && field.unit !== field.short ? ` ${field.unit}` : ''
    return device.kind === 'sensor' ? `${field.short} ${n}${unit}` : `${device.name} · ${n}${unit}`
  }
  if (device.state_field) {
    const on = source.state(device.id, device.state_field)
    return `${device.name} · ${on === null ? 'sem dados' : on ? 'ligado' : 'desligado'}`
  }
  return device.name
}

/** Lugar para o que foi cadastrado pela tela e não está no layout. */
function autoPlacement(device: Device, used: { probe: number; generic: number }): Placement {
  const slot = device.kind === 'sensor' ? 'probe' : 'generic'
  const { start, step } = AUTO_SLOTS[slot]
  const index = used[slot]++
  const position = start.map((v, axis) => v + step[axis] * index) as Vec3
  return { model: slot, position }
}
