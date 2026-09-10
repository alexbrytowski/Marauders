import { useEffect, useRef, useState } from 'react'
import { Die, Icon } from './Icons'
import { BattleMap } from './BattleMap'
import { RollingDie } from './RollingDie'
import type { Board, Command, Game } from './game'
import { perks } from './game'

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
  const side = (id: string, defending: boolean) => {
    const player = game.players.find((p) => p.id === id)
    const ships = game.ships.filter((s) => s.ownerId === id && battle?.participantShipIds.includes(s.id))
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
          <div className="battle-fleet">
            {ships.map((s) => (
              <button
                key={s.id}
                disabled={!canChoose || s.ownerId !== playerId}
                aria-pressed={selected?.id === s.id}
                onClick={() => selectLoss(s.id)}
              >
                Ship {s.number}
                {s.perk && ` · ${perks[s.perk]?.name}`}
                {s.id === battle?.triggerShipId || s.id === battle?.opponentShipId
                  ? ' · trigger'
                  : ' · helper'}
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }
  return (
    <dialog
      ref={dialog}
      className="battle-modal"
      aria-labelledby="battle-title"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="battle-topline">
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
          {battle?.portId
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
          <div className="battle-sides">
            {side(battle.attackerId, false)}
            <span className="versus">VS</span>
            {side(battle.defenderId, true)}
          </div>
          <div className="battle-result" role="status">
            {rolling ? 'Rolling the battle dice…' : battle.message}
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
                  {battle.round ? 'Roll next exchange' : 'Roll battle dice'}
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
