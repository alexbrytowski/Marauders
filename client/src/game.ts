export type Hex = { q: number; r: number }
export type Cell = Hex & {
  terrain: 'water' | 'harbor' | 'land' | 'port'
  portId: string | null
  harborId: string | null
}
export type Board = { id: string; name: string; version: string; cells: Cell[] }
export type MapOption = { id: string; name: string; description: string; version: string }
export type MapSelection = {
  mapId: string
  ticket: number
  totalTickets: number
  usedEqualOdds: boolean
  votes: Record<string, number>
}
export type Player = { id: string; name: string; color: string; character: string }
export type CharacterProfile = { id: string; name: string; imageUrl: string | null }
export type RoundSnapshot = {
  turn: number
  activePlayerId: string | null
  at: string
  isFinal: boolean
  teams: { playerId: string; ships: number; ports: number }[]
}
export type Port = { id: string; name: string; ownerId: string | null; defenseWeakness: number }
export type Ship = Hex & {
  id: string
  ownerId: string
  portId: string
  number: number
  perk: string | null
  convertedTurnNumber: number | null
}
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
  mapId: string
  boardVersion: string
  mapVotes: Record<string, string>
  mapSelection: MapSelection | null
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
  roundHistory: RoundSnapshot[]
  perkPickups: (Hex & { kind: string })[]
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
  mapId?: string | null
}
export const colors = ['#ed7866', '#69c5bc', '#b19bdf', '#e6be68']
export const perks: Record<string, { name: string; symbol: string; description: string }> = {
  'black-pearl': {
    name: 'The Black Pearl',
    symbol: '●',
    description: '7.5% chance to recruit an enemy casualty in a winning battle.',
  },
  'glass-cannon': { name: 'Glass Cannon', symbol: '◇', description: 'Combat rolls range from 0 to 8.' },
  'loaded-dice': { name: 'Loaded Dice', symbol: '⚄', description: 'Combat rolls of 1 or 2 become 3.' },
  architect: {
    name: 'The Architect',
    symbol: '⚒',
    description: 'Construction advances twice as fast at the friendly harbor where this ship is stationed.',
  },
}
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
