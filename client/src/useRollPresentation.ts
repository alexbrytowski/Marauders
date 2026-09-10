import { useEffect, useState } from 'react'
import type { Game } from './game'

type Frame = {
  source: Game | null
  shown: Game | null
  rolling: 'movement' | 'combat' | null
  rollKey: string
}

// Keep authoritative state untouched. Only its presentation waits for the dice.
export function useRollPresentation(latest: Game | null, live: boolean) {
  const [frame, setFrame] = useState<Frame>({ source: latest, shown: latest, rolling: null, rollKey: '' })
  if (frame.source !== latest) {
    const previousRoll = frame.source?.events.findLast((event) => event.rolls)
    const nextRoll = latest?.events.findLast((event) => event.rolls)
    const sameTurn = latest?.id === frame.source?.id && latest?.turnNumber === frame.source?.turnNumber
    const animate =
      live &&
      sameTurn &&
      frame.source &&
      nextRoll &&
      nextRoll.id !== previousRoll?.id &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rolling =
      sameTurn && frame.rolling
        ? frame.rolling
        : animate
          ? nextRoll.kind === 'movement'
            ? 'movement'
            : 'combat'
          : null
    setFrame({
      source: latest,
      shown: rolling ? frame.shown : latest,
      rolling,
      rollKey: frame.rolling && sameTurn ? frame.rollKey : (nextRoll?.id ?? ''),
    })
  }
  useEffect(() => {
    if (!frame.rolling) return
    const timer = setTimeout(
      () => setFrame((current) => ({ ...current, shown: current.source, rolling: null })),
      1300,
    )
    return () => clearTimeout(timer)
  }, [frame.rolling, frame.rollKey])
  return { game: frame.shown, rolling: frame.rolling }
}
