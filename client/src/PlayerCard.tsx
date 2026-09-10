import type { CSSProperties } from 'react'
import { actionCount, capacity, portNumber } from './game'
import type { CharacterProfile, Game, Player } from './game'
import { CharacterPortrait } from './CharacterPortrait'
import { Icon } from './Icons'

export function PlayerCard({
  player,
  profile,
  game,
  mine,
  index,
  inspectPort,
}: {
  player?: Player
  profile?: CharacterProfile
  game: Game
  mine: boolean
  index: number
  inspectPort: (id: string) => void
}) {
  if (!player)
    return (
      <aside className={`captain-card seat-${index} empty-seat`}>
        <div className="captain-emblem">
          <Icon name="compass" />
        </div>
        <span>Awaiting captain</span>
        <small>Seat {index + 1} of 4</small>
      </aside>
    )
  const ports = game.ports.filter((p) => p.ownerId === player.id),
    fleet = game.ships.filter((s) => s.ownerId === player.id)
  const builds = game.constructions.filter((b) => b.ownerId === player.id)
  const active = game.activePlayerId === player.id
  const eliminated = ['playing', 'finished'].includes(game.phase) && !ports.length
  return (
    <aside
      className={`captain-card seat-${index} ${active ? 'active' : ''} ${mine ? 'my-card' : ''}`}
      style={{ '--crew': player.color } as CSSProperties}
      data-testid={`player-card-${index}`}
    >
      <div className="captain-heading">
        <div className="captain-emblem">
          <CharacterPortrait profile={profile} />
        </div>
        <div>
          <h2>
            {player.name} {mine && <span className="you-tag">YOU</span>}
          </h2>
          <p>{profile?.name ?? player.character}</p>
        </div>
        {active && <span className="turn-beacon" title="Active captain" />}
      </div>
      <div className="captain-stats">
        <div>
          <Icon name="port" />
          <strong>{ports.length}</strong>
          <small>ports</small>
        </div>
        <div>
          <Icon name="ship" />
          <strong>
            {fleet.length}
            <em>/{capacity(game, player.id)}</em>
          </strong>
          <small>fleet / cap</small>
        </div>
        <div>
          <Icon name="dice" />
          <strong>
            {active && game.phase === 'playing' ? game.remainingActions : actionCount(fleet.length)}
          </strong>
          <small>{active ? 'dice left' : 'dice / turn'}</small>
        </div>
      </div>
      <div className="owned-ports">
        {ports.map((port) => (
          <button key={port.id} onClick={() => inspectPort(port.id)} title={port.name}>
            ⚑ {portNumber(port.id)}
          </button>
        ))}
        {!ports.length && (
          <small>{game.phase === 'lobby' ? 'Ports chosen in the draft' : 'No ports held'}</small>
        )}
      </div>
      <div className="captain-foot">
        <span className={active ? 'crew-text' : ''}>
          {player.hasForfeited
            ? 'Forfeited · left'
            : eliminated
              ? 'Eliminated · watching'
              : active
                ? game.isBuildPhase
                  ? 'Choosing construction'
                  : game.phase === 'placement'
                    ? 'Deploying fleet'
                    : game.phase === 'draft'
                      ? 'Choosing a port'
                      : 'At the helm'
                : 'Standing by'}
        </span>
        <span title="Ships under construction">
          <Icon name="hammer" /> {builds.length}
        </span>
      </div>
      {builds.length > 0 && (
        <div className="mini-builds">
          {builds.map((b) => (
            <div
              key={b.id}
              title={`${game.ports.find((p) => p.id === b.portId)?.name}: ${b.remainingOwnerTurns} owner rounds left`}
            >
              <span>⚑ {portNumber(b.portId)}</span>
              <progress max="2" value={2 - b.remainingOwnerTurns} />
              <small>{b.remainingOwnerTurns}r</small>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
