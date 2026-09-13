import { useEffect, useId, useRef, useState } from 'react'
import type { Command, Game } from './game'

export function LeaveGame({
  game,
  playerId,
  disabled,
  act,
}: {
  game: Game
  playerId: string | null
  disabled: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [review, setReview] = useState<Game | null>(null)
  const [failed, setFailed] = useState(false)
  const captain = game.players.find((p) => p.id === playerId && !p.hasForfeited)
  const leaving = game.phase === 'lobby' || game.phase === 'finished'
  useEffect(() => {
    if (review && captain && !dialog.current?.open) dialog.current?.showModal()
    if (!review || !captain) dialog.current?.close()
  }, [review, captain])
  if (!captain) return null
  const stale = review?.revision !== game.revision || review?.id !== game.id
  return (
    <>
      <button
        className="leave-game"
        disabled={disabled}
        onClick={() => {
          setFailed(false)
          setReview(game)
        }}
      >
        {leaving ? 'Leave game' : 'Forfeit and leave'}
      </button>
      <dialog
        ref={dialog}
        className="leave-dialog"
        aria-labelledby={titleId}
        onCancel={() => setReview(null)}
      >
        <h2 id={titleId}>{leaving ? 'Leave the game?' : 'Forfeit this voyage?'}</h2>
        <p>
          {leaving
            ? game.phase === 'lobby'
              ? 'Release your seat and map vote. You can join again while the lobby has room.'
              : 'Release your seat and return to watching. The final result stays saved.'
            : `${captain.name}, your ${review?.ports.filter((p) => p.ownerId === playerId).length ?? 0} ports will become neutral with full defense. Your ${review?.ships.filter((s) => s.ownerId === playerId).length ?? 0} ships, carried perks, and all construction will vanish. You cannot rejoin this match as a captain.`}
        </p>
        {stale && <p role="status">The game changed. Review the latest state before confirming.</p>}
        {failed && !stale && <p role="alert">Leaving failed. Check your connection and try again.</p>}
        <div className="leave-actions">
          <button className="secondary" onClick={() => setReview(null)}>
            Keep playing
          </button>
          {stale ? (
            <button
              className="primary"
              onClick={() => {
                setReview(game)
                setFailed(false)
              }}
            >
              Review latest state
            </button>
          ) : (
            <button
              className="danger-button"
              disabled={disabled}
              onClick={async () => {
                const ok = await act({ type: 'forfeit', expectedRevision: review!.revision })
                if (ok) setReview(null)
                else setFailed(true)
              }}
            >
              {leaving ? 'Confirm leave' : 'Confirm forfeit'}
            </button>
          )}
        </div>
      </dialog>
    </>
  )
}
