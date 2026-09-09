import { useState } from 'react'
import type { Game } from './game'

export function AboutPage() {
  return (
    <article className="info-page">
      <span className="eyebrow">THE STORY BEHIND THE SEA</span>
      <h1>About Marauders</h1>
      <p>
        Marauders is a four-player pirate strategy game about capturing ports, building fleets, and choosing
        when to risk a battle. Capture all thirteen ports to win.
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

export function HowToPlayPage() {
  return (
    <article className="info-page">
      <span className="eyebrow">THE CAPTAIN’S HANDBOOK</span>
      <h1>How to play</h1>
      <p>Four captains. Thirteen ports. Own every port to win.</p>
      <h2>1. Assemble the crew</h2>
      <p>
        Enter your name and choose a color and character. Four separate browser profiles or devices fill the
        seats; additional visitors are spectators. The host chooses who drafts first.
      </p>
      <p>
        Vote for Classic, The Narrows, or Shattered Isles in the lobby. Each captain gets one vote and can
        change it before the draft. The server draws one ticket per vote: three votes versus one means 75%
        versus 25%, not a guaranteed majority win. If nobody votes, all three maps have equal chances. Every
        map has thirteen ports and uses the same rules.
      </p>
      <h2>2. Claim ports and deploy</h2>
      <p>
        Pick ports in a snake draft: first to fourth, fourth to first, then first to fourth. Each captain gets
        three ports; one stays unclaimed. Select each owned port and place two ships in its empty dark-blue
        harbor cells, then choose Fleet ready.
      </p>
      <h2>3. Use your action dice</h2>
      <p>
        Your fleet grants 1 action die for 1–3 ships, 2 for 4–7, 3 for 8–11, and one more for each additional
        four ships. A die can roll movement or buy a port attack.
      </p>
      <p>
        Choose Roll to sail, select your ship, select an empty highlighted water hex, and confirm the route.
        Split the roll’s movement across your ships. You cannot cross land or occupied cells. Combat stops a
        route, but unused movement remains afterward. Pass movement to give up the remainder.
      </p>
      <h2>4. Resolve ship battles</h2>
      <p>
        Enemy ships fight automatically when adjacent or sharing a port’s dark-blue harbor. When several
        encounters are possible, the active captain chooses one first. Allies within two hexes of their own
        triggering ship help; assistance does not chain through helpers.
      </p>
      <p>
        Each participating ship rolls one combat die. A harbor can add one die for its owner. Compare each
        side’s highest result; ties reroll. The losing captain chooses a participating ship to lose. Removing
        a helper can leave the battle going. The port itself is never a ship-battle casualty.
      </p>
      <h2>5. Attack a port</h2>
      <p>
        Select your ship in an enemy or unclaimed port’s dark-blue harbor and choose Attack using an unused
        action. Resolve enemy ships first. The port rolls one die against your participating ships. On a
        defense win, no attacker dies; the port’s future defense loses 1, cumulatively. An allied ship
        entering its harbor restores its defense. Unclaimed ports have no allies to restore them.
      </p>
      <p>
        A capture transfers the port and cancels its construction. Taking a captain’s last port also recruits
        every surviving ship in their fleet. Capturing all thirteen ports ends the game.
      </p>
      <h2>6. Rebuild at round end</h2>
      <p>
        Each port supports two ships. At the end of your round, begin construction for any missing ships at
        chosen owned ports. Existing ships plus construction count toward the cap. Multiple ships can build at
        one port; builds cannot move between ports.
      </p>
      <p>
        Normally a ship launches at the end of the second future owner round and can move on the following
        round. It uses empty harbor water first, then the nearest available open sea if needed. Losing ports
        never removes existing ships just for exceeding the cap.
      </p>
      <h2>7. Collect perks</h2>
      <p>
        Four pickups appear in spread-out open-water locations when play begins. Sail through one to collect
        it. Each ship carries one perk, with no fleet limit. A ship with a perk passes other pickups.
        Destroyed ships drop their perk at their hex.
      </p>
      <ul>
        <li>
          <strong>The Black Pearl:</strong> a 7.5% chance to recruit an enemy casualty when the holder
          participates on the winning side. The recruit stays in place, keeps its perk, and adds no
          current-round actions.
        </li>
        <li>
          <strong>Glass Cannon:</strong> combat results are equally likely from 0 through 8. High reward, with
          a chance of zero.
        </li>
        <li>
          <strong>Loaded Dice:</strong> the holder’s combat rolls of 1 or 2 become 3.
        </li>
        <li>
          <strong>The Architect:</strong> while in an owned port’s dark-blue harbor, construction there
          advances twice as fast. It affects only that port, does not stack, and cannot launch a newly started
          build immediately.
        </li>
      </ul>
      <p>
        Combat perks also work for helpers and port attackers. Movement and port defense remain ordinary
        six-sided rolls.
      </p>
      <h2>Clocks, controls, and the final tally</h2>
      <p>
        The round and action countdowns are visible. If either expires, the server resolves pending combat
        with automatic casualty choices and ends the round, including due construction. Default limits are 120
        seconds per round and 45 per action.
      </p>
      <p>
        Use the map’s arrow keys and Enter or Space to select cells. Zoom in for touch play. Your fleet and
        port tabs help locate pieces. Every completed captain round records each team’s ships and ports for
        the victory screen.
      </p>
      <p>
        <a href="#game">Return to the voyage →</a>
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
