import { useState } from 'react'
import type { Board, Command, Game, Port, Ship } from './game'
import { distance, key, perks } from './game'
import { Icon } from './Icons'

export function PortAttacks({
  game,
  board,
  playerId,
  disabled,
  act,
}: {
  game: Game
  board: Board
  playerId: string | null
  disabled: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const cells = new Map(board.cells.map((cell) => [key(cell), cell]))
  const own = game.ships.filter((ship) => ship.ownerId === playerId)
  const enemies = game.ships.filter((ship) => ship.ownerId !== playerId)
  const encounter = own.some((ship) =>
    enemies.some(
      (enemy) =>
        distance(ship, enemy) === 1 ||
        (!!cells.get(key(ship))?.harborId &&
          cells.get(key(ship))?.harborId === cells.get(key(enemy))?.harborId),
    ),
  )
  if (
    game.phase !== 'playing' ||
    game.activePlayerId !== playerId ||
    game.isBuildPhase ||
    game.combat ||
    game.combatChoices.length ||
    encounter
  )
    return null
  const targets = game.ports.filter(
    (port) => port.ownerId !== playerId && own.some((ship) => cells.get(key(ship))?.harborId === port.id),
  )
  if (!targets.length) return null
  return (
    <section className="port-attacks" aria-label="Available port attacks">
      <div>
        <strong>Ports within reach</strong>
        <small>
          {game.remainingActions === 0
            ? 'No unused action dice this round.'
            : game.remainingMovement > 0
              ? 'Finish or pass movement to attack with your next die.'
              : 'Each attack uses one action die.'}
        </small>
      </div>
      {targets.map((port) => (
        <PortAttack
          key={port.id}
          port={port}
          ships={own.filter((ship) => cells.get(key(ship))?.harborId === port.id)}
          fleet={own}
          disabled={disabled || game.remainingActions === 0 || game.remainingMovement > 0}
          act={act}
        />
      ))}
    </section>
  )
}

function PortAttack({
  port,
  ships,
  fleet,
  disabled,
  act,
}: {
  port: Port
  ships: Ship[]
  fleet: Ship[]
  disabled: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const [choice, setChoice] = useState('')
  const ordered = [...ships].sort((a, b) => a.number - b.number)
  const ship = ordered.find((candidate) => candidate.id === choice) ?? ordered[0]
  const label = (candidate: Ship) => {
    const helpers = fleet.filter(
      (other) => other.id !== candidate.id && distance(candidate, other) <= 2,
    ).length
    return `Ship ${candidate.number} · ${helpers} helper${helpers === 1 ? '' : 's'}${candidate.perk ? ` · ${perks[candidate.perk]?.name}` : ''}`
  }
  return (
    <div className="port-attack-option">
      {ships.length > 1 ? (
        <select
          aria-label={`Attacking ship at ${port.name}`}
          value={ship.id}
          disabled={disabled}
          onChange={(event) => setChoice(event.target.value)}
        >
          {ordered.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {label(candidate)}
            </option>
          ))}
        </select>
      ) : (
        <small>{label(ship)}</small>
      )}
      <button
        className="danger-button"
        disabled={disabled}
        onClick={() => void act({ type: 'attack-port', portId: port.id, shipId: ship.id })}
      >
        <Icon name="battle" /> Attack {port.name}
      </button>
    </div>
  )
}
