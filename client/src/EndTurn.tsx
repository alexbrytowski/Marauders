import { useEffect, useId, useRef, useState } from 'react'
import type { Command, Game } from './game'

export function EndTurn({
  game,
  disabled,
  act,
}: {
  game: Game
  disabled: boolean
  act: (command: Command) => Promise<boolean>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [review, setReview] = useState<Game | null>(null)
  const [failed, setFailed] = useState(false)
  const currentReview = review?.id === game.id && review?.revision === game.revision
  const unfinished = game.isBuildPhase
    ? game.availableBuilds > 0
    : game.remainingActions > 0 || game.remainingMovement > 0

  useEffect(() => {
    if (currentReview && !dialog.current?.open) dialog.current?.showModal()
    if (!currentReview) dialog.current?.close()
  }, [currentReview])

  return (
    <>
      <button
        className="secondary"
        disabled={disabled}
        onClick={() => {
          if (unfinished) {
            setFailed(false)
            setReview(game)
          } else {
            void act({ type: 'end-turn', expectedRevision: game.revision })
          }
        }}
      >
        {game.isBuildPhase ? 'Finish round →' : 'End actions'}
      </button>
      <dialog
        ref={dialog}
        className="end-turn-dialog"
        aria-labelledby={titleId}
        onCancel={() => setReview(null)}
        onClose={() => setReview(null)}
      >
        <h2 id={titleId}>{review?.isBuildPhase ? 'Finish this round?' : 'End actions early?'}</h2>
        {review?.isBuildPhase ? (
          <>
            <p>
              You still have {review.availableBuilds} {review.availableBuilds === 1 ? 'ship' : 'ships'}{' '}
              without a chosen build port.
            </p>
            <p>Any unassigned builds will start at randomly chosen ports you own.</p>
          </>
        ) : (
          <>
            <p>You still have:</p>
            <ul>
              {!!review && review.remainingActions > 0 && (
                <li>
                  {review.remainingActions} unused action {review.remainingActions === 1 ? 'die' : 'dice'}
                </li>
              )}
              {!!review && review.remainingMovement > 0 && (
                <li>
                  {review.remainingMovement} movement {review.remainingMovement === 1 ? 'point' : 'points'}
                </li>
              )}
            </ul>
            <p>Ending actions gives up your remaining dice and movement for this round.</p>
          </>
        )}
        {failed && <p role="alert">Could not end the round. Check your connection and try again.</p>}
        <div className="end-turn-actions">
          <button className="secondary" autoFocus onClick={() => setReview(null)}>
            Keep playing
          </button>
          <button
            className="danger-button"
            disabled={disabled || !currentReview}
            onClick={async () => {
              if (!review || !currentReview || disabled) return
              const ok = await act({ type: 'end-turn', expectedRevision: review.revision })
              if (ok) setReview(null)
              else setFailed(true)
            }}
          >
            {review?.isBuildPhase ? 'Finish round anyway' : 'End actions anyway'}
          </button>
        </div>
      </dialog>
    </>
  )
}
