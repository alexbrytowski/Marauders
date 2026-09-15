import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ShipPiece, PortPiece } from './BoardPieces'
import { Die, Icon } from './Icons'
import { actionCount, colors, distance, key, perks, portNumber } from './game'
import type { Board, Hex } from './game'
import { outline, point } from './boardGeometry'
import './HowToPlayPage.css'

const chapters = [
  { id: 'basics', title: 'Meet the board', level: 'Start here', icon: 'compass' },
  { id: 'setup', title: 'Ready, deal, launch', level: 'Getting started', icon: 'flag' },
  { id: 'sailing', title: 'Take your turn', level: 'The essentials', icon: 'ship' },
  { id: 'battles', title: 'Fight ship battles', level: 'The essentials', icon: 'battle' },
  { id: 'ports', title: 'Capture a port', level: 'Build your strategy', icon: 'port' },
  { id: 'building', title: 'Rebuild your fleet', level: 'Build your strategy', icon: 'hammer' },
  { id: 'perks', title: 'Find an advantage', level: 'Advanced', icon: 'dice' },
  { id: 'extras', title: 'Know the finer points', level: 'Advanced', icon: 'log' },
]

function Lesson({
  visual,
  children,
  takeaway,
}: {
  visual: ReactNode
  children: ReactNode
  takeaway: string
}) {
  return (
    <>
      <div className="lesson-grid">
        <div className="lesson-visual">{visual}</div>
        <div className="lesson-copy">{children}</div>
      </div>
      <p className="lesson-takeaway">
        <Icon name="compass" />
        <span>
          <strong>Remember this</strong>
          {takeaway}
        </span>
      </p>
    </>
  )
}

type ExampleShip = Hex & { number: number; color: string }

// Teaching positions are placed on real Classic terrain. No live state or commands enter these examples.
function TeachingChart({
  board,
  scene = 'harbor',
  moves = [0, 0],
  lost,
  captured = false,
  highlight,
  onTerrain,
}: {
  board?: Board
  scene?: 'harbor' | 'sailing' | 'battle'
  moves?: number[]
  lost?: number
  captured?: boolean
  highlight?: string
  onTerrain?: (terrain: string) => void
}) {
  if (!board)
    return (
      <div className="lesson-map-loading">Loading the Classic chart… The rules below are available now.</div>
    )
  const water = new Set(board.cells.filter((c) => c.terrain === 'water').map(key))
  const center =
    scene === 'harbor'
      ? board.cells.find((c) => c.portId === 'port-1')
      : board.cells.find((c) =>
          Array.from({ length: 9 }, (_, i) => i - 4).every((q) =>
            [-1, 0, 1].every((r) => water.has(key({ q: c.q + q, r: c.r + r }))),
          ),
        )
  if (!center) return <p>The example chart is unavailable.</p>
  const cells = board.cells.filter((c) =>
    scene === 'harbor'
      ? distance(c, center) <= 3
      : c.q >= center.q - 4 && c.q <= center.q + 4 && c.r >= center.r - 1 && c.r <= center.r + 1,
  )
  const harbor = cells.filter((c) => c.harborId === center.portId)
  const ships: ExampleShip[] =
    scene === 'harbor'
      ? harbor.slice(0, 2).map((c, i) => ({ ...c, number: i + 1, color: colors[0] }))
      : scene === 'sailing'
        ? [
            { q: center.q - 3 + moves[0], r: center.r - 1, number: 1, color: colors[0] },
            { q: center.q - 3 + moves[1], r: center.r + 1, number: 2, color: colors[0] },
          ]
        : [
            { ...center, number: 1, color: colors[0] },
            { q: center.q - 2, r: center.r, number: 2, color: colors[0] },
            { q: center.q + 1, r: center.r, number: 3, color: colors[1] },
            { q: center.q - 4, r: center.r, number: 4, color: colors[0] },
          ].filter((s) => s.number !== lost)
  const points = cells.map(point)
  const left = Math.min(...points.map((p) => p.x)) - 20,
    top = Math.min(...points.map((p) => p.y)) - 25
  const width = Math.max(...points.map((p) => p.x)) - left + 20,
    height = Math.max(...points.map((p) => p.y)) - top + 25
  const terrainName: Record<string, string> = {
    water: 'Open water',
    harbor: 'Dark-blue harbor',
    port: 'Port',
    land: 'Land',
  }
  return (
    <figure className="teaching-chart">
      <svg
        viewBox={`${left} ${top} ${width} ${height}`}
        role={onTerrain ? 'group' : 'img'}
        aria-label={
          scene === 'harbor'
            ? 'Classic harbor with a port and two ships'
            : scene === 'sailing'
              ? 'Two ships sharing a movement roll on Classic water'
              : 'Battle: ships 1 and 3 trigger; ship 2 helps ship 1; ship 4 is too far away'
        }
      >
        {cells.map((c) => {
          const p = point(c),
            ship = ships.find((s) => key(s) === key(c))
          const label = ship
            ? `Ship ${ship.number} in ${terrainName[c.terrain].toLowerCase()}`
            : `${terrainName[c.terrain]} at ${key(c)}`
          const activate = () => onTerrain?.(ship ? 'ship' : c.terrain)
          return (
            <g
              key={key(c)}
              transform={`translate(${p.x} ${p.y})`}
              className={`hex ${c.terrain} ${highlight === (ship ? 'ship' : c.terrain) ? 'selected-hex' : ''}`}
              role={onTerrain ? 'button' : undefined}
              tabIndex={onTerrain ? 0 : undefined}
              aria-label={onTerrain ? label : undefined}
              onClick={activate}
              onKeyDown={(e) => {
                if (onTerrain && ['Enter', ' '].includes(e.key)) {
                  e.preventDefault()
                  activate()
                }
              }}
            >
              <title>{label}</title>
              <polygon points={outline} />
              {c.terrain === 'harbor' && !ship && <circle r="2" className="harbor-dot" />}
              {c.portId && (
                <PortPiece number={portNumber(c.portId)} color={captured ? colors[0] : colors[1]} />
              )}
              {ship && <ShipPiece color={ship.color} number={ship.number} selected={highlight === 'ship'} />}
            </g>
          )
        })}
      </svg>
      <figcaption>Classic map · actual game pieces · practice example</figcaption>
    </figure>
  )
}

