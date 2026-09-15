import { useMemo, useState, useEffect } from 'react'
import { BoardView } from './BoardView'
import { BattleModal } from './BattleModal'
import { LeaveGame } from './LeaveGame'
import { EndTurn } from './EndTurn'
import { PlayerCard } from './PlayerCard'
import { CharacterPortrait } from './CharacterPortrait'
import { JoinCrew } from './JoinCrew'
import { RoundHistory } from './RoundHistory'
import { MapVotePanel } from './MapVotePanel'
import { LobbyReady } from './LobbyReady'
import { PortAttacks } from './PortAttacks'
import { useRollPresentation } from './useRollPresentation'
import { AboutPage, ControllerPage } from './InfoPages'
import { HowToPlayPage } from './HowToPlayPage'
import { Die, Icon } from './Icons'
import { useGame } from './useGame'
import { firstEncounter, key, movementPaths, perks, portNumber, whirlpoolExit } from './game'
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
  const {
    game: latest,
    board,
    boards,
    maps,
    profiles,
    session,
    connection,
    error,
    busy,
    act,
    send,
    clearError,
  } = useGame()
  const { game, rolling } = useRollPresentation(latest, connection === 'Live')
  const [page, setPage] = useState(() => window.location.hash)
  useEffect(() => {
    const navigate = () => setPage(window.location.hash)
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null)
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [hover, setHover] = useState<Cell | null>(null),
    [destination, setDestination] = useState<Cell | null>(null)
  const [tab, setTab] = useState('ports'),
    [logExpanded, setLogExpanded] = useState(false)
  const me = game?.players.find((p) => p.id === session?.playerId && !p.hasForfeited)
  const active = game?.players.find((p) => p.id === game.activePlayerId)
  const myTurn = !!me && active?.id === me.id
  const online = connection === 'Live'
  const disabled = busy || !online || !!rolling
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
    !game.combatChoices.length &&
    !disabled
  const paths = useMemo(
    () => (canMove && board && game && ship ? movementPaths(board, game, ship) : new Map()),
    [canMove, board, game, ship],
  )
  const plan = paths.get(key(destination ?? hover ?? { q: -999, r: -999 })) ?? []
  const encounterIndex = board && game && ship && plan.length ? firstEncounter(board, game, ship, plan) : -1
  const route = encounterIndex >= 0 ? plan.slice(0, encounterIndex + 2) : plan
  const highlights: Set<string> = new Set(paths.keys())
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
    if (canMove && paths.has(key(cell))) setDestination(cell)
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
  const ownPorts = game?.ports.filter((p) => p.ownerId === me?.id) ?? []
  const ownShips = game?.ships.filter((s) => s.ownerId === me?.id) ?? []

  return (
    <main className={`app-shell ${game && game.phase !== 'lobby' ? 'in-game' : ''}`}>
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
      <nav className="site-nav" aria-label="Main navigation">
        {game && session && !game.combat && !game.combatChoices.length && (
          <LeaveGame game={game} playerId={session.playerId} disabled={disabled} act={act} />
        )}
        <a
          href="#game"
          aria-current={
            !['#about', '#controller'].includes(page) && !page.startsWith('#how-to-play') ? 'page' : undefined
          }
        >
          The voyage
        </a>
        <a href="#how-to-play" aria-current={page.startsWith('#how-to-play') ? 'page' : undefined}>
          How to play
        </a>
        <a href="#about" aria-current={page === '#about' ? 'page' : undefined}>
          About
        </a>
        <a href="#controller" aria-current={page === '#controller' ? 'page' : undefined}>
          Game controller
        </a>
      </nav>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={clearError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {page === '#about' ? (
        <AboutPage />
      ) : page.startsWith('#how-to-play') ? (
        <HowToPlayPage page={page} board={boards.classic} />
      ) : !game || !board || !session ? (
        <div className="loading-screen">
          <Icon name="compass" />
          <h1>Charting the sea…</h1>
          <p>
            {connection === 'Offline'
              ? 'Reconnecting to the game server.'
              : 'Gathering the latest game state.'}
          </p>
        </div>
      ) : page === '#controller' ? (
        <ControllerPage game={game} enabled={session.canReset} disabled={disabled} send={send} />
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
              <MapVotePanel
                game={game}
                maps={maps}
                boards={boards}
                playerId={session.playerId}
                busy={disabled}
                act={act}
              />
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
                    <JoinCrew key={game.id} game={game} profiles={profiles} disabled={disabled} send={send} />
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
                          {p && (
                            <CharacterPortrait
                              profile={profiles.find((profile) => profile.id === p.character)}
                            />
                          )}
                          <span className="crew-identity">
                            {p?.name ?? 'Open seat'}
                            {p && (
                              <small>{profiles.find((profile) => profile.id === p.character)?.name}</small>
                            )}
                          </span>
                          <small className={p?.isReady ? 'captain-is-ready' : ''}>
                            {p
                              ? `${p.id === me?.id ? 'YOU · ' : ''}${p.isReady ? 'READY' : 'NOT READY'}`
                              : 'AWAITING CAPTAIN'}
                          </small>
                        </div>
                      )
                    })}
                  </div>
                  <LobbyReady game={game} me={me} disabled={disabled} act={act} />
                  <p className="seat-note">
                    <Icon name="eye" />
                    One captain per browser profile. Extra visitors watch.
                  </p>
                </section>
              </div>
            </>
          ) : (
            <>
              {game.phase === 'draft' && (
                <section className="map-result" aria-label="Selected map">
                  <strong>{board.name}</strong>
                  {game.mapSelection ? (
                    <span>
                      Drawn from {game.mapSelection.totalTickets} tickets · ticket {game.mapSelection.ticket}
                      {game.mapSelection.usedEqualOdds
                        ? ' · no votes, equal odds'
                        : ' · weighted by captain votes'}
                    </span>
                  ) : (
                    <span>The original voyage</span>
                  )}
                </section>
              )}
              {game.winnerId && (
                <section className="victory-banner">
                  <Icon name="flag" />
                  <h1>{game.players.find((p) => p.id === game.winnerId)?.name} rules the sea.</h1>
                  <p>
                    {game.ports.some((port) => port.ownerId === game.winnerId)
                      ? 'The only captain with ports. The voyage is won.'
                      : 'The last captain remaining. The voyage is won.'}
                  </p>
                </section>
              )}
              {game.winnerId && <RoundHistory game={game} />}
              <section className="turn-bar" aria-label="Turn status">
                <div className="turn-heading">
                  <span className="eyebrow">
                    {game.phase === 'draft'
                      ? `PORT DRAFT · PICK ${game.draftPickNumber + 1} / 12`
                      : game.phase === 'placement'
                        ? 'LAUNCHING FLEETS'
                        : `ROUND ${game.turnNumber} · ${game.isEndingRound ? 'LAUNCH BATTLES' : game.isBuildPhase ? 'CONSTRUCTION' : 'THE VOYAGE'}`}
                  </span>
                  <h1>
                    {game.phase === 'finished'
                      ? 'The sea has a new ruler'
                      : myTurn
                        ? game.phase === 'draft'
                          ? 'Your pick, captain.'
                          : game.phase === 'placement'
                            ? 'Your fleet is launching.'
                            : 'You have the helm.'
                        : `${active?.name} ${game.phase === 'draft' ? 'is choosing a port' : game.phase === 'placement' ? 'is launching their fleet' : 'has the helm'}`}
                  </h1>
                </div>
                {game.phase === 'playing' && (
                  <>
                    <div
                      className="action-dice"
                      aria-label={`${game.remainingActions} action dice remaining`}
                    >
                      <strong>
                        {game.remainingActions} {game.remainingActions === 1 ? 'Die' : 'Dice'}
                      </strong>
                      <small>remaining</small>
                    </div>
                    {game.lastRoll !== null && (
                      <div
                        className="public-movement-roll"
                        role="status"
                        aria-label={`Movement roll: ${game.lastRoll}`}
                      >
                        <Die value={game.lastRoll} />
                        <span>Movement roll</span>
                      </div>
                    )}
                    <div className="timers">
                      <Countdown until={latest ? latest.turnEndsAt : game.turnEndsAt} label="round" />
                      <Countdown until={latest ? latest.actionEndsAt : game.actionEndsAt} label="action" />
                    </div>
                  </>
                )}
              </section>
              {game.phase === 'playing' && game.turnNumber >= 58 && (
                <section
                  className={`shipyard-warning ${game.turnNumber >= 66 ? 'active' : ''}`}
                  role="status"
                  aria-label="Late-game shipyard timing"
                >
                  <Icon name="hammer" />
                  <div>
                    <strong>
                      {game.turnNumber >= 66
                        ? 'Late-game shipyards are active'
                        : `Shipyards slow in ${66 - game.turnNumber} round${66 - game.turnNumber === 1 ? '' : 's'}`}
                    </strong>
                    <span>
                      {game.turnNumber >= 66
                        ? 'New construction needs 3 owner rounds. Existing builds keep their timing.'
                        : 'Starting Round 66, new construction needs 3 owner rounds. Existing builds will be unaffected.'}
                    </span>
                  </div>
                </section>
              )}
              <div className="game-table">
                <PlayerCard
                  player={game.players[0]}
                  profile={profiles.find((p) => p.id === game.players[0]?.character)}
                  game={game}
                  mine={game.players[0]?.id === me?.id}
                  index={0}
                  inspectPort={inspectPort}
                />
                <PlayerCard
                  player={game.players[1]}
                  profile={profiles.find((p) => p.id === game.players[1]?.character)}
                  game={game}
                  mine={game.players[1]?.id === me?.id}
                  index={1}
                  inspectPort={inspectPort}
                />
                <div className="board-center">
                  <BoardView
                    key={`${game.id}-${game.mapId}`}
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
                  profile={profiles.find((p) => p.id === game.players[2]?.character)}
                  game={game}
                  mine={game.players[2]?.id === me?.id}
                  index={2}
                  inspectPort={inspectPort}
                />
                <PlayerCard
                  player={game.players[3]}
                  profile={profiles.find((p) => p.id === game.players[3]?.character)}
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
                              ? 'Launching all fleets'
                              : 'Chart your next move'))}
                    </h2>
                    <p>
                      {ship
                        ? `${game.players.find((p) => p.id === ship.ownerId)?.name} · Hex ${ship.q}, ${ship.r}${canMove ? ` · ${game.remainingMovement} movement left` : ''}`
                        : port
                          ? `${game.players.find((p) => p.id === port.ownerId)?.name ?? 'Unclaimed'} · Defense ${port.defenseWeakness ? `−${port.defenseWeakness}` : 'full strength'}`
                          : game.phase === 'draft'
                            ? 'Perks are marked on the chart. Choose a port with your route in mind. Each port launches two ships automatically.'
                            : game.phase === 'placement'
                              ? 'Two ships launch at each owned port. Play begins automatically.'
                              : me
                                ? 'Select a ship or port to see its available actions.'
                                : 'You are watching. All turns and dice rolls are public.'}
                    </p>
                    {ship?.perk && (
                      <p className="perk-description">
                        <strong>
                          {perks[ship.perk]?.symbol} {perks[ship.perk]?.name}
                        </strong>{' '}
                        · {perks[ship.perk]?.description}
                      </p>
                    )}
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
                  {game.phase === 'playing' && myTurn && !game.isBuildPhase && (
                    <>
                      {destination && canMove && (
                        <button className="primary" disabled={disabled} onClick={() => void completeMove()}>
                          Sail {route.length - 1} hex{route.length === 2 ? '' : 'es'}
                          {encounterIndex >= 0 ? ' · battle ahead' : ''}
                          {route.length > 1 && whirlpoolExit(game, route[route.length - 1])
                            ? ' · teleport, then chart again'
                            : ''}
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
                    </>
                  )}
                  {game.phase === 'playing' && myTurn && game.isBuildPhase && (
                    <>
                      <span>{game.availableBuilds} builds · random ports for any left at turn end</span>
                      <button
                        className="primary"
                        disabled={disabled || !port || port.ownerId !== me?.id || game.availableBuilds === 0}
                        onClick={() => port && void act({ type: 'build', portId: port.id })}
                      >
                        <Icon name="hammer" />
                        Build at {port?.name ?? 'selected port'}
                      </button>
                    </>
                  )}
                  {game.phase === 'playing' && myTurn && (
                    <EndTurn
                      game={game}
                      disabled={disabled || !!game.combat || game.combatChoices.length > 0}
                      act={act}
                    />
                  )}
                  {!myTurn && game.phase !== 'finished' && (
                    <span className="watching-note">
                      <Icon name="eye" />
                      {me ? 'Watching the active captain' : 'Spectator view'}
                    </span>
                  )}
                </div>
                <PortAttacks
                  game={game}
                  board={board}
                  playerId={session.playerId}
                  disabled={disabled}
                  act={act}
                />
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
                                {game.phase === 'draft'
                                  ? 'Two ships at launch'
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
                                {s.perk && ` · ${perks[s.perk]?.symbol} ${perks[s.perk]?.name}`}
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
          <BattleModal
            game={game}
            board={board}
            rolling={rolling === 'combat'}
            playerId={session.playerId}
            busy={disabled}
            act={act}
            error={error}
          />
          <footer className="site-footer">
            <span>
              MARAUDERS <i>·</i> Claim the ports. Command the seas.
            </span>
            <a href="#controller">Game controller</a>
          </footer>
        </>
      )}
    </main>
  )
}
