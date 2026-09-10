import type { Board, Command, Game, MapOption } from './game'

const size = 17
const outline = Array.from(
  { length: 6 },
  (_, i) =>
    `${size * Math.cos(((i * 60 - 30) * Math.PI) / 180)},${size * Math.sin(((i * 60 - 30) * Math.PI) / 180)}`,
).join(' ')

export function MapVotePanel({
  game,
  maps,
  boards,
  playerId,
  busy,
  act,
}: {
  game: Game
  maps: MapOption[]
  boards: Record<string, Board>
  playerId: string | null
  busy: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const total = Object.keys(game.mapVotes).length
  const canVote = !!playerId && game.players.some((p) => p.id === playerId) && !busy
  return (
    <section className="map-ballot" aria-label="Map voting">
      <div className="ballot-heading">
        <div>
          <span className="eyebrow">CHOOSE YOUR WATERS</span>
          <h2>Where shall we sail?</h2>
        </div>
        <p>One vote per captain. Each vote is a ticket in the draw when all four captains are ready.</p>
      </div>
      <div className="map-options">
        {maps.map((map) => {
          const voters = game.players.filter((p) => game.mapVotes[p.id] === map.id)
          const selected = !!playerId && game.mapVotes[playerId] === map.id
          const chance = total ? voters.length / total : 1 / maps.length
          return (
            <article
              className={`map-option ${selected ? 'my-map-vote' : ''}`}
              key={map.id}
              data-map-option={map.id}
            >
              <svg
                className="map-thumbnail"
                viewBox="0 0 1032 838"
                role="img"
                aria-label={`${map.name} map preview`}
              >
                {boards[map.id]?.cells.map((c) => (
                  <polygon
                    key={`${c.q},${c.r}`}
                    points={outline}
                    transform={`translate(${40 + Math.sqrt(3) * size * (c.q + c.r / 2)} ${32 + size * 1.5 * c.r})`}
                    fill={
                      c.terrain === 'port'
                        ? '#f1c879'
                        : c.terrain === 'land'
                          ? '#74826a'
                          : c.terrain === 'harbor'
                            ? '#102938'
                            : '#245463'
                    }
                  />
                ))}
              </svg>
              <div className="map-option-copy">
                <h3>{map.name}</h3>
                <p>{map.description}</p>
                <div className="map-odds">
                  <strong>
                    {voters.length} {voters.length === 1 ? 'vote' : 'votes'}
                  </strong>
                  <span>{Math.round(chance * 1000) / 10}% chance</span>
                </div>
                <p className="map-voters">
                  {voters.length ? voters.map((p) => p.name).join(', ') : 'No votes yet'}
                </p>
                <button
                  disabled={!canVote}
                  aria-pressed={selected}
                  onClick={() => void act({ type: 'vote-map', mapId: map.id })}
                >
                  {selected ? `Your vote: ${map.name}` : `Vote for ${map.name}`}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="ballot-note">
        <p>
          {total
            ? `${total} of 4 captains have voted. Changing your vote clears your ready status.`
            : 'No votes yet: all three maps have equal chances.'}
          {!playerId && ' Join the crew to vote; spectators can watch the draw.'}
        </p>
        {playerId && game.mapVotes[playerId] && (
          <button disabled={busy} onClick={() => void act({ type: 'vote-map', mapId: null })}>
            Clear my vote
          </button>
        )}
      </div>
    </section>
  )
}
