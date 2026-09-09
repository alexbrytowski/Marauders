import { useState } from 'react'
import type { Game } from './game'

export function RoundHistory({ game }: { game: Game }) {
  const [metric, setMetric] = useState<'ships' | 'ports'>('ships')
  const history = game.roundHistory
  const max = Math.max(1, ...history.flatMap((r) => r.teams.map((t) => t[metric])))
  const x = (i: number) => 40 + (i * 700) / Math.max(1, history.length - 1)
  const y = (n: number) => 220 - (n * 180) / max
  return (
    <section className="round-history" aria-label="Voyage history">
      <h2>The voyage, round by round</h2>
      <p>Fleet and ports after each captain’s round, plus the final capture.</p>
      {!history.length ? (
        <p>History begins with the next completed round.</p>
      ) : (
        <>
          <label htmlFor="history-metric">Chart</label>
          <select
            id="history-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as 'ships' | 'ports')}
          >
            <option value="ships">Ships alive</option>
            <option value="ports">Ports held</option>
          </select>
          <svg
            className="history-chart"
            viewBox="0 0 780 255"
            role="img"
            aria-label={`${metric === 'ships' ? 'Ships alive' : 'Ports held'} by captain over ${history.length} snapshots. Exact values are in the table below.`}
          >
            <path d="M40 30V220H750" fill="none" stroke="#91aaa9" />
            {[0, max].map((n) => (
              <text key={n} x="28" y={y(n) + 4} textAnchor="end">
                {n}
              </text>
            ))}
            <text x="40" y="245">
              Round {history[0].turn}
            </text>
            <text x="740" y="245" textAnchor="end">
              {history.at(-1)?.isFinal ? 'Final' : `Round ${history.at(-1)?.turn}`}
            </text>
            {game.players.map((p, playerIndex) => (
              <g key={p.id}>
                <polyline
                  fill="none"
                  stroke={p.color}
                  strokeWidth="3"
                  strokeDasharray={['', '8 3', '3 3', '12 3 3 3'][playerIndex]}
                  points={history
                    .map((r, i) => `${x(i)},${y(r.teams.find((t) => t.playerId === p.id)?.[metric] ?? 0)}`)
                    .join(' ')}
                />
                {history.length === 1 && (
                  <circle
                    cx={x(0)}
                    cy={y(history[0].teams.find((t) => t.playerId === p.id)?.[metric] ?? 0)}
                    r="4"
                    fill={p.color}
                  />
                )}
              </g>
            ))}
          </svg>
          <div className="history-legend">
            {game.players.map((p) => (
              <span key={p.id} style={{ color: p.color }}>
                {p.name}
              </span>
            ))}
          </div>
          <details>
            <summary>View exact round statistics</summary>
            <div className="history-table">
              <table>
                <caption>Each cell shows ships alive / ports held.</caption>
                <thead>
                  <tr>
                    <th scope="col">Round ended</th>
                    {game.players.map((p) => (
                      <th scope="col" key={p.id}>
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((r, i) => (
                    <tr key={i}>
                      <th scope="row">
                        {r.isFinal ? 'Final' : r.turn} ·{' '}
                        {game.players.find((p) => p.id === r.activePlayerId)?.name}
                      </th>
                      {game.players.map((p) => {
                        const team = r.teams.find((t) => t.playerId === p.id)
                        return (
                          <td key={p.id}>
                            {team?.ships ?? 0} / {team?.ports ?? 0}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
