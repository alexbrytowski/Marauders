import { useState } from 'react'
import type { Game } from './game'

export function AboutPage() {
  return (
    <article className="info-page">
      <span className="eyebrow">THE STORY BEHIND THE SEA</span>
      <h1>About Marauders</h1>
      <p>
        Marauders is a four-player pirate strategy game about capturing ports, building fleets, and choosing
        when to risk a battle. Capture every remaining port to win, or outlast captains who forfeit.
      </p>
      <p>
        This version brings our physical hex-board game online so friends can play together. Every captain
        sees the same board, battles, and public dice rolls. Extra visitors can watch the voyage.
      </p>
      <h2>Your crew, your character</h2>
      <p>
        Choose a name, crew color, and one of eight cosmetic profiles. Personal character names and portraits
        are coming from the crew. Perks belong to ships and are collected at sea.
      </p>
      <h2>One shared game</h2>
      <p>
        Your browser remembers your seat. Another tab in the same browser controls the same captain; use a
        different browser profile or device for another player. The server saves the voyage so it can continue
        after a restart.
      </p>
      <p>
        <a href="#how-to-play">Learn how to play →</a>
      </p>
    </article>
  )
}

export function ControllerPage({
  game,
  enabled,
  disabled,
  send,
}: {
  game: Game
  enabled: boolean
  disabled: boolean
  send: (path: string, body: object) => Promise<boolean>
}) {
  const [password, setPassword] = useState('')
  const [releaseSeats, setReleaseSeats] = useState(false)
  const [review, setReview] = useState<{
    gameId: string
    expectedRevision: number
    releaseSeats: boolean
  } | null>(null)
  const [message, setMessage] = useState('')
  return (
    <section className="info-page controller-page">
      <span className="eyebrow">GAME CONTROLLER</span>
      <h1>Start a new voyage</h1>
      <p>
        The reset password works from any browser, even if the original host is unavailable. The previous game
        is archived on the server before resetting.
      </p>
      {!enabled ? (
        <p role="status">
          Reset is unavailable until the server owner configures a password. See the setup instructions in the
          project README.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setMessage('')
            setReview({ gameId: game.id, expectedRevision: game.revision, releaseSeats })
          }}
        >
          <label htmlFor="reset-password">Reset password</label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setReview(null)
            }}
            autoComplete="off"
            maxLength={1024}
            required
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={releaseSeats}
              onChange={(e) => {
                setReleaseSeats(e.target.checked)
                setReview(null)
              }}
            />
            Release all seats so a new crew can join
          </label>
          <p>
            {releaseSeats
              ? 'This clears the game and all four browser seats.'
              : 'This clears the game and keeps the current captains in the lobby.'}
          </p>
          {!review ? (
            <button className="secondary" disabled={disabled || !password}>
              Review reset
            </button>
          ) : (
            <div className="reset-review" role="group" aria-label="Confirm game reset">
              <p>
                Reset this voyage{review.releaseSeats ? ' and release all seats' : ' with the same crew'}?
                Ships, ports, perks, and history will start fresh.
              </p>
              <button
                type="button"
                className="danger-button"
                disabled={disabled}
                onClick={() => {
                  const request = { ...review, password }
                  setPassword('')
                  setReview(null)
                  void send('/api/game/reset', request).then((ok) => {
                    if (ok)
                      setMessage('The game has been reset. Return to the voyage to join or begin the draft.')
                  })
                }}
              >
                Confirm reset
              </button>
              <button type="button" onClick={() => setReview(null)}>
                Cancel
              </button>
            </div>
          )}
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        <a href="#game">Return to the voyage →</a>
      </p>
    </section>
  )
}
