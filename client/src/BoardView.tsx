import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { directions, distance, key, perks, portNumber } from './game'
import type { Board, Cell, Game, Hex } from './game'
import { outline, point } from './boardGeometry'

export function BoardView({
  board,
  game,
  selectedShipId,
  selectedPortId,
  highlights,
  route,
  onCell,
  onShip,
  onPort,
  onHover,
  preview = false,
}: {
  board: Board
  game: Game
  selectedShipId: string | null
  selectedPortId: string | null
  highlights: Set<string>
  route: Hex[]
  onCell: (cell: Cell) => void
  onShip: (id: string) => void
  onPort: (id: string) => void
  onHover: (cell: Cell | null) => void
  preview?: boolean
}) {
  const [zoom, setZoom] = useState(1)
  const [focusKey, setFocusKey] = useState('9,0')
  const frame = useRef<HTMLDivElement>(null)
  const [fitWidth, setFitWidth] = useState(1032)
  const zoomCenter = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const node = frame.current
    if (!node || preview) return
    const observer = new ResizeObserver(() => {
      setFitWidth(Math.floor(Math.min(node.clientWidth, (node.clientHeight * 1032) / 838)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [preview])
  const changeZoom = (next: number) => {
    const node = frame.current,
      map = node?.querySelector('svg')
    if (node && map) {
      const bounds = node.getBoundingClientRect(),
        mapBounds = map.getBoundingClientRect()
      zoomCenter.current = {
        x: (bounds.left + node.clientWidth / 2 - mapBounds.left) / mapBounds.width,
        y: (bounds.top + node.clientHeight / 2 - mapBounds.top) / mapBounds.height,
      }
    }
    setZoom(next)
  }
  useLayoutEffect(() => {
    const node = frame.current,
      map = node?.querySelector('svg'),
      center = zoomCenter.current
    if (!node || !map) return
    if (zoom === 1) node.scrollTo(0, 0)
    else if (center) {
      const bounds = node.getBoundingClientRect(),
        mapBounds = map.getBoundingClientRect()
      node.scrollLeft += mapBounds.left + mapBounds.width * center.x - bounds.left - node.clientWidth / 2
      node.scrollTop += mapBounds.top + mapBounds.height * center.y - bounds.top - node.clientHeight / 2
    }
    zoomCenter.current = null
  }, [zoom])
  const ports = new Map(game.ports.map((p) => [p.id, p]))
  const players = new Map(game.players.map((p) => [p.id, p]))
  const ships = new Map(game.ships.map((s) => [key(s), s]))
  const pickups = new Map(game.perkPickups.map((p) => [key(p), p]))
  const cells = useMemo(() => new Map(board.cells.map((c) => [key(c), c])), [board])
  const portLabels = useMemo(() => {
    const used = new Set<string>()
    return board.cells
      .filter((cell) => cell.portId)
      .flatMap((port) => {
        const land = board.cells
          .filter((cell) => cell.terrain === 'land' && distance(cell, port) <= 3 && !used.has(key(cell)))
          .sort((a, b) => distance(a, port) - distance(b, port) || a.r - b.r || a.q - b.q)[0]
        if (!land) return []
        used.add(key(land))
        return [{ port, land }]
      })
  }, [board])
  const coasts = useMemo(
    () =>
      new Set(
        board.cells
          .filter(
            (c) =>
              c.terrain === 'land' &&
              directions.some((d) => {
                const neighbor = cells.get(key({ q: c.q + d.q, r: c.r + d.r }))
                return neighbor && neighbor.terrain !== 'land'
              }),
          )
          .map(key),
      ),
    [board, cells],
  )
  const handleKeys = (event: KeyboardEvent<SVGGElement>, cell: Cell) => {
    const moves: Record<string, Hex> = {
      ArrowRight: { q: 1, r: 0 },
      ArrowLeft: { q: -1, r: 0 },
      ArrowUp: { q: 0, r: -1 },
      ArrowDown: { q: 0, r: 1 },
    }
    const d = moves[event.key]
    if (d) {
      event.preventDefault()
      let next = { q: cell.q + d.q, r: cell.r + d.r }
      for (let count = 0; count < 34; count++) {
        const candidate = cells.get(key(next))
        if (candidate && candidate.terrain !== 'land') {
          setFocusKey(key(next))
          frame.current?.querySelector<SVGGElement>(`[data-hex="${key(next)}"]`)?.focus()
          break
        }
        next = { q: next.q + d.q, r: next.r + d.r }
      }
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate(cell)
    }
  }
  const activate = (cell: Cell) => {
    const ship = ships.get(key(cell))
    if (ship) onShip(ship.id)
    else if (cell.portId) onPort(cell.portId)
    else onCell(cell)
  }
  const focusedHarbor =
    selectedPortId ??
    (selectedShipId
      ? cells.get(key(game.ships.find((s) => s.id === selectedShipId) ?? { q: -100, r: -100 }))?.harborId
      : null)
  return (
    <div className={`chart ${preview ? 'chart-preview' : ''}`}>
      <div className="chart-header">
        <span>{board.name.toUpperCase()}</span>
        <span>13 ports · one victor</span>
      </div>
      <div className="chart-scroll" ref={frame}>
        <svg
          className={`sea-map ${zoom === 1 ? 'fit-map' : ''}`}
          viewBox="0 0 1032 838"
          style={{ width: preview ? '100%' : `${fitWidth * zoom}px` }}
          aria-label="Marauders interactive hex map"
          role="group"
        >
          <defs>
            <radialGradient id="sea-glow">
              <stop stopColor="#163c48" />
              <stop offset="1" stopColor="#0b222c" />
            </radialGradient>
            <pattern id="chart-lines" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M100 0H0v100" fill="none" stroke="#90b3b4" strokeWidth=".4" opacity=".12" />
            </pattern>
            <filter id="token-shadow" x="-100%" y="-100%" width="300%" height="300%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".65" />
            </filter>
          </defs>
          <rect width="1032" height="838" fill="url(#sea-glow)" />
          <rect width="1032" height="838" fill="url(#chart-lines)" />
          {board.cells.map((cell) => {
            const p = point(cell),
              ship = ships.get(key(cell)),
              pickup = pickups.get(key(cell)),
              port = cell.portId ? ports.get(cell.portId) : undefined
            const owner = players.get(ship?.ownerId ?? port?.ownerId ?? '')
            const isSelected = ship?.id === selectedShipId || port?.id === selectedPortId
            const highlighted = highlights.has(key(cell))
            const harborFocus = cell.harborId && cell.harborId === focusedHarbor
            const coast = coasts.has(key(cell))
            const description = ship
              ? `${owner?.name}'s ship ${ship.number}${ship.perk ? `, carrying ${perks[ship.perk]?.name}` : ''}, hex ${key(cell)}`
              : port
                ? `${port.name}, port ${portNumber(port.id)}, ${owner?.name ?? 'unclaimed'}`
                : `${pickup ? `${perks[pickup.kind]?.name} pickup, ` : ''}${cell.terrain === 'harbor' ? `${ports.get(cell.harborId!)?.name} harbor` : cell.terrain}, hex ${key(cell)}`
            return (
              <g
                key={key(cell)}
                transform={`translate(${p.x} ${p.y})`}
                className={`hex ${cell.terrain} ${coast ? 'coast' : ''} ${highlighted ? 'reachable' : ''} ${isSelected ? 'selected-hex' : ''} ${harborFocus ? 'harbor-focus' : ''}`}
                data-hex={key(cell)}
                data-port={port?.id}
                data-ship={ship?.id}
                data-perk={pickup?.kind}
                role={cell.terrain !== 'land' ? 'button' : undefined}
                aria-label={description}
                tabIndex={!preview && cell.terrain !== 'land' ? (key(cell) === focusKey ? 0 : -1) : undefined}
                onKeyDown={(e) => handleKeys(e, cell)}
                onFocus={() => {
                  setFocusKey(key(cell))
                  onHover(cell)
                }}
                onMouseEnter={() => onHover(cell)}
                onMouseLeave={() => onHover(null)}
                onClick={() => activate(cell)}
              >
                <title>{description}</title>
                <polygon points={outline} />
                {cell.terrain === 'land' && !coast && (cell.q + cell.r) % 3 === 0 && (
                  <path className="mountain" d="m-8 5 6-11 7 11m-4 0 4-7 5 7" />
                )}
                {cell.terrain === 'harbor' && !ship && <circle r="2" className="harbor-dot" />}
                {highlighted && !ship && <circle r="3" className="reachable-dot" />}
                {pickup && !ship && (
                  <g className="perk-token">
                    <circle r="10" />
                    <text y="5">{perks[pickup.kind]?.symbol}</text>
                  </g>
                )}
                {port && (
                  <g className="port-token" filter="url(#token-shadow)">
                    <circle r="14" fill={owner?.color ?? '#d2c9af'} stroke="#081a22" strokeWidth="2" />
                    <path d="M-7 6V-3h3v3h3v-5h4v5h3v-3h3v9z" fill="#14262b" />
                    <rect x="-7" y="-17" width="22" height="14" rx="3" fill="#0c1c22" />
                    <text x="4" y="-6">
                      {portNumber(port.id)}
                    </text>
                  </g>
                )}
                {ship && (
                  <g className="ship-token" filter="url(#token-shadow)">
                    <circle
                      r="12.5"
                      fill={owner?.color}
                      stroke={isSelected ? '#fff5ce' : '#112a31'}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    <path d="M-8 5H8l-3 4H-4zM0-10V3H-7zM2-7l6 10H2z" fill="#122830" />
                    <text y="17" className="ship-number">
                      {ship.number}
                    </text>
                    {ship.perk && (
                      <g className="perk-token carried" transform="translate(9 -9)">
                        <circle r="6" />
                        <text y="3">{perks[ship.perk]?.symbol}</text>
                      </g>
                    )}
                  </g>
                )}
              </g>
            )
          })}
          {!preview && (
            <g className="port-callouts" pointerEvents="none" aria-hidden="true">
              {portLabels.map(({ port, land }) => {
                const a = point(port),
                  b = point(land),
                  owner = players.get(ports.get(port.portId!)?.ownerId ?? '')
                const length = Math.hypot(b.x - a.x, b.y - a.y),
                  dx = (b.x - a.x) / length,
                  dy = (b.y - a.y) / length
                return (
                  <g key={port.portId} data-port-label={port.portId}>
                    <line x1={a.x + dx * 16} y1={a.y + dy * 16} x2={b.x - dx * 12} y2={b.y - dy * 12} />
                    <circle cx={b.x} cy={b.y} r="13" stroke={owner?.color ?? '#dfc795'} />
                    <text x={b.x} y={b.y + 6}>
                      {portNumber(port.portId!)}
                    </text>
                  </g>
                )
              })}
            </g>
          )}
          {route.length > 1 && (
            <g pointerEvents="none">
              <polyline
                className="route-line"
                points={route
                  .map((h) => {
                    const p = point(h)
                    return `${p.x},${p.y}`
                  })
                  .join(' ')}
              />
              {route.slice(1).map((h, i) => {
                const p = point(h)
                return (
                  <g key={key(h)}>
                    <circle cx={p.x} cy={p.y} r="8" fill="#e6be68" />
                    <text className="route-number" x={p.x} y={p.y + 3}>
                      {i + 1}
                    </text>
                  </g>
                )
              })}
            </g>
          )}
          <g className="map-compass" transform="translate(953 769)">
            <circle r="28" />
            <path d="M0-35V35M-35 0h70M-20-20l40 40M20-20l-40 40" />
            <path d="m0-25 7 25-7 25-7-25z" />
            <text y="-41">N</text>
          </g>
        </svg>
      </div>
      <div className="chart-footer">
        <div className="map-legend">
          <span>
            <i className="water-key" />
            Open sea
          </span>
          <span>
            <i className="harbor-key" />
            Harbor
          </span>
          <span>
            <i className="land-key" />
            Land
          </span>
          <span>
            <i className="perk-key" />
            Perk pickup
          </span>
        </div>
        {!preview && (
          <div className="zoom-controls">
            <button
              onClick={() => changeZoom(Math.max(1, zoom - 0.25))}
              disabled={zoom === 1}
              aria-label="Zoom out"
            >
              −
            </button>
            <button onClick={() => changeZoom(1)} aria-label="Fit board">
              {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
            </button>
            <button
              onClick={() => changeZoom(Math.min(3, zoom + 0.25))}
              disabled={zoom === 3}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
