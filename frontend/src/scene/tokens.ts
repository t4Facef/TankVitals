import { Color } from 'three'

/**
 * As cores da cena vêm dos tokens do CSS (src/style.css), nunca de hex solto:
 * assim o 3D muda junto quando a pessoa troca o contraste.
 */
const NAMES = [
  '--water',
  '--water-line',
  '--sand',
  '--sand-dot',
  '--plant',
  '--plant-2',
  '--brand-fish',
  '--fish-2',
  '--metal',
  '--accent',
  '--night',
  '--surface',
  '--nivel-ok',
  '--nivel-atencao',
  '--nivel-critico',
  '--scene-sky-day',
  '--scene-sky-night',
  '--scene-floor',
  '--scene-murky',
  '--scene-nodata',
] as const

export type TokenName = (typeof NAMES)[number]
export type Palette = Record<TokenName, Color>

export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const palette = {} as Palette
  for (const name of NAMES) {
    const raw = style.getPropertyValue(name).trim()
    palette[name] = new Color(raw || '#888888')
  }
  return palette
}
