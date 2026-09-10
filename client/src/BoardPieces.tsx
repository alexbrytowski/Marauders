import { perks } from './game'

// Shared by the playable chart and handbook examples.
export function ShipPiece({
  color,
  number,
  selected = false,
  perk,
}: {
  color?: string
  number: number
  selected?: boolean
  perk?: string | null
}) {
  return (
    <g className="ship-token">
      <circle
        r="12.5"
        fill={color}
        stroke={selected ? '#fff5ce' : '#112a31'}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <path d="M-8 5H8l-3 4H-4zM0-10V3H-7zM2-7l6 10H2z" fill="#122830" />
      <text y="17" className="ship-number">
        {number}
      </text>
      {perk && (
        <g className="perk-token carried" transform="translate(9 -9)">
          <circle r="6" />
          <text y="3">{perks[perk]?.symbol}</text>
        </g>
      )}
    </g>
  )
}

export function PortPiece({ color = '#d2c9af', number }: { color?: string; number: string }) {
  return (
    <g className="port-token">
      <circle r="14" fill={color} stroke="#081a22" strokeWidth="2" />
      <path d="M-7 6V-3h3v3h3v-5h4v5h3v-3h3v9z" fill="#14262b" />
      <rect x="-7" y="-17" width="22" height="14" rx="3" fill="#0c1c22" />
      <text x="4" y="-6">
        {number}
      </text>
    </g>
  )
}
