export type Hex = { q: number; r: number }
export type Cell = Hex & {
  terrain: 'water' | 'harbor' | 'land' | 'port'
  portId: string | null
  harborId: string | null
}
export type Board = { version: string; cells: Cell[] }
export type Player = { id: string; name: string; color: string; character: string }
export type Port = { id: string; name: string; ownerId: string | null; defenseWeakness: number }
export type Ship = Hex & { id: string; ownerId: string; portId: string; number: number }
export type Construction = { id: string; ownerId: string; portId: string; remainingOwnerTurns: number }
export type Encounter = { id: string; triggerShipId: string; opponentShipId: string; harborId: string | null }
export type Battle = {
  id: string
  kind: string
  triggerShipId: string
  opponentShipId: string | null
  attackerId: string
  defenderId: string
  portId: string | null
  participantShipIds: string[]
  supportingPortIds: string[]
  status: string
  losingPlayerId: string | null
  winnerId: string | null
  rolls: Record<string, number[]>
  defenseModifier: number
  round: number
  message: string
}
export type GameEvent = {
  id: string
  at: string
  turn: number
  kind: string
  message: string
  rolls: Record<string, number[]> | null
}
export type Game = {
  id: string
  revision: number
  phase: string
  hostPlayerId: string | null
  winnerId: string | null
  players: Player[]
  ports: Port[]
  ships: Ship[]
  constructions: Construction[]
  turnOrder: string[]
  placementDone: string[]
  draftPickNumber: number
  activePlayerId: string | null
  remainingActions: number
  remainingMovement: number
  lastRoll: number | null
  turnNumber: number
  turnEndsAt: string | null
  actionEndsAt: string | null
  isBuildPhase: boolean
  availableBuilds: number
  combat: Battle | null
  combatChoices: Encounter[]
  events: GameEvent[]
  updatedAt: string
}
export type Session = { playerId: string | null; canReset: boolean }
export type Command = {
  type: string
  portId?: string
  shipId?: string
  q?: number
  r?: number
  combatId?: string
  choiceId?: string
  firstPlayerId?: string
}
export const colors = ['#ed7866', '#69c5bc', '#b19bdf', '#e6be68']
export const characters = ['navigator', 'corsair', 'privateer', 'buccaneer']
export const key = (h: Hex) => `${h.q},${h.r}`
export const distance = (a: Hex, b: Hex) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q - b.q + a.r - b.r)) / 2
export const directions = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]
export const actionCount = (ships: number) => (ships === 0 ? 0 : Math.floor(ships / 4) + 1)
export const portNumber = (id: string) => id.replace('port-', '')

export async function getJson<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Marauders-Client': 'web' },
          body: JSON.stringify(body),
        }
      : undefined,
  )
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(
      data.error ??
        (response.status === 401
          ? 'Your session expired. Refresh to reconnect.'
          : `Request failed (${response.status}). Please try again.`),
    )
  }
  return response.json() as Promise<T>
}

// Preview uses the same neighbor order as the server. The server revalidates
// every step; it can stop a route early as soon as an encounter is triggered.
export function movementPaths(board: Board, game: Game, ship: Ship): Map<string, Hex[]> {
  const cells = new Map(board.cells.map((c) => [key(c), c]))
  const blocked = new Set(game.ships.filter((s) => s.id !== ship.id).map(key))
  const paths = new Map<string, Hex[]>([[key(ship), [ship]]])
  const queue: Hex[] = [ship]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i],
      route = paths.get(key(current))!
    if (route.length - 1 >= game.remainingMovement) continue
    for (const d of directions) {
      const next = { q: current.q + d.q, r: current.r + d.r },
        k = key(next),
        cell = cells.get(k)
      if (!cell || !['water', 'harbor'].includes(cell.terrain) || blocked.has(k) || paths.has(k)) continue
      const path = [...route, next]
      paths.set(k, path)
      queue.push(next)
    }
  }
  paths.delete(key(ship))
  return paths
}
export function firstEncounter(board: Board, game: Game, ship: Ship, path: Hex[]) {
  const cells = new Map(board.cells.map((c) => [key(c), c]))
  return path
    .slice(1)
    .findIndex((h) =>
      game.ships.some(
        (other) =>
          other.ownerId !== ship.ownerId &&
          (distance(h, other) === 1 ||
            (cells.get(key(h))?.harborId && cells.get(key(h))?.harborId === cells.get(key(other))?.harborId)),
      ),
    )
}
