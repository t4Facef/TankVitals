import {
  Box3,
  Box3Helper,
  Color,
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
  Raycaster,
  Scene,
  Timer,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { ITEM_LEVEL_TEXT, type ItemLevel } from '../composables/useItemLevel'
import type { Device } from '../domain/devices'
import {
  AUTO_SLOTS,
  FIXTURES,
  PIPES,
  SCENE_LAYOUT,
  TANK,
  TANK_3D,
  type PipeSpec,
  type Placement,
  type Vec3,
} from '../plant/layout'
import { Bubbles, PipeFlow, School, Stream } from './effects'
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
  /** Estado do item: a faixa e a IA, ou "sem dados" (WEB-06). */
  level(device: Device): ItemLevel
  /** Nada chegou nos últimos 10 s: a cena congela e avisa. */
  frozen(): boolean
}

/** O que a cena avisa à tela. */
export interface TwinHandlers {
  /** Clicou num item (ou no rótulo dele); `null` é clique no vazio. */
  onSelect(deviceId: string | null): void
}

interface SceneItem {
  device: Device
  model: ItemModel
  labelEl: HTMLElement
  labelText: string
  level: ItemLevel | null
}

/** Estado e rótulos mudam 4 vezes por segundo (e só se mudaram); o resto anda a cada quadro. */
const STATUS_EVERY_S = 0.25

export class TwinScene {
  private readonly container: HTMLElement
  private readonly source: TwinSource
  private readonly handlers: TwinHandlers
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
  private flows: Array<{ spec: PipeSpec; flow: PipeFlow }> = []
  private bubbles!: Bubbles
  private refillJet!: Stream
  private returnJet!: Stream
  private school!: School
  private hemi!: HemisphereLight
  private sun!: DirectionalLight
  private tankLamp!: PointLight
  /** Quanto é dia, de 0 (noite) a 1, pela luminosidade lida; anda suave. */
  private daylight = 1

  private statusTimer = 0
  /** Sem mensagem há mais de 10 s: nada anda, tudo fica cinza. */
  private frozen = true
  /** Relógio das animações: para quando a cena congela. */
  private t = 0
  /** Nível da água desenhado agora, em %; anda suave até a leitura. */
  private shownLevel: number | null = null
  // Clique e destaque (WEB-08).
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private pressedAt: { x: number; y: number } | null = null
  private hover: PointerEvent | null = null
  private selectedId: string | null = null
  private selection: Box3Helper | null = null

  /** Quem pediu menos movimento no sistema não vê a bomba tremer; a cor e o painel continuam. */
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(container: HTMLElement, source: TwinSource, handlers: TwinHandlers) {
    this.container = container
    this.source = source
    this.handlers = handlers
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
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0.55, 0.9, 0)
    this.controls.enableDamping = true
    this.controls.minDistance = 4
    this.controls.maxDistance = 18
    this.controls.maxPolarAngle = 1.45

    this.scene.add(this.fixed, this.dynamic)
    this.buildFixed()

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointermove', this.onPointerMove)

    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()

