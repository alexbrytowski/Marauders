import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import './App.css'

type Player = { id: string; name: string; color: string }
type Port = { id: string; name: string; ownerId: string | null }
type Ship = { id: string; ownerId: string; portId: string; slot: number; q: number; r: number }
type Combat = { id: string; participantShipIds: string[]; status: string; losingPlayerId: string | null; rolls: Record<string, number[]> }
type Construction = { id: string; ownerId: string; portId: string; remainingOwnerTurns: number }
type GameState = { phase: string; players: Player[]; ports: Port[]; ships: Ship[]; constructions: Construction[]; draftPickNumber: number; activePlayerId: string | null; remainingActions: number; remainingMovement: number; lastRoll: number | null; turnNumber: number; combat: Combat | null; isBuildPhase: boolean; availableBuilds: number }

// Percentage positions over the photographed original board. These will become
// axial hex coordinates when movement is implemented.
const portPositions = [
  [30.75, 9.66], [73.46, 10.98], [48.02, 25.86], [72.67, 31.15], [11.76, 37.9],
  [35.76, 38.69], [54.42, 49.54], [79.56, 47.29], [13.24, 60.85], [33.98, 63.49],
  [61.9, 69.11], [19.1, 88.23], [76.98, 87.37],
]
const portHexes = [[9, 1], [23, 1], [15, 6], [23, 7], [2, 10], [11, 10], [17, 14], [26, 14], [4, 18], [10, 19], [20, 22], [6, 28], [25, 28]]

const hexToPosition = (q: number, r: number) => ({ left: 3.05 * q - 0.2 * r + 3.5, top: 0.1 * q + 3.2 * r + 5.56 })
const positionToHex = (left: number, top: number) => {
  const x = left - 3.5; const y = top - 5.56; const determinant = 9.78
  return { q: Math.round((3.2 * x + 0.2 * y) / determinant), r: Math.round((3.05 * y - 0.1 * x) / determinant) }
}

async function request(path: string, body?: object) {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) throw new Error((await response.json()).error ?? 'Something went wrong.')
  return response.json() as Promise<GameState>
}

