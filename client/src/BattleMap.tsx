import type { Board, Game } from './game'
import { perks, portNumber } from './game'
import { outline, point } from './boardGeometry'

export function BattleMap({
  game,
  board,
  canChoose,
  selectedId,
  onSelect,
}: {
  game: Game
  board: Board
  canChoose: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const battle = game.combat!
  const ships = battle.ships?.length
    ? battle.ships
    : game.ships.filter((ship) => battle.participantShipIds.includes(ship.id))
  const portCells = board.cells.filter(
    (cell) =>
      cell.portId && (cell.portId === battle.portId || battle.supportingPortIds.includes(cell.portId)),
  )
  const points = [...ships, ...portCells].map(point)
  if (!points.length) return null
  const left = Math.min(...points.map((p) => p.x)) - 44,
    top = Math.min(...points.map((p) => p.y)) - 44
  const width = Math.max(140, Math.max(...points.map((p) => p.x)) - left + 44)
  const height = Math.max(110, Math.max(...points.map((p) => p.y)) - top + 44)
  return (
    <div className="battle-map-panel">
      <svg
        className="battle-map"
        viewBox={`${left} ${top} ${width} ${height}`}
        role="group"
        aria-label="Battle close-up"
      >
        <rect x={left} y={top} width={width} height={height} fill="#0b222c" />
        {board.cells
          .filter((cell) => {
            const p = point(cell)
            return p.x > left - 20 && p.x < left + width + 20 && p.y > top - 20 && p.y < top + height + 20
          })
          .map((cell) => {
            const p = point(cell),
              port = game.ports.find((port) => port.id === cell.portId)
            return (
              <g
                key={`${cell.q},${cell.r}`}
                className={`hex ${cell.terrain}`}
                transform={`translate(${p.x} ${p.y})`}
              >
                <polygon points={outline} />
                {port && (
                  <g className="battle-port">
                    <rect
                      x="-13"
                      y="-11"
                      width="26"
                      height="22"
                      rx="2"
                      fill={game.players.find((player) => player.id === port.ownerId)?.color ?? '#d3c8ad'}
                    />
                    <text y="4" style={{ fontSize: 10 }}>
                      P{portNumber(port.id)}
                    </text>
                    <title>{port.name}</title>
                  </g>
                )}
              </g>
            )
          })}
        {ships.map((ship) => {
          const p = point(ship),
            player = game.players.find((player) => player.id === ship.ownerId)
          const present = battle.participantShipIds.includes(ship.id)
          const trigger = ship.id === battle.triggerShipId || ship.id === battle.opponentShipId
          const eligible = canChoose && present && ship.ownerId === battle.losingPlayerId
          const recruited = !present && game.ships.some((current) => current.id === ship.id)
          const label = `Ship ${ship.number}, ${player?.name}, ${trigger ? 'trigger' : 'helper'}${ship.perk ? `, ${perks[ship.perk]?.name}` : ''}${!present ? (recruited ? ', recruited' : ', lost') : ''}`
          return (
            <g
              key={ship.id}
              transform={`translate(${p.x} ${p.y})`}
              data-battle-ship={ship.id}
              className={`battle-map-ship ${!present ? 'removed' : ''} ${eligible ? 'eligible' : ''} ${selectedId === ship.id ? 'chosen' : ''}`}
              role={eligible ? 'button' : 'img'}
              aria-label={eligible ? `Select ${label}` : label}
              aria-pressed={eligible ? selectedId === ship.id : undefined}
              tabIndex={eligible ? 0 : undefined}
              onClick={() => eligible && onSelect(ship.id)}
              onKeyDown={(event) => {
                if (eligible && ['Enter', ' '].includes(event.key)) {
                  event.preventDefault()
                  onSelect(ship.id)
                }
              }}
            >
              <title>{label}</title>
              <circle className="ship-ring" r="15" fill="#10252e" />
              <circle r={trigger ? 12 : 13.5} fill={player?.color} stroke="#10252e" strokeWidth="1" />
              <text y="4.5">{ship.number}</text>
              {!present && <path d="M-10 -10L10 10M10-10L-10 10" />}
            </g>
          )
        })}
      </svg>
      <p>
        {canChoose ? 'Select a ship here or below, then confirm its loss. ' : ''}Double rings mark triggering
        ships. Faded ships have left the battle.
      </p>
    </div>
  )
}
