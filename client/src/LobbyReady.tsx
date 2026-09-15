import type { Command, Game, Player } from './game'
import { Icon } from './Icons'

export function LobbyReady({
  game,
  me,
  disabled,
  act,
}: {
  game: Game
  me?: Player
  disabled: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const first = game.firstPlayerId ?? game.hostPlayerId
  const ready = game.players.filter((p) => p.isReady).length
  return (
    <section className="lobby-ready" aria-label="Captain readiness">
      {me?.id === game.hostPlayerId ? (
        <div className="host-start">
          <label htmlFor="first-player">WHO GOES FIRST?</label>
          <select
            id="first-player"
            value={first ?? ''}
            disabled={disabled}
            onChange={(e) => void act({ type: 'set-first-player', firstPlayerId: e.target.value })}
          >
            {game.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <small>Changing the first captain clears everyone’s ready status.</small>
        </div>
      ) : (
        <p>
          <strong>{game.players.find((p) => p.id === first)?.name ?? 'The host'}</strong> takes the first
          turn.
        </p>
      )}
      <div className="readiness-count" role="status">
        <Icon name="flag" />
        <strong>{ready} / 4 captains ready</strong>
      </div>
      <p>
        When all four are ready, each captain receives three geographically balanced random ports and six
        ships. The central port stays neutral and play begins.
      </p>
      {game.players.length < 4 && (
        <p>
          {4 - game.players.length} more captain{game.players.length === 3 ? '' : 's'} needed.
        </p>
      )}
      {me && (
        <button
          className={me.isReady ? 'secondary' : 'primary'}
          disabled={disabled}
          aria-pressed={me.isReady}
          onClick={() => void act({ type: 'set-ready', isReady: !me.isReady })}
        >
          {me.isReady ? 'Undo ready' : 'Ready to sail'} <Icon name="flag" />
        </button>
      )}
      <a href="#how-to-play">New captain? Learn the ropes →</a>
    </section>
  )
}
