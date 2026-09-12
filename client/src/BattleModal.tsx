import { useEffect, useRef, useState } from 'react'
import { Die, Icon } from './Icons'
import { BattleMap } from './BattleMap'
import { RollingDie } from './RollingDie'
import type { Board, Command, Game } from './game'
import { perks } from './game'
import { LeaveGame } from './LeaveGame'

export function BattleModal({
  game,
  board,
  rolling,
  playerId,
  busy,
  act,
  error,
}: {
  game: Game
  board: Board
  rolling: boolean
  playerId: string | null
  busy: boolean
  act: (command: Command) => Promise<boolean>
  error: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selection, setSelection] = useState({ exchange: '', id: '' })
  const open = !!game.combat || game.combatChoices.length > 0
  useEffect(() => {
    const node = dialog.current
    if (open && node && !node.open) node.showModal()
    if (!open && node?.open) node.close()
  }, [open])
  const battle = game.combat,
    active = playerId === game.activePlayerId
  const exchange = `${battle?.id}-${battle?.round}`
  const selected =
    selection.exchange === exchange
      ? game.ships.find(
          (ship) =>
            ship.id === selection.id &&
            battle?.participantShipIds.includes(ship.id) &&
            ship.ownerId === battle.losingPlayerId,
        )
      : undefined
  const canChoose = battle?.status === 'choose-loss' && battle.losingPlayerId === playerId && !busy
  const selectLoss = (id: string) => setSelection({ exchange, id })
  const shipsFor = (id: string) =>
    game.ships.filter((ship) => ship.ownerId === id && battle?.participantShipIds.includes(ship.id))
  const fleet = (id: string) => (
    <div className="battle-fleet">
      {shipsFor(id).map((s) => (
        <button
          key={s.id}
          disabled={!canChoose || s.ownerId !== playerId}
          aria-pressed={selected?.id === s.id}
          onClick={() => selectLoss(s.id)}
        >
          Ship {s.number}
          {s.perk && ` · ${perks[s.perk]?.name}`}
          {s.id === battle?.triggerShipId || s.id === battle?.opponentShipId ? ' · trigger' : ' · helper'}
        </button>
      ))}
    </div>
  )
  const side = (id: string, defending: boolean) => {
    const player = game.players.find((p) => p.id === id)
    const ships = shipsFor(id)
    const port = battle?.kind === 'port' && defending ? game.ports.find((p) => p.id === battle.portId) : null
    const support =
      battle?.supportingPortIds.filter((portId) => game.ports.find((p) => p.id === portId)?.ownerId === id)
        .length ?? 0
    return (
      <section
        className="battle-side"
        style={{ '--crew': player?.color ?? '#d3c8ad' } as React.CSSProperties}
      >
        <span className="battle-side-role">{defending ? 'DEFENDING' : 'ATTACKING'}</span>
        <div className="battle-crest">
          <Icon name={port ? 'port' : 'ship'} />
        </div>
        <h3>{port?.name ?? player?.name ?? 'Unclaimed port'}</h3>
        <p>
          {port
            ? '1 port die'
            : `${ships.length} ship${ships.length === 1 ? '' : 's'} · ${ships.length + support} ${ships.length + support === 1 ? 'die' : 'dice'}`}
          {support > 0 && ' (includes harbor defense)'}
        </p>
        <div className="battle-dice" key={`${battle?.id}-${battle?.round}`}>
          {rolling ? (
            <>
              {ships.map((ship) => (
                <RollingDie key={ship.id} glass={ship.perk === 'glass-cannon'} />
              ))}
              {Array.from({ length: port ? 1 : support }, (_, i) => (
                <RollingDie key={`port-${i}`} />
              ))}
            </>
          ) : battle?.rolls[id]?.length ? (
            battle.rolls[id].map((value, i) => <Die key={i} value={value} />)
          ) : (
            <span className="awaiting-dice">Awaiting the roll</span>
          )}
        </div>
        {port && battle!.defenseModifier !== 0 && (
          <span className="defense-modifier">Port defense modifier: {battle!.defenseModifier}</span>
        )}
        {!port && (
          fleet(id)
        )}
      </section>
    )
  }
  const currentBlackWhiteHolder = battle
    ? game.ships.find(
        (ship) => battle.participantShipIds.includes(ship.id) && ship.perk === 'black-and-white',
      )
    : undefined
  const blackWhiteOwnerId =
    battle?.status === 'awaiting-roll'
      ? (currentBlackWhiteHolder?.ownerId ?? null)
      : (battle?.blackWhiteOwnerId ?? currentBlackWhiteHolder?.ownerId ?? null)
  const blackWhiteActive = !!blackWhiteOwnerId
  const opposingBlackWhiteId =
    battle && blackWhiteOwnerId
      ? blackWhiteOwnerId === battle.attackerId
        ? battle.defenderId
        : battle.attackerId
      : null
  const combatantName = (id: string | null) =>
    game.players.find((player) => player.id === id)?.name ??
    game.ports.find((port) => port.id === battle?.portId && (port.ownerId ?? port.id) === id)?.name ??
    'Unclaimed port'
  return (
    <dialog
      ref={dialog}
      className="battle-modal"
      aria-labelledby="battle-title"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="battle-topline">
        <LeaveGame game={game} playerId={playerId} disabled={busy} act={act} />
        <a href="#controller">Game controller</a>
        <span>
          <Icon name="eye" /> LIVE · ALL CAPTAINS WATCHING
        </span>
        <span>{battle ? `EXCHANGE ${Math.max(1, battle.round)}` : 'MULTIPLE ENCOUNTERS'}</span>
      </div>
      <div className="battle-title">
        <Icon name="battle" />
        <h2 id="battle-title">
          {battle?.kind === 'port'
            ? 'Siege of the harbor'
            : battle
              ? 'Battle on the high seas'
              : 'Choose your battle'}
        </h2>
        <p>
          {blackWhiteActive
            ? 'One black-or-white draw decides this exchange.'
            : battle?.portId
            ? game.ports.find((p) => p.id === battle.portId)?.name
            : 'Every roll is public. Highest die wins.'}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!battle ? (
        <div className="encounter-list">
          {game.combatChoices.map((choice) => {
            const a = game.ships.find((s) => s.id === choice.triggerShipId),
              b = game.ships.find((s) => s.id === choice.opponentShipId)
            return (
              <button
                key={choice.id}
                disabled={!active || busy}
                onClick={() => void act({ type: 'choose-combat', choiceId: choice.id })}
              >
                {game.players.find((p) => p.id === a?.ownerId)?.name} #{a?.number} <span>vs.</span>{' '}
                {game.players.find((p) => p.id === b?.ownerId)?.name} #{b?.number}
              </button>
            )
          })}
          {!active && <p>The active captain is choosing which encounter resolves first.</p>}
        </div>
      ) : (
        <>
          <BattleMap
            game={game}
            board={board}
            canChoose={!!canChoose}
            selectedId={selected?.id ?? null}
            onSelect={selectLoss}
          />
          {blackWhiteActive ? (
            <section className="black-white-battle" aria-label="Black and White battle override">
              <span className="black-white-kicker">BLACK AND WHITE OVERRIDES THE DICE</span>
              <h3>One draw. Equal odds.</h3>
              <p>Every numbered die and port modifier is set aside for this exchange.</p>
              <div
                className={`black-white-token ${rolling ? 'rolling' : (battle.blackWhiteResult ?? 'ready')}`}
                role="img"
                aria-label={
                  rolling
                    ? 'Drawing black or white'
                    : battle.blackWhiteResult
                      ? `${battle.blackWhiteResult} was drawn`
                      : 'Black and white token ready'
                }
              >
                <span>{rolling ? '' : battle.blackWhiteResult?.toUpperCase() || 'B / W'}</span>
              </div>
              <div className="black-white-odds">
                <div>
                  <strong>BLACK</strong>
                  <span>{combatantName(blackWhiteOwnerId)} wins</span>
                  {blackWhiteOwnerId && fleet(blackWhiteOwnerId)}
                </div>
                <div>
                  <strong>WHITE</strong>
                  <span>{combatantName(opposingBlackWhiteId)} wins</span>
                  {opposingBlackWhiteId && fleet(opposingBlackWhiteId)}
                </div>
              </div>
            </section>
          ) : (
            <div className="battle-sides">
              {side(battle.attackerId, false)}
              <span className="versus">VS</span>
              {side(battle.defenderId, true)}
            </div>
          )}
          <div className="battle-result" role="status">
            {rolling
              ? blackWhiteActive
                ? 'Drawing black or white…'
                : 'Rolling the battle dice…'
              : battle.message}
          </div>
          <div className="battle-actions">
            {battle.status === 'awaiting-roll' &&
              (active ? (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act({ type: 'roll-combat', combatId: battle.id })}
                >
                  <Icon name="dice" />
                  {blackWhiteActive
                    ? battle.round
                      ? 'Draw next exchange'
                      : 'Draw black or white'
                    : battle.round
                      ? 'Roll next exchange'
                      : 'Roll battle dice'}
                </button>
              ) : (
                <p>Waiting for {game.players.find((p) => p.id === game.activePlayerId)?.name} to roll.</p>
              ))}
            {battle.status === 'choose-loss' &&
              (battle.losingPlayerId === playerId ? (
                <>
                  <p>Choose one of your participating ships on the battle map or in your fleet below it.</p>
                  <div className="casualty-options">
                    <button
                      disabled={busy || !selected}
                      onClick={() =>
                        selected &&
                        void act({ type: 'remove-ship', combatId: battle.id, shipId: selected.id })
                      }
                    >
                      <Icon name="ship" /> {selected ? `Lose ship ${selected.number}` : 'Select a casualty'}
                    </button>
                  </div>
                </>
              ) : (
                <p>
                  Waiting for {game.players.find((p) => p.id === battle.losingPlayerId)?.name} to choose a
                  casualty.
                </p>
              ))}
            {battle.status === 'resolved' &&
              (active ? (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act({ type: 'continue-combat', combatId: battle.id })}
                >
                  Continue {game.phase === 'finished' ? 'to victory' : 'the voyage'} →
                </button>
              ) : (
                <p>Waiting for the active captain to continue.</p>
              ))}
          </div>
        </>
      )}
      <p className="battle-note">
        Ties reroll. Helpers never chain. Battle results remain in the captain’s log.
      </p>
    </dialog>
  )
}