    this.renderer.setAnimationLoop((time) => this.frame(time))
  }

  /** Monta os itens do cadastro. Chamado quando o cadastro muda, nunca por mensagem. */
  setDevices(devices: Device[]): void {
    this.clear(this.dynamic)
    this.items.clear()
    this.flows = []
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
      labelEl.classList.add('is-item')
      labelEl.addEventListener('click', () => this.handlers.onSelect(device.id))
      model.labelAnchor.add(new CSS2DObject(labelEl))
      this.items.set(device.id, { device, model, labelEl, labelText: '', level: null })
    }

    this.scene.updateMatrixWorld(true)
    this.buildPipes()
    this.statusTimer = 0
    this.select(this.selectedId)
  }

  /** Destaca um item: caixa em volta na cena e o rótulo marcado. */
  select(deviceId: string | null): void {
    this.selectedId = deviceId
    if (this.selection) {
      this.scene.remove(this.selection)
      this.selection.dispose()
      this.selection = null
    }
    for (const item of this.items.values()) item.labelEl.classList.toggle('is-selected', item.device.id === deviceId)
    const item = deviceId ? this.items.get(deviceId) : undefined
    if (!item) return
    const box = new Box3().setFromObject(item.model.root).expandByScalar(0.06)
    this.selection = new Box3Helper(box, this.palette['--accent'])
    this.scene.add(this.selection)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    this.selection?.dispose()
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

    this.hemi = new HemisphereLight(p['--scene-sky-day'], p['--scene-floor'], 1.1)
    this.sun = new DirectionalLight(0xffffff, 1.6)
    this.sun.position.set(6, 10, 6)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    Object.assign(this.sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 })
    // A luz do aquário: quase nada de dia, acesa à noite.
    this.tankLamp = new PointLight(0xffffff, 0.6, 9)
    this.tankLamp.position.set(0, 3.4, 0.4)
    this.fixed.add(this.hemi, this.sun, this.tankLamp)

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
    // Bolhas e jatos: ficam na cena; aparecem quando o atuador liga.
    this.bubbles = new Bubbles(p['--surface'])
    this.refillJet = new Stream(p['--water-line'])
    this.returnJet = new Stream(p['--water-line'])
    this.fixed.add(this.bubbles.mesh, this.refillJet.column, this.refillJet.drops, this.returnJet.column, this.returnJet.drops)

    this.school = new School([p['--brand-fish'], p['--fish-2']])
    this.school.mesh.visible = false
    this.fixed.add(this.school.mesh)

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
      // O que corre dentro: água azul, ar branco.
      const flow = new PipeFlow(path, spec.radius, spec.medium === 'air' ? this.palette['--surface'] : this.palette['--accent'])
      this.dynamic.add(tube, flow.mesh)
      this.flows.push({ spec, flow })
    }
  }

  // --- loop ---------------------------------------------------------------------------

  private frame(time: number): void {
    this.timer.update(time)
    const dt = Math.min(this.timer.getDelta(), 0.1)

    if (this.hover) {
      // Um raio por quadro no máximo, não um por evento do mouse.
      this.renderer.domElement.style.cursor = this.pick(this.hover) ? 'pointer' : ''
      this.hover = null
    }

    this.statusTimer -= dt
    if (this.statusTimer <= 0) {
      this.statusTimer = STATUS_EVERY_S
      this.refreshStatus()
    }

    // Congelada, a cena não anda: nem água, nem peças. Só a câmera continua livre.
    if (!this.frozen) {
      this.t += dt
      this.updateWater(dt)
      this.updateEnvironment(dt)
      this.updateActuators(dt)
      this.updateFish(dt)
      this.shakePump()
      this.pulseCritical()
    }

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

  /** Cor de cada item e o texto dos rótulos. */
  private refreshStatus(): void {
    this.frozen = this.source.frozen()
    for (const item of this.items.values()) {
      const level = this.frozen ? 'vazio' : this.source.level(item.device)
      if (level !== item.level) {
        item.level = level
        const color = this.levelColor(level)
        for (const material of item.model.status) {
          material.color.copy(color)
          material.emissive.copy(color).multiplyScalar(level === 'vazio' ? 0 : 0.22)
          material.emissiveIntensity = 1
        }
        item.labelEl.className = `twin-label is-item level-${level}`
        item.labelEl.classList.toggle('is-selected', item.device.id === this.selectedId)
      }

      // Lâmpada do atuador: acesa quando ligado.
      const lamp = item.model.lamp
      if (lamp && item.device.state_field) {
        const on = !this.frozen && this.source.state(item.device.id, item.device.state_field) === true
        lamp.emissive.copy(on ? this.palette['--accent'] : this.palette['--night']).multiplyScalar(on ? 1.6 : 0)
        lamp.color.copy(on ? this.palette['--surface'] : this.palette['--metal'])
      }

      // O estado vai escrito no rótulo, não só na cor.
      const text =
        level === 'vazio'
          ? `${shortName(item.device)} · ${ITEM_LEVEL_TEXT.vazio}`
          : level === 'ok'
            ? labelText(item.device, this.source)
            : `${labelText(item.device, this.source)} · ${ITEM_LEVEL_TEXT[level]}`
      if (text !== item.labelText) {
        item.labelText = text
        item.labelEl.textContent = text
      }
    }
  }

  /**
   * O ambiente reage aos dados (WEB-07): a água turva com a turbidez e a cena
   * vai do dia à noite pela luminosidade. Tudo anda suave até a leitura.
   */
  private updateEnvironment(dt: number): void {
    const p = this.palette
    const ease = Math.min(1, dt * 1.5)

    const ntu = this.source.value(TANK.turbidity.device, TANK.turbidity.field)
    if (ntu !== null) {
      // Até 10 NTU é água limpa; perto dos 60 do crítico, barrenta.
      const murk = Math.min(1, Math.max(0, (ntu - 10) / 50))
      const target = p['--water'].clone().lerp(p['--scene-murky'], murk)
      const material = this.tank.waterMaterial
      material.color.lerp(target, ease)
      material.opacity += (0.45 + 0.4 * murk - material.opacity) * ease
    }

    const lux = this.source.value(TANK.light.device, TANK.light.field)
    if (lux !== null) {
      // A raiz deixa o amanhecer e o entardecer visíveis, não só o meio-dia.
      const target = Math.min(1, Math.sqrt(Math.max(0, lux) / 30000))
      this.daylight += (target - this.daylight) * ease
    }
    const day = this.daylight
    ;(this.scene.background as Color).copy(p['--scene-sky-night']).lerp(p['--scene-sky-day'], day)
    this.hemi.intensity = 0.35 + 0.8 * day
    this.sun.intensity = 0.15 + 1.5 * day
    this.tankLamp.intensity = 0.3 + 2.4 * (1 - day)
  }

  /**
   * Atuadores animados quando ligados (WEB-07): partículas nos tubos pela
   * vazão, bolhas do aerador, jatos da reposição e do retorno e as ventoinhas.
   */
  private updateActuators(dt: number): void {
    const src = this.source
    const surfaceY = this.tank.surface.visible ? this.tank.surface.position.y : TANK_3D.sand

    for (const { spec, flow } of this.flows) flow.update(dt, this.rate(spec.flow))

    const aerator = src.state(TANK.aerator.device, TANK.aerator.field) === true
    this.bubbles.update(dt, this.t, aerator, this.tank.emitters.airstone, surfaceY)
    this.refillJet.update(dt, src.state(TANK.refill.device, TANK.refill.field) ? 1 : 0, this.tank.emitters.refill, surfaceY)
    this.returnJet.update(dt, this.rate(TANK.flow), this.tank.emitters.return, surfaceY)

    for (const item of this.items.values()) {
      const fan = item.model.parts.fan
      const field = item.device.state_field
      if (fan && field && src.state(item.device.id, field)) {
        const axis = fan.userData.axis === 'z' ? 'z' : 'x'
        fan.rotation[axis] += dt * 18
      }
    }
  }

  /** Peixes só existem com água desenhada; o ritmo vem do oxigênio dissolvido. */
  private updateFish(dt: number): void {
    const { surface } = this.tank
    this.school.mesh.visible = surface.visible
    if (!surface.visible) return
    const oxygen = this.source.value(TANK.oxygen.device, TANK.oxygen.field)
    this.school.update(dt, this.t, oxygen, TANK_3D.sand, surface.position.y)
  }

  /**
   * Quanto mais vibração, mais a bomba treme (WEB-07). Saudável, perto de
   * 1 mm/s, quase não mexe; perto dos 4,5 mm/s do crítico, treme forte. Só o
   * corpo treme: os bocais ficam presos nos tubos.
   */
  private shakePump(): void {
    const body = this.items.get(TANK.vibration.device)?.model.parts.body
    if (!body) return
    const vibration = this.source.value(TANK.vibration.device, TANK.vibration.field)
    const running = this.source.state(TANK.recirculation.device, TANK.recirculation.field) === true
    const amplitude =
      !running || vibration === null || this.reducedMotion ? 0 : Math.min(1.4, Math.max(0, (vibration - 0.5) / 4)) * 0.03
    // Senos de frequências diferentes: tremor que não se repete a cada quadro.
    const t = this.t
    body.position.set(amplitude * Math.sin(t * 53), amplitude * 0.4 * Math.sin(t * 61 + 2), amplitude * Math.sin(t * 47 + 1))
    body.rotation.z = amplitude * 1.5 * Math.sin(t * 43)
  }

  /** Quanto corre num tubo: a vazão sobre a cheia, ou 1 e 0 pelo estado do atuador. */
  private rate(flow: { device: string; field: string; full?: number }): number {
    if (flow.full) {
      const value = this.source.value(flow.device, flow.field)
      return value === null ? 0 : Math.min(1.2, Math.max(0, value / flow.full))
    }
    return this.source.state(flow.device, flow.field) ? 1 : 0
  }

  /** O crítico pulsa: chama o olho mesmo de longe, no projetor. */
  private pulseCritical(): void {
    const glow = 1 + 0.9 * Math.sin(this.t * 6)
    for (const item of this.items.values()) {
      if (item.level !== 'critico') continue
      for (const material of item.model.status) material.emissiveIntensity = glow
    }
  }

  private levelColor(level: ItemLevel) {
    const p = this.palette
    return { ok: p['--nivel-ok'], atencao: p['--nivel-atencao'], critico: p['--nivel-critico'], vazio: p['--scene-nodata'] }[level]
  }

  // --- clique --------------------------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressedAt = { x: event.clientX, y: event.clientY }
  }

  /** Clique de verdade, não o fim de um arrasto da câmera. */
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pressedAt) return
    const moved = Math.hypot(event.clientX - this.pressedAt.x, event.clientY - this.pressedAt.y)
    this.pressedAt = null
    if (moved <= 6) this.handlers.onSelect(this.pick(event))
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.hover = event
  }

  /** O item do cadastro sob o ponteiro. Tubos e vidro não seguram o clique. */
  private pick(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    for (const hit of this.raycaster.intersectObjects(this.dynamic.children, true)) {
      const id = hit.object.userData.deviceId
      if (typeof id === 'string') return id
    }
    return null
  }

  private fit(): void {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(width, height)
    this.labels.setSize(width, height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    if (!this.framed) this.frameCamera()
  }

  private framed = false

  /**
   * Primeiro enquadramento: a planta inteira (do reservatório à bomba) cabe na
   * largura. Canvas mais estreito, câmera mais longe. Depois disso, quem manda
   * na câmera é a pessoa.
   */
  private frameCamera(): void {
    if (this.container.clientWidth < 2) return
    this.framed = true
    const distance = 8.4 * Math.max(1, 1.35 / this.camera.aspect)
    const direction = new Vector3(5.3, 2.95, 6.9).normalize()
    this.camera.position.copy(this.controls.target).addScaledVector(direction, distance)
    this.controls.update()
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

/** Nome no rótulo: a grandeza nos sensores, o nome do item no resto. */
function shortName(device: Device): string {
  return device.kind === 'sensor' && device.fields[0] ? device.fields[0].short : device.name
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
