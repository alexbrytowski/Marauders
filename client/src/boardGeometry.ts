import type { Hex } from './game'

export const hexSize = 17
export const point = (h: Hex) => ({
  x: 40 + Math.sqrt(3) * hexSize * (h.q + h.r / 2),
  y: 32 + hexSize * 1.5 * h.r,
})
export const outline = Array.from(
  { length: 6 },
  (_, i) =>
    `${hexSize * Math.cos(((i * 60 - 30) * Math.PI) / 180)},${hexSize * Math.sin(((i * 60 - 30) * Math.PI) / 180)}`,
).join(' ')
