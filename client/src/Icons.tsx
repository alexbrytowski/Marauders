export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    ship: (
      <>
        <path d="M4 16h16l-3 5H8z" />
        <path d="M12 3v12H5zM14 5l6 10h-6z" />
      </>
    ),
    port: (
      <>
        <path d="M4 21V9h5v4h6V9h5v12zM9 21v-5h6v5M6 9V4h4v5M14 9V4h4v5" />
        <path d="M3 21h18" />
      </>
    ),
    dice: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1" />
        <circle cx="16" cy="16" r="1" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-3 5-5 3 3-5zM12 1v3M12 20v3M1 12h3M20 12h3" />
      </>
    ),
    battle: (
      <>
        <path d="m4 3 13 13 4 1-4 4-1-4L3 4zM20 3 7 16l-4 1 4 4 1-4L21 4z" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    hammer: (
      <>
        <path d="m4 20 9-9M9 5l5-3 7 7-3 5zM2 18l4 4" />
      </>
    ),
    flag: (
      <>
        <path d="M5 22V3m0 0c5-4 9 4 15 0v10c-6 4-10-4-15 0" />
      </>
    ),
    log: (
      <>
        <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />
      </>
    ),
  }
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.compass}
    </svg>
  )
}
export function Die({ value, dim = false }: { value?: number; dim?: boolean }) {
  const dots: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  }
  return (
    <span
      className={`die ${dim ? 'dim' : ''}`}
      aria-label={value ? `Rolled ${value}` : 'Available action die'}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={(dots[value ?? 5] ?? []).includes(i) ? 'pip' : ''} />
      ))}
    </span>
  )
}
