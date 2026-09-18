import { useEffect, useState } from 'react'
import { Die } from './Icons'

export function RollingDie({ glass = false }: { glass?: boolean }) {
  const [value, setValue] = useState(1)
  useEffect(() => {
    const timer = setInterval(
      () => setValue(Math.floor(Math.random() * (glass ? 10 : 6)) + (glass ? -1 : 1)),
      85,
    )
    return () => clearInterval(timer)
  }, [glass])
  return (
    <span className="rolling-die" aria-hidden="true">
      <Die value={value} />
    </span>
  )
}