function Basics({ board }: { board?: Board }) {
  const [selected, setSelected] = useState('ship')
  const pieces = [
    {
      id: 'ship',
      name: 'Ships',
      text: 'Your numbered, crew-colored ships sail over water and fight for ports.',
    },
    {
      id: 'port',
      name: 'Ports',
      text: 'The fortress tokens are ports. Their color shows who owns them. Each port supports two ships.',
    },
    {
      id: 'harbor',
      name: 'Harbors',
      text: 'Dark-blue water belongs to a port’s harbor. Your ships must be here to attack or defend that port.',
    },
    {
      id: 'water',
      name: 'Open water',
      text: 'Blue hexes are the sea. Sail through empty water, one hex at a time.',
    },
    {
      id: 'land',
      name: 'Land',
      text: 'Green and tan hexes are land. Ships cannot sail onto or through them.',
    },
  ]
  return (
    <Lesson
      takeaway="Ports are your goal. Ships are how you get there."
      visual={
        <>
          <TeachingChart board={board} highlight={selected} onTerrain={setSelected} />
          <div className="lesson-chips" aria-label="Inspect game pieces">
            {pieces.map((p) => (
              <button key={p.id} aria-pressed={selected === p.id} onClick={() => setSelected(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          <p className="example-feedback" role="status">
            {pieces.find((p) => p.id === selected)?.text}
          </p>
        </>
      }
    >
      <h3>Four captains. Thirteen ports.</h3>
      <p>Command a pirate fleet, capture ports, and become ruler of the sea.</p>
      <ul>
        <li>
          <strong>Win when you are the only captain who owns ports.</strong>
        </li>
        <li>Capturing the last opponent’s port or their forfeit ends the game. Neutral ports can remain.</li>
        <li>Your crew color marks your ships and ports.</li>
      </ul>
      <p>Try selecting a piece or a terrain type on the chart.</p>
    </Lesson>
  )
}

function Setup({ board }: { board?: Board }) {
  const [deal, setDeal] = useState(0)
  const orders = [
    [0, 2, 1, 3, 2, 0, 3, 1, 1, 3, 0, 2],
    [3, 1, 2, 0, 1, 3, 0, 2, 2, 0, 3, 1],
  ]
  const order = orders[deal % orders.length]
  return (
    <Lesson
      takeaway="Ready up, receive three random ports, and your six starting ships launch automatically."
      visual={
        <>
          <span className="example-label">EXAMPLE RANDOM PORT DEAL</span>
          <div className="draft-example">
            {order.map((captain, i) => (
              <span
                key={i}
                className="draft-revealed"
                style={{ '--crew': colors[captain] } as React.CSSProperties}
              >
                <small>Port {i + 1}</small>
                <b>Captain {captain + 1}</b>
              </span>
            ))}
          </div>
          <div className="example-controls">
            <button onClick={() => setDeal(deal + 1)}>Show another deal</button>
            <button onClick={() => setDeal(0)}>Reset example</button>
          </div>
          <p className="example-feedback" role="status">
            Three ports each. The most central port stays neutral. Two ships launch at every owned port.
          </p>
          <TeachingChart board={board} captured />
        </>
      }
    >
      <h3>Assemble your crew</h3>
      <ol>
        <li>
          Choose a name, an available color, and a pictured character. No duplicate characters or colors. Use
          a separate browser profile or device for each captain. Extra visitors watch.
        </li>
        <li>Vote for a map. The host chooses who takes the first turn.</li>
        <li>
          Each captain presses <strong>Ready to sail</strong>. The fourth ready draws the map, deals the
          ports, launches the ships, and starts play.
        </li>
      </ol>
      <p>
        Each captain receives three random ports and six ships. The most central port stays neutral: Blackwater
        on Classic, Northgate on The Choke, or Serpent’s Heart on Serpent’s Coil. Six perk pickups await at sea.
      </p>
      <details>
        <summary>Map votes & changing your mind</summary>
        <p>
          Each vote is one ticket: three votes versus one means 75% versus 25%, with no chance for an unvoted
          map. With no votes, all three maps have equal chances.
        </p>
        <p>
          You can undo ready before play starts. Changing your vote clears your readiness; changing the first
          captain or the crew clears everyone’s. Refreshing keeps your seat and ready status.
        </p>
      </details>
    </Lesson>
  )
}

function Sailing({ board }: { board?: Board }) {
  const [fleet, setFleet] = useState(6)
  const [started, setStarted] = useState(false)
  const [moves, setMoves] = useState([0, 0])
  const left = 5 - moves[0] - moves[1]
  return (
    <Lesson
      takeaway="One action die buys either a shared movement roll or one port attack."
      visual={
        <>
          <TeachingChart board={board} scene="sailing" moves={moves} />
          <div className="example-roll">
            <Die value={5} />
            <span>
              Example roll of 5
              <strong>{started ? `${left} movement remaining` : 'Share it between two ships'}</strong>
            </span>
          </div>
          <div className="example-controls">
            {!started ? (
              <button onClick={() => setStarted(true)}>Try a roll of 5</button>
            ) : (
              [0, 1].map((i) => (
                <button
                  key={i}
                  disabled={!left}
                  onClick={() => setMoves(moves.map((n, j) => n + (i === j ? 1 : 0)))}
                >
                  Sail ship {i + 1} one hex
                </button>
              ))
            )}
            <button
              onClick={() => {
                setStarted(false)
                setMoves([0, 0])
              }}
            >
              Reset example
            </button>
          </div>
          <p className="example-feedback" role="status">
            {started
              ? `Ship 1 sailed ${moves[0]}; ship 2 sailed ${moves[1]}. ${left} of 5 movement left.`
              : 'Try spending the same roll on different ships.'}
          </p>
        </>
      }
    >
      <h3>More ships, more actions</h3>
      <label className="fleet-slider" htmlFor="example-fleet">
        Fleet size:{' '}
        <strong>
          {fleet} ships → {actionCount(fleet)} action dice
        </strong>
      </label>
      <input
        id="example-fleet"
        type="range"
        min="1"
        max="16"
        value={fleet}
        onChange={(e) => setFleet(Number(e.target.value))}
      />
      <p>1–3 ships: 1 die. 4–6: 2 dice. 7–9: 3 dice. One action die per three ships, rounding up.</p>
      <p>Movement rolls are equally likely to be 4, 5, or 6, and appear immediately.</p>
      <ol>
        <li>
          Choose <strong>Roll to sail</strong>.
        </li>
        <li>Select a ship, select highlighted empty water, then confirm the route.</li>
        <li>
          Spend leftover movement on that ship or another. <strong>Pass movement</strong> gives up the
          remainder.
        </li>
      </ol>
      <details>
        <summary>Movement limits & clocks</summary>
        <p>
          You cannot cross land, share a hex, or sail through a ship. Combat stops your route; remaining
          movement stays available afterward. When you run out of actions or ships, you enter the end of your
          round.
        </p>
        <p>
          Default clocks give 45 seconds per action and at least 2:15 per turn. Larger fleets get one action
          interval per starting die plus one extra: five dice get 4:30. If either clock expires, your round
          ends, including due construction and automatic placement of unchosen builds.
        </p>
      </details>
    </Lesson>
  )
}

const singleExchangeOdds = [
  ['1 die', '50.00%', '30.56%', '20.83%', '15.11%', '11.38%'],
  ['2 dice', '69.44%', '50.00%', '37.32%', '28.61%', '22.36%'],
  ['3 dice', '79.17%', '62.68%', '50.00%', '40.20%', '32.55%'],
  ['4 dice', '84.89%', '71.39%', '59.80%', '50.00%', '41.78%'],
  ['5 dice', '88.62%', '77.64%', '67.45%', '58.22%', '50.00%'],
]

const fullEncounterOdds = [
  ['1 die', '50.00%', '15.28%', '3.18%', '0.48%', '0.05%'],
  ['2 dice', '84.72%', '50.00%', '20.65%', '6.25%', '1.44%'],
  ['3 dice', '96.82%', '79.35%', '50.00%', '23.84%', '8.73%'],
  ['4 dice', '99.52%', '93.75%', '76.16%', '50.00%', '25.97%'],
  ['5 dice', '99.95%', '98.56%', '91.27%', '74.03%', '50.00%'],
]

function CombatOddsTable({
  caption,
  firstColumn,
  rows,
}: {
  caption: string
  firstColumn: string
  rows: string[][]
}) {
  return (
    <div className="combat-odds-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            {[1, 2, 3, 4, 5].map((dice) => (
              <th key={dice} scope="col">
                vs {dice} {dice === 1 ? 'die' : 'dice'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([team, ...chances], rowIndex) => (
            <tr key={team}>
              <th scope="row">{team}</th>
              {chances.map((chance, columnIndex) => (
                <td key={columnIndex} className={rowIndex === columnIndex ? 'even-odds' : undefined}>
                  {chance}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Battles({ board }: { board?: Board }) {
  const [example, setExample] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [lost, setLost] = useState<number>()
  const rolls = [
    [[4, 5], [3]],
    [[1, 5], [6]],
    [[6, 6], [6]],
  ][example]
  const reset = (next: number) => {
    setExample(next)
    setRevealed(false)
    setLost(undefined)
  }
  return (
    <Lesson
      takeaway="Compare the highest die on each side, not the total. Helpers must be within two hexes of their own trigger."
      visual={
        <>
          <TeachingChart
            board={board}
            scene="battle"
            lost={lost ?? (revealed && example === 0 ? 3 : undefined)}
          />
          <p className="chart-key">
            Coral: you · Teal: enemy
            <br />1 & 3 trigger · 2 helps · 4 is too far away
          </p>
          <div className="lesson-chips" aria-label="Battle examples">
            {['Your fleet wins', 'Choose a loss', 'Tie & reroll'].map((name, i) => (
              <button key={name} aria-pressed={example === i} onClick={() => reset(i)}>
                {name}
              </button>
            ))}
          </div>
          {revealed && (
            <div className="example-dice">
              <div>
                <small>Your ships 1 & 2</small>
                {rolls[0].map((v, i) => (
                  <Die key={i} value={v} />
                ))}
              </div>
              <span>vs</span>
              <div>
                <small>Enemy ship 3</small>
                <Die value={rolls[1][0]} />
              </div>
            </div>
          )}
          <div className="example-controls">
            <button
              onClick={() => {
                if (revealed && example === 2) setExample(0)
                setRevealed(true)
              }}
              disabled={revealed && example !== 2}
            >
              {revealed && example === 2 ? 'Try the reroll example' : 'Compare example dice'}
            </button>
            {revealed &&
              example === 1 &&
              !lost &&
              [1, 2].map((n) => (
                <button key={n} onClick={() => setLost(n)}>
                  Remove ship {n}
                </button>
              ))}
            <button onClick={() => reset(example)}>Reset example</button>
          </div>
          <p className="example-feedback" role="status">
            {!revealed
              ? 'Each participating ship rolls once. Ship 4 does not help through ship 2.'
              : example === 0
                ? 'Your 5 beats their 3. The enemy’s only participating ship is removed automatically.'
                : example === 2
                  ? '6 ties 6. Two sixes do not beat one six! Both sides reroll.'
                  : lost === 2
                    ? 'Helper 2 is gone. Triggers 1 and 3 remain adjacent, so the battle continues.'
                    : lost === 1
                      ? 'Trigger 1 is gone. Ship 2 is three hexes from the enemy, so this battle ends.'
                      : 'Their 6 beats your 5. Choose one of your participating ships to lose.'}
          </p>
        </>
      }
    >
      <h3>Close waters mean combat</h3>
      <p>Opposing ships fight automatically when adjacent or sharing a port’s dark-blue harbor.</p>
      <ul>
        <li>
          Allies within <strong>two hexes of their team’s triggering ship</strong> help. Assistance does not
          chain.
        </li>
        <li>
          Every participating ship rolls a die. Each port within two hexes of its owner’s triggering ship adds
          one die, even outside the harbor. Support does not chain through helpers.
        </li>
        <li>The higher top result wins. On a tie, reroll.</li>
        <li>The loser chooses a participating ship to remove. A sole eligible casualty is automatic.</li>
      </ul>
      <details>
        <summary>Multiple battles & casualty choices</summary>
        <p>
          If different encounters are possible, the active captain chooses which to resolve first. In the live
          battle close-up, select your casualty and confirm its loss. Losing a helper can leave the triggering
          ships fighting; losing a trigger can end the battle. A supporting port cannot be a casualty.
        </p>
      </details>
      <details className="combat-odds">
        <summary>Combat odds without perks</summary>
        <p>
          These are your chances when every participating ship uses a normal six-sided die and ties reroll.
          Harbor support, port attacks, and perks are excluded.
        </p>
        <CombatOddsTable
          caption="Chance to win one exchange"
          firstColumn="Your team"
          rows={singleExchangeOdds}
        />
        <p>
          The cumulative table assumes the fight continues after every casualty until one team has no ships
          left. A live battle can end sooner when removing a triggering ship leaves no opposing ships
          adjacent.
        </p>
        <CombatOddsTable
          caption="Chance to win the full encounter"
          firstColumn="Starting team"
          rows={fullEncounterOdds}
        />
      </details>
    </Lesson>
  )
}

function Ports({ board }: { board?: Board }) {
  const [attempt, setAttempt] = useState(0)
  const captured = attempt === 4
  return (
    <Lesson
      takeaway="Enter the dark-blue harbor, clear enemy ships, then spend an unused action to attack the port."
      visual={
        <>
          <TeachingChart board={board} captured={captured} />
          <span className="example-label">A PORT WEAKENS EACH TIME IT WINS</span>
          <div className="example-dice">
            <div>
              <small>Your ships’ example rolls</small>
              <Die value={attempt === 3 ? 3 : 4} />
              <Die value={2} />
            </div>
            <span>vs</span>
            <div>
              <small>Port’s example roll</small>
              <Die value={6} />
            </div>
          </div>
          <p className="port-equation">
            {attempt === 0
              ? 'Port defense: 6'
              : captured
                ? '6 − 3 = 3. Your 4 wins!'
                : `Defense this attack: 6 − ${attempt - 1} = ${7 - attempt}`}
          </p>
          <div className="example-controls">
            <button disabled={captured} onClick={() => setAttempt(attempt + 1)}>
              {attempt === 0
                ? 'Try a defense win'
                : attempt < 3
                  ? 'Try another defense win'
                  : 'Try the capture example'}
            </button>
            <button onClick={() => setAttempt(0)}>Reset example</button>
          </div>
          <p className="example-feedback" role="status">
            {attempt === 0
              ? 'Scripted examples: both sides keep their ships when a port wins.'
              : attempt === 1
                ? 'The port wins 6 to 4. No ship dies. Future port rolls now lose 1.'
                : attempt === 2
                  ? 'The port wins 5 to 4. Future rolls now lose 2. Next, try a ship roll of 3; a 4 would tie and reroll.'
                  : attempt === 3
                    ? 'The port wins 4 to 3. Future rolls now lose 3.'
                    : 'On the next attack, your 4 beats its 3. You capture the port!'}
          </p>
        </>
      }
    >
      <h3>Take the fight to a fortress</h3>
      <p>
        A port does not attack ships automatically. Enemy and unclaimed ports both fight back when attacked.
      </p>
      <ul>
        <li>
          Use the port attacks in your controls. Pick a ship in its harbor and spend{' '}
          <strong>one unused action</strong>.
        </li>
        <li>Your helpers use the same two-hex rule. The port rolls one die.</li>
        <li>If the port wins, no attacker dies. Its future defense is weakened by 1, cumulatively.</li>
        <li>On capture, ownership changes immediately and the port’s construction is canceled.</li>
      </ul>
      <details>
        <summary>Restoring defense & the final port</summary>
        <p>
          An allied ship entering the port’s harbor resets its weakness to zero. An unclaimed port has no
          allies to restore it. Resolve any ship battle in the harbor before attacking the port.
        </p>
        <p>
          Taking a captain’s last port recruits their surviving ships, keeping their positions. Own every
          remaining port to win.
        </p>
      </details>
    </Lesson>
  )
}

function Building({ board }: { board?: Board }) {
  const [stage, setStage] = useState(0)
  const stages = ['Start building', 'Next owner round', 'Second owner round', 'Third owner round', 'Following round']
  return (
    <Lesson
      takeaway="New construction needs two owner rounds before round 66 and three from round 66 onward."
      visual={
        <>
          <TeachingChart board={board} captured />
          <div className="build-timeline">
            {stages.map((name, i) => (
              <button key={name} aria-pressed={stage === i} onClick={() => setStage(i)}>
                <span>{i === 0 ? <Icon name="hammer" /> : i === stages.length - 1 ? <Icon name="ship" /> : i}</span>
                {name}
              </button>
            ))}
          </div>
          <p className="example-feedback" role="status">
            {
              [
                'Choose an owned port at round end. Its countdown is locked: two owner rounds before round 66, three starting at round 66.',
                'After your next round, early builds have one owner round left; round-66-and-later builds have two.',
                'Early builds launch now. Round-66-and-later builds have one owner round left.',
                'Round-66-and-later builds launch now. A launch cannot move until its owner’s following round.',
                'The new ship is ready to move with your fleet.',
              ][stage]
            }
          </p>
        </>
      }
    >
      <h3>Ports keep your fleet afloat</h3>
      <p>
        <strong>3 ports × 2 ships = 6 population slots.</strong> A ship carrying Mouth to Feed adds one more
        slot.
      </p>
      <ul>
        <li>
          Active ships <em>and ships under construction</em> use capacity.
        </li>
        <li>At the end of your round, choose owned ports to build missing ships. It costs no action dice.</li>
        <li>Any unchosen builds start automatically at random owned ports when you finish or time out.</li>
        <li>A port can build several ships, but a build cannot switch ports.</li>
        <li>At round 58, everyone gets an eight-round warning before new construction slows at round 66.</li>
        <li>
          If newly launched ships trigger battles, finish those battles before the next captain's turn. The
          finishing captain rolls; the next captain keeps their full turn time.
        </li>
      </ul>
      <details>
        <summary>Blocked harbors & losing capacity</summary>
        <p>
          Ships launch in empty dark-blue harbor water. If it is full, they use the nearest legal empty open
          water. Losing capacity never removes existing ships or cancels builds, but you cannot begin more
          construction until below the cap. Capturing a port cancels its builds; they must restart elsewhere.
        </p>
      </details>
    </Lesson>
  )
}

function Perks() {
  const [selected, setSelected] = useState('loaded-dice')
  const perk = perks[selected]
  const examples: Record<string, ReactNode> = {
    'loaded-dice': (
      <>
        <Die value={1} />
        <span>→</span>
        <Die value={3} />
        <span>and</span>
        <Die value={2} />
        <span>→</span>
        <Die value={3} />
      </>
    ),
    'glass-cannon': (
      <>
        <Die value={0} />
        <span>… equally likely …</span>
        <Die value={8} />
      </>
    ),
    'black-pearl': (
      <>
        <Icon name="ship" />
        <strong>Roll 1: recruit</strong>
        <Icon name="flag" />
      </>
    ),
    'mouth-to-feed': (
      <>
        <strong>3 ports → 6 slots</strong>
        <span>+</span>
        <strong>1 holder → 7 slots</strong>
      </>
    ),
    'black-and-white': (
      <>
        <span className="black-white-example black">BLACK</span>
        <span>or</span>
        <span className="black-white-example white">WHITE</span>
      </>
    ),
    'cheat-death': (
      <>
        <strong>Losing exchange</strong>
        <span>→</span>
        <strong>Consume & reroll</strong>
      </>
    ),
  }
  return (
    <Lesson
      takeaway="Perks belong to individual ships. Sail through a pickup with an empty-handed ship to collect it."
      visual={
        <>
          <div className="perk-example-token">
            <svg viewBox="-24 -24 48 48" role="img" aria-label={`Ship 1 carrying ${perk.name}`}>
              <ShipPiece color={colors[0]} number={1} perk={selected} />
            </svg>
          </div>
          <div className="perk-example-options">
            {Object.entries(perks).map(([id, p]) => (
              <button key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}>
                <span>{p.symbol}</span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="perk-demonstration" aria-live="polite">
            <h3>{perk.name}</h3>
            <div className="example-dice">{examples[selected]}</div>
            <p>{perk.description}</p>
          </div>
        </>
      }
    >
      <h3>Six pickups. Six different edges.</h3>
      <p>
        One of each perk appears in open water at game start. Each ship can carry <strong>one perk</strong>; a
        fleet can hold several.
      </p>
      <ul>
        <li>A ship already carrying a perk sails past other pickups.</li>
        <li>Destroyed ships drop their perk where they sank.</li>
        <li>Combat perks work for participating helpers and port attackers.</li>
        <li>Movement rolls are always 4, 5, or 6, unaffected by perks.</li>
        <li>Black and White replaces all dice and modifiers in an exchange with one 50/50 result.</li>
        <li>
          Cheat Death forces a public reroll after any losing exchange its carrier joins, including as a helper
          or port attacker. Everyone sees the rejected result before the next exchange is rolled. It is consumed
          before losses or port effects, then respawns in empty open water. Ties do not consume it.
        </li>
      </ul>
      <details>
        <summary>Recruitment & population details</summary>
        <p>
          Black Pearl checks once per enemy casualty when a holder helped win. Multiple holders do not
          multiply the chance. A recruited ship stays in place, keeps its perk, and adds no actions to the
          current round.
        </p>
        <p>
          Each Mouth to Feed holder adds one population slot anywhere at sea. The bonus follows the ship’s
          captain; losing it never deletes ships or cancels construction.
        </p>
      </details>
    </Lesson>
  )
}

function Extras() {
  const [arrived, setArrived] = useState(false)
  return (
    <Lesson
      takeaway="You know enough to sail. Revisit any chapter from the contents whenever you need a refresher."
      visual={
        <>
          <span className="example-label">WHIRLPOOLS: A ONE-MOVEMENT SHORTCUT</span>
          <div className="whirlpool-example">
            <div>
              <span className="lesson-swirl">◎</span>
              {!arrived && <Icon name="ship" />}
              <small>Entrance</small>
            </div>
            <span className="teleport-arrow">→</span>
            <div>
              <span className="lesson-swirl">◎</span>
              {arrived && <Icon name="ship" />}
              <small>Exit</small>
            </div>
          </div>
          <div className="example-controls">
            <button onClick={() => setArrived(!arrived)}>
              {arrived ? 'Reset example' : 'Enter the whirlpool'}
            </button>
          </div>
          <p className="example-feedback" role="status">
            {arrived
              ? 'Teleported! A roll with 4 movement left now has 3. The route stops; chart again from the exit.'
              : 'An empty exit is far across the map. You have 4 movement left and are one hex from the entrance.'}
          </p>
          <div className="lesson-finish">
            <Icon name="flag" />
            <h3>Your crew is waiting.</h3>
            <p>Return to the lobby and ready up when you’re comfortable.</p>
            <a className="primary guide-link-button" href="#game">
              Return to the voyage →
            </a>
          </div>
        </>
      }
    >
      <h3>Shortcuts, clocks, and leaving</h3>
      <p>
        Entering a whirlpool costs one movement and teleports you to its partner. An occupied exit blocks
        entry. Combat triggers at the exit normally.
      </p>
      <details>
        <summary>When whirlpools appear & fade</summary>
        <p>
          After each completed captain turn, including a timeout, there is a 10% chance to spawn a pair if
          none exists through round 49. A four-round public warning begins at round 46. Starting when round
          50 completes, the chance is 25%. Endpoints are empty ordinary water, at least ten hexes apart, away
          from ships, harbors, and pickups.
        </p>
        <p>
          A pair lasts twice the living captain count at spawn: eight subsequent turns with four captains. The
          map shows its lifetime. Arrival never bounces back, and expiry does not move resting ships. Pickups
          at an exit can be collected.
        </p>
      </details>
      <details>
        <summary>Timeouts & forfeiting</summary>
        <p>
          If either the turn or action clock expires, pending combat is resolved with automatic casualty
          choices and the round ends, including due construction. Unchosen builds start at random owned ports.
        </p>
        <p>
          Forfeit and leave requires confirmation. Your ships, carried perks, and builds vanish. Your ports
          remain neutral with full defense and usable harbors, ready for others to capture. You watch as a
          spectator and cannot rejoin that match. Your remaining turns are skipped.
        </p>
        <p>
          The only captain with ports wins even if neutral ports remain. Leaving the lobby releases your seat
          and vote; leaving a finished game preserves its result.
        </p>
      </details>
      <details>
        <summary>Finding your way around the live game</summary>
        <p>
          The whole board fits by default. Zoom for detail and use Fit to reset. Arrow keys navigate the map;
          Enter or Space selects a cell. Captain cards and the ports, fleet, and shipyard tabs help locate
          your pieces.
        </p>
        <p>
          Every browser sees the same battles and public rolls. Your browser remembers your seat across tabs,
          reconnections, and server restarts. The captain’s log records events; completed rounds feed the
          victory charts.
        </p>
      </details>
    </Lesson>
  )
}

export function HowToPlayPage({ page, board }: { page: string; board?: Board }) {
  const index = Math.max(
    0,
    chapters.findIndex((c) => c.id === page.split('/')[1]),
  )
  const chapter = chapters[index]
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest' })
  }, [index])
  const Chapter = [Basics, Setup, Sailing, Battles, Ports, Building, Perks, Extras][index]
  return (
    <article className="handbook">
      <header className="handbook-header">
        <div>
          <span className="eyebrow">THE CAPTAIN’S HANDBOOK</span>
          <h1>How to play</h1>
          <p>Learn a little. Try it out. Then set sail.</p>
        </div>
        <a href="#game">← Return to the voyage</a>
      </header>
      <div className="handbook-layout">
        <nav className="handbook-contents" aria-label="Rule chapters">
          <span className="eyebrow">FROM FIRST SAIL TO FINAL PORT</span>
          {chapters.map((c, i) => (
            <a key={c.id} href={`#how-to-play/${c.id}`} aria-current={index === i ? 'step' : undefined}>
              <span className="chapter-number">{String(i + 1).padStart(2, '0')}</span>
              <span>
                {c.title}
                <small>{c.level}</small>
              </span>
              <Icon name={c.icon} />
            </a>
          ))}
          <p>Practice examples stay in this guide. Your voyage is unaffected.</p>
        </nav>
        <section className="handbook-chapter" aria-labelledby="chapter-title">
          <div className="chapter-topline">
            <span>{chapter.level}</span>
            <span>
              Chapter {index + 1} of {chapters.length}
            </span>
          </div>
          <progress value={index + 1} max={chapters.length} aria-label="Guide progress" />
          <h2 id="chapter-title" ref={heading} tabIndex={-1}>
            {chapter.title}
          </h2>
          <Chapter key={chapter.id} board={board} />
          <nav className="chapter-pagination" aria-label="Chapter navigation">
            {index > 0 ? (
              <a href={`#how-to-play/${chapters[index - 1].id}`}>
                ← Previous<span>{chapters[index - 1].title}</span>
              </a>
            ) : (
              <span>Start with the pieces.</span>
            )}
            {index < chapters.length - 1 ? (
              <a href={`#how-to-play/${chapters[index + 1].id}`}>
                Next →<span>{chapters[index + 1].title}</span>
              </a>
            ) : (
              <a href="#game">
                Ready to sail →<span>Return to the voyage</span>
              </a>
            )}
          </nav>
        </section>
      </div>
    </article>
  )
}
