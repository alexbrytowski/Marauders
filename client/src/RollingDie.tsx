import { useEffect, useState } from 'react'
import { Die } from './Icons'

export function RollingDie({ glass = false, sides = 6 }: { glass?: boolean; sides?: number }) {
  const [value, setValue] = useState(1)
  useEffect(() => {
    const timer = setInterval(
      () => setValue(Math.floor(Math.random() * (glass ? 10 : sides)) + (glass ? -1 : 1)),
      85,
    )
    return () => clearInterval(timer)
  }, [glass, sides])
  return (
    <span className="rolling-die" aria-hidden="true">
      <Die value={value} />
    </span>
  )
}