function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#d74d4d')
  const [error, setError] = useState('')
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null)
  useEffect(() => {
    void fetch('/api/game').then(response => response.json()).then(setGame)
    const hub = new signalR.HubConnectionBuilder().withUrl('/hubs/game').withAutomaticReconnect().build()
    hub.on('gameUpdated', setGame); void hub.start()
    return () => { void hub.stop() }
  }, [])
  const run = async (operation: () => Promise<GameState>) => { try { setError(''); setGame(await operation()) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong.') } }
  const activePlayer = game?.players.find(player => player.id === game.activePlayerId)
  const combat = game?.combat
  const selectedShip = game?.ships.find(ship => ship.id === selectedShipId)
  const attackTarget = selectedShip && game?.ports.find((port, index) => {
    const [q, r] = portHexes[index]
    const distance = (Math.abs(selectedShip.q - q) + Math.abs(selectedShip.r - r) + Math.abs((selectedShip.q - q) + (selectedShip.r - r))) / 2
    return distance === 1 && port.ownerId !== selectedShip.ownerId
  })
  const moveToBoardHex = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!game || !activePlayer || !selectedShipId || game.remainingMovement === 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const hex = positionToHex(((event.clientX - bounds.left) / bounds.width) * 100, ((event.clientY - bounds.top) / bounds.height) * 100)
    void run(async () => { const updated = await request('/game/move', { playerId: activePlayer.id, shipId: selectedShipId, q: hex.q, r: hex.r }); setSelectedShipId(null); return updated })
  }
  return <main>
    <header><p className="eyebrow">A four-player pirate board game</p><h1>Marauders</h1><p>Claim the ports. Command the seas.</p></header>
    {error && <p className="error">{error}</p>}
    {!game ? <p>Loading game…</p> : <>
      <section className="panel status"><span>Game phase</span><strong>{game.phase === 'lobby' ? 'Gathering crew' : game.phase === 'draft' ? 'Port draft' : 'Battle underway'}</strong></section>
      {game.phase === 'lobby' && <section className="panel"><h2>Assemble the crew</h2><p>Four captains are needed.</p><div className="join"><input value={name} onChange={e => setName(e.target.value)} placeholder="Captain name" /><input type="color" value={color} onChange={e => setColor(e.target.value)} /><button disabled={!name.trim() || game.players.length === 4} onClick={() => run(() => request('/game/players', { name, color }))}>Join game</button></div><div className="crew">{game.players.map(p => <div key={p.id} className="captain"><i style={{ background: p.color }} />{p.name}</div>)}{Array.from({ length: 4 - game.players.length }).map((_, i) => <div className="captain empty" key={i}>Open berth</div>)}</div><button disabled={game.players.length !== 4} onClick={() => run(() => request('/game/start-draft'))}>Begin port draft</button></section>}
      {game.phase !== 'lobby' && <section className="panel board-panel"><h2>{game.phase === 'draft' ? `${activePlayer?.name}'s pick` : `${activePlayer?.name}'s turn`}</h2><p>{game.phase === 'draft' ? 'Choose an unclaimed port on the map.' : `Turn ${game.turnNumber} · ${game.remainingActions} action${game.remainingActions === 1 ? '' : 's'} remaining${game.lastRoll ? ` · Last roll: ${game.lastRoll}` : ''}${game.remainingMovement ? ` · Select a ship, then move ${game.remainingMovement} hexes` : ''}`}</p>{combat && <div className="combat"><strong>Ship battle</strong>{Object.entries(combat.rolls).map(([playerId, rolls]) => <span key={playerId}>{game.players.find(player => player.id === playerId)?.name}: {rolls.join(', ')}</span>)}{combat.status === 'awaiting-roll' && activePlayer && <button onClick={() => run(() => request('/game/combat/roll', { playerId: activePlayer.id, combatId: combat.id }))}>Roll combat dice</button>}{combat.status === 'choose-loss' && <><p>{game.players.find(player => player.id === combat.losingPlayerId)?.name} must remove a ship.</p>{game.ships.filter(ship => ship.ownerId === combat.losingPlayerId && combat.participantShipIds.includes(ship.id)).map(ship => <button key={ship.id} onClick={() => combat.losingPlayerId && run(() => request('/game/combat/remove-ship', { playerId: combat.losingPlayerId, combatId: combat.id, shipId: ship.id }))}>Remove ship</button>)}</>}</div>}{game.phase === 'playing' && activePlayer && <div className="turn-controls"><button onClick={() => run(() => request('/game/roll-movement', { playerId: activePlayer.id }))} disabled={game.remainingActions === 0 || game.remainingMovement > 0 || !!combat}>Roll movement</button><button className="end-turn" onClick={() => run(() => request('/game/end-turn', { playerId: activePlayer.id }))}>End turn</button></div>}<div className="board" onClick={moveToBoardHex}> <img src="/api/board-image" alt="Original Marauders board" />{game.ports.map((port, index) => { const owner = game.players.find(player => player.id === port.ownerId); const [left, top] = portPositions[index]; return <button key={port.id} className="map-port" title={`${port.name}: ${owner?.name ?? 'Unclaimed'}`} style={{ left: `${left}%`, top: `${top}%`, '--owner': owner?.color ?? '#101820' } as React.CSSProperties} disabled={game.phase !== 'draft' || !!owner} onClick={() => activePlayer && run(() => request('/game/draft', { playerId: activePlayer.id, portId: port.id }))}>{index + 1}</button> })}{game.ships.map(ship => { const owner = game.players.find(player => player.id === ship.ownerId); const position = hexToPosition(ship.q, ship.r); const selectable = game.phase === 'playing' && ship.ownerId === activePlayer?.id && game.remainingMovement > 0 && !combat; return <button className={`ship ${selectedShipId === ship.id ? 'selected' : ''}`} key={ship.id} title={`${owner?.name}'s ship`} disabled={!selectable} onClick={event => { event.stopPropagation(); setSelectedShipId(ship.id) }} style={{ left: `${position.left}%`, top: `${position.top}%`, background: owner?.color }} /> })}</div><div className="port-legend">{game.ports.map((port, index) => { const owner = game.players.find(player => player.id === port.ownerId); return <span key={port.id}><b>{index + 1}</b> {owner?.name ?? 'Unclaimed'}</span> })}</div></section>}
      {game.phase === 'playing' && activePlayer && game.isBuildPhase && <div className="build-phase"><strong>Build phase: {game.availableBuilds} ship{game.availableBuilds === 1 ? '' : 's'} may be started</strong>{game.ports.filter(port => port.ownerId === activePlayer.id).map(port => <button key={port.id} disabled={game.availableBuilds === 0} onClick={() => run(() => request('/game/start-construction', { playerId: activePlayer.id, portId: port.id }))}>Build at {port.name}</button>)}<button onClick={() => run(() => request('/game/end-turn', { playerId: activePlayer.id }))}>Finish round</button></div>}
      {game.phase === 'playing' && activePlayer && <div className="fleet">{game.ships.filter(ship => ship.ownerId === activePlayer.id).map(ship => <button key={ship.id} className={selectedShipId === ship.id ? 'selected-fleet' : ''} onClick={() => setSelectedShipId(ship.id)}>Ship {ship.q}, {ship.r}</button>)}</div>}
      {game.phase === 'playing' && activePlayer && selectedShip && attackTarget && <button className="attack-port" disabled={game.remainingActions === 0 || !!combat} onClick={() => run(() => request('/game/attack-port', { playerId: activePlayer.id, shipId: selectedShip.id, portId: attackTarget.id }))}>Attack {attackTarget.name}</button>}
      <button className="reset" onClick={() => run(() => request('/game/reset'))}>Reset game</button>
    </>}
  </main>
}
export default App
