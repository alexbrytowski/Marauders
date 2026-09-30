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
  const ready = game.players.filter((p) => p.isReady).length
  return (
    <section className="lobby-ready" aria-label="Captain readiness">
      <p>The server draws the first captain at random when everyone is ready.</p>
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
