import { CurvePath, LineCurve3, type Object3D, QuadraticBezierCurve3, Quaternion, Vector3 } from 'three'
import type { Vec3 } from '../plant/layout'

/**
 * Caminho de um tubo, de bocal a bocal (WEB-05). O tubo sai na direção do
 * bocal, passa pelos pontos `via` do layout e chega no outro bocal pela
 * direção dele; as curvas são arredondadas. Começa e termina exatamente na
 * ponta de cada bocal, então não sobra ponta solta.
 */

/** Quanto o tubo anda reto para fora do bocal antes da primeira curva. */
const LEAD = 0.2
/** Raio das curvas. */
const BEND = 0.14

const UP = new Vector3(0, 1, 0)

/** Ponta e direção (para fora) de um bocal, no mundo. */
export function nozzleFrame(nozzle: Object3D): { tip: Vector3; dir: Vector3 } {
  const tip = nozzle.getWorldPosition(new Vector3())
  const dir = UP.clone().applyQuaternion(nozzle.getWorldQuaternion(new Quaternion())).normalize()
  return { tip, dir }
}

export function routePoints(from: Object3D, to: Object3D, via: Vec3[]): Vector3[] {
  const a = nozzleFrame(from)
  const b = nozzleFrame(to)
  return [
    a.tip,
    a.tip.clone().addScaledVector(a.dir, LEAD),
    ...via.map((point) => new Vector3(...point)),
    b.tip.clone().addScaledVector(b.dir, LEAD),
    b.tip,
  ]
}

/** Linha poligonal com os cantos arredondados, para o TubeGeometry e as partículas. */
export function roundedPath(points: Vector3[], radius = BEND): CurvePath<Vector3> {
  const pts = points.filter((point, i) => i === 0 || point.distanceTo(points[i - 1]) > 1e-4)
  const path = new CurvePath<Vector3>()
  let start = pts[0].clone()

  for (let i = 1; i < pts.length - 1; i += 1) {
    const corner = pts[i]
    const inDir = corner.clone().sub(pts[i - 1])
    const outDir = pts[i + 1].clone().sub(corner)
    const inLength = inDir.length()
    const outLength = outDir.length()
    inDir.normalize()
    outDir.normalize()
    // Ponto no meio de um trecho reto não vira curva.
    if (inDir.dot(outDir) > 0.999) continue

    const r = Math.min(radius, inLength / 2, outLength / 2)
    const enter = corner.clone().addScaledVector(inDir, -r)
    const leave = corner.clone().addScaledVector(outDir, r)
    if (start.distanceTo(enter) > 1e-4) path.add(new LineCurve3(start, enter))
    path.add(new QuadraticBezierCurve3(enter, corner.clone(), leave))
    start = leave
  }

  path.add(new LineCurve3(start, pts[pts.length - 1].clone()))
  return path
}
