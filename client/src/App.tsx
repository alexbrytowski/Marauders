import { useMemo, useState, useEffect } from 'react'
import { BoardView } from './BoardView'
import { BattleModal } from './BattleModal'
import { PlayerCard } from './PlayerCard'
import { Die, Icon } from './Icons'
import { useGame } from './useGame'
import { characters, colors, firstEncounter, key, movementPaths, portNumber } from './game'
import type { Cell } from './game'
import './App.css'

function Countdown({ until, label }: { until: string | null; label: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  if (!until) return null
  const left = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))
  return (
    <span className={`countdown ${left < 15 ? 'urgent' : ''}`}>
      <Icon name="clock" />
      <b>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </b>
      <small>{label}</small>
    </span>
  )
}

export default function App() {
  const { game, board, session, connection, error, busy, act, send, clearError } = useGame()
  const [name, setName] = useState(''),
    [color, setColor] = useState(colors[0]),
    [character, setCharacter] = useState(characters[0])
  const [firstPlayer, setFirstPlayer] = useState('')
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [hover, setHover] = useState<Cell | null>(null),
    [destination, setDestination] = useState<Cell | null>(null)
  const [tab, setTab] = useState('ports'),
    [logExpanded, setLogExpanded] = useState(false),
    [resetConfirm, setResetConfirm] = useState(false)
  const me = game?.players.find((p) => p.id === session?.playerId)
  const active = game?.players.find((p) => p.id === game.activePlayerId)
  const myTurn = !!me && active?.id === me.id
  const online = connection === 'Live'
  const disabled = busy || !online
  const ship = game?.ships.find((s) => s.id === selectedShipId)
  const port = game?.ports.find((p) => p.id === selectedPortId)
  const canMove =
    !!game &&
    game.phase === 'playing' &&
    myTurn &&
    !!ship &&
    ship.ownerId === me?.id &&
    game.remainingMovement > 0 &&
    !game.isBuildPhase &&
    !game.combat &&
    !game.combatChoices.length
  const paths = useMemo(
    () => (canMove && board && game && ship ? movementPaths(board, game, ship) : new Map()),
    [canMove, board, game, ship],
  )
  const plan = paths.get(key(destination ?? hover ?? { q: -999, r: -999 })) ?? []
  const encounterIndex = board && game && ship && plan.length ? firstEncounter(board, game, ship, plan) : -1
  const route = encounterIndex >= 0 ? plan.slice(0, encounterIndex + 2) : plan
  const placement =
    game?.phase === 'placement' &&
    myTurn &&
    port?.ownerId === me?.id &&
    game.ships.filter((s) => s.portId === port.id).length < 2
  const highlights: Set<string> =
    placement && board
      ? new Set(
          board.cells
            .filter((c) => c.harborId === port?.id && !game!.ships.some((s) => key(s) === key(c)))
            .map(key),
        )
      : new Set(paths.keys())
  const inspectPort = (id: string) => {
    setSelectedPortId(id)
    setSelectedShipId(null)
    setDestination(null)
  }
  const selectShip = (id: string) => {
    setSelectedShipId(id)
    setSelectedPortId(null)
    setDestination(null)
  }
  const cellClick = (cell: Cell) => {
    if (placement && highlights.has(key(cell)))
      void act({ type: 'place', portId: port!.id, q: cell.q, r: cell.r })
    else if (canMove && paths.has(key(cell))) setDestination(cell)
    else if (cell.harborId) inspectPort(cell.harborId)
  }
  const completeMove = async () => {
    if (
      ship &&
      destination &&
      (await act({ type: 'move', shipId: ship.id, q: destination.q, r: destination.r }))
    )
      setDestination(null)
  }
  const attackPortId = ship && board?.cells.find((c) => key(c) === key(ship))?.harborId
  const attackPort = game?.ports.find((p) => p.id === attackPortId && p.ownerId !== me?.id)
  const ownPorts = game?.ports.filter((p) => p.ownerId === me?.id) ?? []
  const ownShips = game?.ships.filter((s) => s.ownerId === me?.id) ?? []
  const availableColor = !game?.players.some((p) => p.color === color)
    ? color
    : colors.find((c) => !game?.players.some((p) => p.color === c))

  return (
    <main className="app-shell">
      <header className="masthead">
        <a href="/" className="brand">
          <Icon name="compass" />
          <span>
            MARAUDERS<small>A GAME OF PORTS & POWER</small>
          </span>
        </a>
        <div className="masthead-right">
          <span className={`connection ${online ? 'connected' : ''}`}>
            <i />
            {connection}
          </span>
          <span className="identity">
            <Icon name={me ? 'ship' : 'eye'} />
            {me ? me.name : 'Spectating'}
          </span>
        </div>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {!game || !board || !session ? (
        <div className="loading-screen">
          <Icon name="compass" />
          <h1>Charting the sea…</h1>
          <p>
            {connection === 'Offline'
              ? 'Reconnecting to the game server.'
              : 'Gathering the latest game state.'}
          </p>
        </div>
      ) : (
        <>
          {game.phase === 'lobby' ? (
            <>
              <section className="lobby-intro">
                <span className="eyebrow">FORTUNE FAVORS THE BOLD</span>
                <h1>
                  Thirteen ports.
                  <br />
                  <em>One ruler of the sea.</em>
                </h1>
                <p>Assemble your crew, claim your harbors, and sail for everything.</p>
              </section>
              <div className="lobby-layout">
                <div className="lobby-chart">
                  <BoardView
                    board={board}
                    game={game}
                    selectedShipId={null}
                    selectedPortId={selectedPortId}
                    highlights={new Set()}
                    route={[]}
                    onCell={() => {}}
                    onShip={() => {}}
                    onPort={inspectPort}
                    onHover={() => {}}
                    preview
                  />
                  <div className="map-caption">
                    <Icon name="compass" />
                    <span>
                      Your chart of the Marauder Sea
                      <small>13 ports · hex-based sailing · four captains</small>
                    </span>
                  </div>
                </div>
                <section className="lobby-panel">
                  <span className="eyebrow">THE CAPTAIN’S TABLE</span>
                  <h2>
                    {me
                      ? 'Your seat is reserved.'
                      : game.players.length === 4
                        ? 'Watch the voyage.'
                        : 'Take the helm.'}
                  </h2>
                  {me ? (
                    <p className="lobby-copy">
                      You’re sailing as <strong style={{ color: me.color }}>{me.name}</strong>. Refreshing or
                      opening another tab returns to this captain.
                    </p>
                  ) : game.players.length < 4 ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (availableColor)
                          void send('/api/game/players', { name, color: availableColor, character })
                      }}
                    >
                      <label htmlFor="captain-name">CAPTAIN NAME</label>
                      <input
                        id="captain-name"
                        placeholder="What shall we call you?"
                        maxLength={24}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="nickname"
                        required
                      />
                      <label>YOUR COLORS</label>
                      <div className="color-picker">
                        {colors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={availableColor === c ? 'chosen' : ''}
                            style={{ '--crew': c } as React.CSSProperties}
                            disabled={game.players.some((p) => p.color === c)}
                            onClick={() => setColor(c)}
                            aria-label={`Choose ${c} crew color`}
                            aria-pressed={availableColor === c}
                          >
                            {availableColor === c ? '✓' : ''}
                          </button>
                        ))}
                      </div>
                      <label htmlFor="character">YOUR CHARACTER</label>
                      <select id="character" value={character} onChange={(e) => setCharacter(e.target.value)}>
                        {characters.map((c) => (
                          <option key={c} value={c}>
                            {c[0].toUpperCase() + c.slice(1)}
                          </option>
                        ))}
                      </select>
                      <p className="perk-note">Character is cosmetic. Perks are coming after playtesting.</p>
                      <button
                        className="primary join-button"
                        type="submit"
                        disabled={disabled || !name.trim() || !availableColor}
                      >
                        Join the crew <span>→</span>
                      </button>
                    </form>
                  ) : (
                    <p className="lobby-copy">
                      All four seats are filled. You’ll see the whole board, every turn, and every battle
                      live.
                    </p>
                  )}
                  <div className="lobby-crew">
                    <div className="section-label">
                      CREW MANIFEST <b>{game.players.length} / 4</b>
                    </div>
                    {Array.from({ length: 4 }, (_, i) => {
                      const p = game.players[i]
                      return (
                        <div key={i} className={`crew-row ${p ? '' : 'vacant'}`}>
                          <span className="seat-number" style={{ color: p?.color }}>
                            0{i + 1}
                          </span>
                          <span>{p?.name ?? 'Open seat'}</span>
                          <small>{p ? (p.id === me?.id ? 'YOU' : 'READY') : 'AWAITING CAPTAIN'}</small>
                        </div>
                      )
                    })}
                  </div>
                  {me?.id === game.hostPlayerId && (
                    <div className="host-start">
                      <label htmlFor="first-player">WHO PICKS FIRST?</label>
                      <select
                        id="first-player"
                        value={firstPlayer || game.players[0]?.id}
                        onChange={(e) => setFirstPlayer(e.target.value)}
                      >
                        {game.players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="primary"
                        disabled={disabled || game.players.length !== 4}
                        onClick={() =>
                          void act({ type: 'start-draft', firstPlayerId: firstPlayer || game.players[0].id })
                        }
                      >
                        Begin port draft <Icon name="flag" />
                      </button>
                    </div>
                  )}
                  <p className="seat-note">
                    <Icon name="eye" />
                    One captain per browser profile. Extra visitors watch.
                  </p>
                </section>
              </div>
            </>
          ) : (
            <>
              {game.winnerId && (
                <section className="victory-banner">
                  <Icon name="flag" />
                  <h1>{game.players.find((p) => p.id === game.winnerId)?.name} rules the sea.</h1>
                  <p>All 13 ports captured. The voyage is won.</p>
                </section>
              )}
              <section className="turn-bar" aria-label="Turn status">
                <div className="turn-heading">
                  <span className="eyebrow">
                    {game.phase === 'draft'
                      ? `PORT DRAFT · PICK ${game.draftPickNumber + 1} / 12`
                      : game.phase === 'placement'
                        ? 'DEPLOY YOUR FLEET'
                        : `ROUND ${game.turnNumber} · ${game.isBuildPhase ? 'CONSTRUCTION' : 'THE VOYAGE'}`}
                  </span>
                  <h1>
                    {game.phase === 'finished'
                      ? 'The sea has a new ruler'
                      : myTurn
                        ? game.phase === 'draft'
                          ? 'Your pick, captain.'
                          : game.phase === 'placement'
                            ? 'Choose your starting waters.'
                            : 'You have the helm.'
                        : `${active?.name} ${game.phase === 'draft' ? 'is choosing a port' : game.phase === 'placement' ? 'is deploying ships' : 'has the helm'}`}
                  </h1>
                </div>
                {game.phase === 'playing' && (
                  <>
                    <div
                      className="action-dice"
                      aria-label={`${game.remainingActions} action dice remaining`}
                    >
                      {Array.from({ length: Math.max(1, game.remainingActions) }, (_, i) => (
                        <Die key={i} dim={game.remainingActions === 0} />
                      ))}
                    </div>
                    <div className="timers">
                      <Countdown until={game.turnEndsAt} label="round" />
                      <Countdown until={game.actionEndsAt} label="action" />
                    </div>
                  </>
                )}
              </section>
              <div className="game-table">
                <PlayerCard
                  player={game.players[0]}
                  game={game}
                  mine={game.players[0]?.id === me?.id}
                  index={0}
                  inspectPort={inspectPort}
                />
                <PlayerCard
                  player={game.players[1]}
                  game={game}
                  mine={game.players[1]?.id === me?.id}
                  index={1}
                  inspectPort={inspectPort}
                />
                <div className="board-center">
                  <BoardView
                    board={board}
                    game={game}
                    selectedShipId={selectedShipId}
                    selectedPortId={selectedPortId}
                    highlights={highlights}
                    route={route}
                    onCell={cellClick}
                    onShip={selectShip}
                    onPort={inspectPort}
                    onHover={setHover}
                  />
                </div>
                <PlayerCard
                  player={game.players[2]}
                  game={game}
                  mine={game.players[2]?.id === me?.id}
                  index={2}
                  inspectPort={inspectPort}
                />
                <PlayerCard
                  player={game.players[3]}
                  game={game}
                  mine={game.players[3]?.id === me?.id}
                  index={3}
                  inspectPort={inspectPort}
                />
              </div>
              <section className="command-deck" aria-label="Captain controls">
                <div className="selection-info">
                  <Icon name={ship ? 'ship' : port ? 'port' : 'compass'} />
                  <div>
                    <h2>
                      {ship
                        ? `Ship ${ship.number}`
                        : (port?.name ??
                          (game.phase === 'draft'
                            ? 'Choose your foothold'
                            : game.phase === 'placement'
                              ? 'Select one of your ports'
                              : 'Chart your next move'))}
                    </h2>
                    <p>
                      {ship
                        ? `${game.players.find((p) => p.id === ship.ownerId)?.name} · Hex ${ship.q}, ${ship.r}${canMove ? ` · ${game.remainingMovement} movement left` : ''}`
                        : port
                          ? `${game.players.find((p) => p.id === port.ownerId)?.name ?? 'Unclaimed'} · Defense ${port.defenseWeakness ? `−${port.defenseWeakness}` : 'full strength'}`
                          : game.phase === 'draft'
                            ? 'Select an unclaimed port on the map, then confirm your pick.'
                            : game.phase === 'placement'
                              ? 'Place two ships in the highlighted harbor cells at each port.'
                              : me
                                ? 'Select a ship or port to see its available actions.'
                                : 'You are watching. All turns and dice rolls are public.'}
                    </p>
                  </div>
                </div>
                <div className="command-buttons">
                  {game.phase === 'draft' && (
                    <button
                      className="primary"
                      disabled={disabled || !myTurn || !port || !!port.ownerId}
                      onClick={() => port && void act({ type: 'draft', portId: port.id })}
                    >
                      Claim {port?.name ?? 'selected port'}
                    </button>
                  )}
                  {game.phase === 'placement' && myTurn && (
                    <>
                      <span className="placement-count">{ownShips.length} / 6 ships placed</span>
                      <button
                        className="primary"
                        disabled={disabled || ownShips.length !== 6}
                        onClick={() => void act({ type: 'finish-placement' })}
                      >
                        Fleet ready →
                      </button>
                    </>
                  )}
                  {game.phase === 'playing' && myTurn && !game.isBuildPhase && (
                    <>
                      {destination && canMove && (
                        <button className="primary" disabled={disabled} onClick={() => void completeMove()}>
                          Sail {route.length - 1} hex{route.length === 2 ? '' : 'es'}
                          {encounterIndex >= 0 ? ' · battle ahead' : ''}
                        </button>
                      )}
                      {game.remainingMovement > 0 ? (
                        <>
                          <span className="movement-chip">
                            <Die value={game.lastRoll ?? undefined} />
                            {game.remainingMovement} movement left
                          </span>
                          <button
                            className="secondary"
                            disabled={disabled}
                            onClick={() => void act({ type: 'pass-movement' })}
                          >
                            Pass movement
                          </button>
                        </>
                      ) : (
                        <button
                          className="primary"
                          disabled={disabled || game.remainingActions === 0}
                          onClick={() => void act({ type: 'roll-movement' })}
                        >
                          <Icon name="dice" />
                          Roll to sail
                        </button>
                      )}
                      {ship?.ownerId === me?.id && attackPort && (
                        <button
                          className="danger-button"
                          disabled={disabled || game.remainingActions === 0 || game.remainingMovement > 0}
                          onClick={() =>
                            void act({ type: 'attack-port', shipId: ship.id, portId: attackPort.id })
                          }
                        >
                          <Icon name="battle" />
                          Attack {attackPort.name}
                        </button>
                      )}
                      <button
                        className="secondary"
                        disabled={disabled}
                        onClick={() => void act({ type: 'end-turn' })}
                      >
                        End actions
                      </button>
                    </>
                  )}
                  {game.phase === 'playing' && myTurn && game.isBuildPhase && (
                    <>
                      <span>{game.availableBuilds} builds available</span>
                      <button
                        className="primary"
                        disabled={disabled || !port || port.ownerId !== me?.id || game.availableBuilds === 0}
                        onClick={() => port && void act({ type: 'build', portId: port.id })}
                      >
                        <Icon name="hammer" />
                        Build at {port?.name ?? 'selected port'}
                      </button>
                      <button
                        className="secondary"
                        disabled={disabled}
                        onClick={() => void act({ type: 'end-turn' })}
                      >
                        Finish round →
                      </button>
                    </>
                  )}
                  {!myTurn && game.phase !== 'finished' && (
                    <span className="watching-note">
                      <Icon name="eye" />
                      {me ? 'Watching the active captain' : 'Spectator view'}
                    </span>
                  )}
                </div>
              </section>
              {me && (
                <section className="personal-deck">
                  <nav aria-label="Your captain information">
                    <button className={tab === 'ports' ? 'selected-tab' : ''} onClick={() => setTab('ports')}>
                      <Icon name="port" />
                      Your ports <b>{ownPorts.length}</b>
                    </button>
                    <button className={tab === 'fleet' ? 'selected-tab' : ''} onClick={() => setTab('fleet')}>
                      <Icon name="ship" />
                      Your fleet <b>{ownShips.length}</b>
                    </button>
                    <button
                      className={tab === 'builds' ? 'selected-tab' : ''}
                      onClick={() => setTab('builds')}
                    >
                      <Icon name="hammer" />
                      Shipyards <b>{game.constructions.filter((b) => b.ownerId === me.id).length}</b>
                    </button>
                  </nav>
                  <div className="personal-content">
                    {tab === 'ports' &&
                      (ownPorts.length ? (
                        ownPorts.map((p) => (
                          <button
                            key={p.id}
                            className={selectedPortId === p.id ? 'selected-item' : ''}
                            onClick={() => inspectPort(p.id)}
                          >
                            <span className="port-badge">{portNumber(p.id)}</span>
                            <span>
                              {p.name}
                              <small>
                                {game.phase === 'placement'
                                  ? `${game.ships.filter((s) => s.portId === p.id).length}/2 deployed`
                                  : p.defenseWeakness
                                    ? `Defense −${p.defenseWeakness}`
                                    : 'Defense ready'}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p>Your claimed ports will appear here.</p>
                      ))}
                    {tab === 'fleet' &&
                      (ownShips.length ? (
                        ownShips.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => selectShip(s.id)}
                            className={selectedShipId === s.id ? 'selected-item' : ''}
                          >
                            <Icon name="ship" />
                            <span>
                              Ship {s.number}
                              <small>
                                Hex {s.q}, {s.r}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p>No ships at sea. Your ports can build reinforcements.</p>
                      ))}
                    {tab === 'builds' &&
                      (game.constructions.some((b) => b.ownerId === me.id) ? (
                        game.constructions
                          .filter((b) => b.ownerId === me.id)
                          .map((b) => (
                            <button key={b.id} onClick={() => inspectPort(b.portId)}>
                              <Icon name="hammer" />
                              <span>
                                {game.ports.find((p) => p.id === b.portId)?.name}
                                <small>{b.remainingOwnerTurns} owner rounds until launch</small>
                                <progress max="2" value={2 - b.remainingOwnerTurns} />
                              </span>
                            </button>
                          ))
                      ) : (
                        <p>No ships under construction. Start builds at the end of your round.</p>
                      ))}
                  </div>
                </section>
              )}
            </>
          )}
          <section className="captains-log">
            <div className="log-heading">
              <h2>
                <Icon name="log" />
                Captain’s log
              </h2>
              <button onClick={() => setLogExpanded((v) => !v)}>
                {logExpanded ? 'Show recent' : `All ${game.events.length} events`}
              </button>
            </div>
            <ol>
              {game.events
                .slice(logExpanded ? 0 : -5)
                .reverse()
                .map((event) => (
                  <li key={event.id}>
                    <span className="event-turn">{event.turn ? `R${event.turn}` : 'SETUP'}</span>
                    <div>
                      {event.message}
                      {event.rolls && (
                        <div className="event-rolls">
                          {Object.entries(event.rolls).map(([id, rolls]) => (
                            <span key={id}>
                              {game.players.find((p) => p.id === id)?.name ??
                                game.ports.find((p) => p.id === id)?.name}
                              : {rolls.join(' · ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
            </ol>
            {!game.events.length && <p>Your story begins when the first captain joins.</p>}
          </section>
          <BattleModal game={game} playerId={session.playerId} busy={disabled} act={act} error={error} />
          <footer className="site-footer">
            <span>
              MARAUDERS <i>·</i> Claim the ports. Command the seas.
            </span>
            {session.canReset && me?.id === game.hostPlayerId && (
              <div>
                {resetConfirm ? (
                  <>
                    <span>Start a fresh game with this crew?</span>
                    <button
                      onClick={() => {
                        void send('/api/game/reset', {}).then((ok) => {
                          if (ok) {
                            setSelectedShipId(null)
                            setSelectedPortId(null)
                          }
                        })
                        setResetConfirm(false)
                      }}
                    >
                      Confirm new game
                    </button>
                    <button onClick={() => setResetConfirm(false)}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setResetConfirm(true)}>New local game</button>
                )}
              </div>
            )}
          </footer>
        </>
      )}
    </main>
  )
}
