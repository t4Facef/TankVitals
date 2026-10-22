import {
  type Color,
  ConeGeometry,
  CylinderGeometry,
  type CurvePath,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Efeitos animados da cena (WEB-07). Toda repetição é um `InstancedMesh`: um
 * objeto só desenha todas as bolhas, gotas ou partículas, com uma chamada de
 * desenho. Cada efeito recebe o `dt` e o que leu do store; nada aqui sabe de
 * WebSocket ou de cadastro.
 */

const m = new Matrix4()
const q = new Quaternion()
const p = new Vector3()
const s = new Vector3()
const ONE = new Vector3(1, 1, 1)
const ZERO = new Vector3(0, 0, 0)

function hideAll(mesh: InstancedMesh): void {
  for (let i = 0; i < mesh.count; i += 1) {
    m.compose(ZERO, q, ZERO)
    mesh.setMatrixAt(i, m)
  }
  mesh.instanceMatrix.needsUpdate = true
}

/** Partículas correndo dentro de um tubo, mais rápidas com mais vazão. */
export class PipeFlow {
  readonly mesh: InstancedMesh
  private readonly path: CurvePath<Vector3>
  private readonly length: number
  private u = 0

  constructor(path: CurvePath<Vector3>, radius: number, color: Color) {
    this.path = path
    this.length = path.getLength()
    const count = Math.max(4, Math.round(this.length * 6))
    this.mesh = new InstancedMesh(
      new SphereGeometry(radius * 0.6, 8, 6),
      new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }),
      count,
    )
    this.mesh.renderOrder = 4
    this.mesh.frustumCulled = false
    this.place()
  }

  /** `rate`: 0 parado, 1 vazão cheia. */
  update(dt: number, rate: number): void {
    this.mesh.visible = rate > 0.02
    if (!this.mesh.visible) return
    // Uns 0,9 m/s na vazão cheia: dá para acompanhar com o olho.
    this.u = (this.u + (dt * rate * 0.9) / this.length) % 1
    this.place()
  }

  private place(): void {
    const n = this.mesh.count
    for (let i = 0; i < n; i += 1) {
      this.path.getPoint((i / n + this.u) % 1, p)
      m.compose(p, q, ONE)
      this.mesh.setMatrixAt(i, m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

interface Bubble {
  y: number
  alive: boolean
  ox: number
  oz: number
  speed: number
  phase: number
  size: number
}

/** Bolhas saindo da pedra porosa do aerador até a superfície. */
export class Bubbles {
  readonly mesh: InstancedMesh
  private readonly bubbles: Bubble[]
  private spawn = 0

  constructor(color: Color, count = 60) {
    this.mesh = new InstancedMesh(
      new SphereGeometry(0.035, 8, 6),
      new MeshStandardMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.1, depthWrite: false }),
      count,
    )
    this.mesh.renderOrder = 4
    this.mesh.frustumCulled = false
    this.bubbles = Array.from({ length: count }, () => ({ y: 0, alive: false, ox: 0, oz: 0, speed: 0, phase: 0, size: 1 }))
    hideAll(this.mesh)
  }

  /** Com o aerador desligado, as que já saíram terminam de subir e nenhuma nova nasce. */
  update(dt: number, time: number, on: boolean, from: Vector3, surfaceY: number): void {
    if (on) this.spawn += dt * 40
    for (const bubble of this.bubbles) {
      if (!bubble.alive && this.spawn >= 1 && surfaceY > from.y + 0.05) {
        this.spawn -= 1
        Object.assign(bubble, {
          alive: true,
          y: from.y,
          ox: (Math.random() - 0.5) * 0.18,
          oz: (Math.random() - 0.5) * 0.18,
          speed: 0.45 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
          size: 0.6 + Math.random() * 0.8,
        })
      }
    }
    this.spawn = Math.min(this.spawn, 1)

    this.bubbles.forEach((bubble, i) => {
      if (bubble.alive) {
        bubble.y += bubble.speed * dt
        if (bubble.y >= surfaceY) bubble.alive = false
      }
      if (!bubble.alive) {
        m.compose(ZERO, q, ZERO)
      } else {
        const wobble = Math.sin(time * 5 + bubble.phase) * 0.03
        p.set(from.x + bubble.ox + wobble, bubble.y, from.z + bubble.oz)
        m.compose(p, q, s.setScalar(bubble.size))
      }
      this.mesh.setMatrixAt(i, m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

/** Jato de água caindo de um bico até a superfície, com gotas descendo. */
export class Stream {
  readonly column: Mesh
  readonly drops: InstancedMesh
  private readonly offsets: number[]
  private u = 0

  constructor(color: Color, drops = 14) {
    this.column = new Mesh(
      new CylinderGeometry(0.028, 0.02, 1, 10, 1, true),
      new MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false }),
    )
    this.column.renderOrder = 4
    this.column.visible = false
    this.drops = new InstancedMesh(
      new SphereGeometry(0.028, 8, 6),
      new MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.1 }),
      drops,
    )
    this.drops.renderOrder = 4
    this.drops.frustumCulled = false
    this.offsets = Array.from({ length: drops }, (_, i) => i / drops + Math.random() * 0.03)
    hideAll(this.drops)
  }

  /** `rate`: 0 fechado, 1 aberto. */
  update(dt: number, rate: number, from: Vector3, surfaceY: number): void {
    const length = from.y - surfaceY
    const on = rate > 0.02 && length > 0.03
    this.column.visible = this.drops.visible = on
    if (!on) return

    this.column.scale.set(0.6 + rate * 0.6, length, 0.6 + rate * 0.6)
    this.column.position.set(from.x, from.y - length / 2, from.z)

    this.u = (this.u + (dt * (1.8 + rate)) / length) % 1
    this.offsets.forEach((offset, i) => {
      const k = (offset + this.u) % 1
      // Cai acelerando, como a água de verdade.
      p.set(from.x + Math.sin(i * 7.3) * 0.02, from.y - k * k * length, from.z + Math.cos(i * 3.1) * 0.02)
      m.compose(p, q, ONE)
      this.drops.setMatrixAt(i, m)
    })
    this.drops.instanceMatrix.needsUpdate = true
  }
}

interface Fish {
  cx: number
  cz: number
  rx: number
  rz: number
  angle: number
  speed: number
  turn: 1 | -1
  depth: number
  size: number
  y: number
}

const Y_AXIS = new Vector3(0, 1, 0)

/**
 * O cardume: um InstancedMesh só desenhando todos os peixes. Nadam em elipses
 * pelo tanque, mais devagar com o oxigênio baixo; com ele muito baixo, sobem
 * para perto da superfície, como peixe de verdade faz quando falta ar.
 */
export class School {
  readonly mesh: InstancedMesh
  private readonly fish: Fish[]
  private pace = 1
  private gasping = false

  constructor(colors: [Color, Color], count = 14) {
    const body = new SphereGeometry(1, 10, 8)
    body.scale(0.17, 0.08, 0.05)
    const tail = new ConeGeometry(0.065, 0.12, 4)
    tail.rotateZ(Math.PI / 2)
    tail.translate(-0.2, 0, 0)
    this.mesh = new InstancedMesh(
      mergeGeometries([body, tail]),
      new MeshStandardMaterial({ roughness: 0.5, flatShading: true }),
      count,
    )
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.fish = Array.from({ length: count }, (_, i) => ({
      cx: -1 + Math.random() * 2,
      cz: -0.15 + Math.random() * 0.4,
      rx: 0.35 + Math.random() * 0.4,
      rz: 0.2 + Math.random() * 0.25,
      angle: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.35,
      turn: i % 3 === 0 ? -1 : 1,
      depth: 0.15 + Math.random() * 0.6,
      size: 0.7 + Math.random() * 0.6,
      y: 0.5,
    }))
    this.fish.forEach((_, i) => this.mesh.setColorAt(i, colors[i % 2]))
  }

  /**
   * `oxygen` em mg/L (`null` mantém o ritmo de antes); `bottom` e `top` são a
   * areia e a superfície da água.
   */
  update(dt: number, time: number, oxygen: number | null, bottom: number, top: number): void {
    if (oxygen !== null) {
      // 6 mg/L ou mais: ritmo normal; 3 ou menos: quase parados.
      const target = Math.min(1, Math.max(0.15, (oxygen - 2.4) / 3.6))
      this.pace += (target - this.pace) * Math.min(1, dt)
      this.gasping = oxygen < 4
    }
    const depthOfWater = top - bottom
    const shallow = depthOfWater < 0.3

    this.fish.forEach((fish, i) => {
      fish.angle += dt * fish.speed * fish.turn * this.pace
      const x = fish.cx + fish.rx * Math.cos(fish.angle)
      const z = fish.cz + fish.rz * Math.sin(fish.angle)
      const vx = -fish.rx * Math.sin(fish.angle) * fish.turn
      const vz = fish.rz * Math.cos(fish.angle) * fish.turn

      const depth = shallow ? 0.2 : this.gasping ? 0.85 + 0.08 * Math.sin(i) : fish.depth
      const targetY = bottom + 0.06 + Math.max(0, depthOfWater - 0.12) * depth
      fish.y += (targetY - fish.y) * Math.min(1, dt * 0.8)

      const wiggle = Math.sin(time * 9 * this.pace + i) * 0.14 * this.pace
      q.setFromAxisAngle(Y_AXIS, Math.atan2(-vz, vx) + wiggle)
      p.set(x, fish.y + Math.sin(time * 1.3 + i) * 0.03, z)
      m.compose(p, q, s.setScalar(fish.size))
      this.mesh.setMatrixAt(i, m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
