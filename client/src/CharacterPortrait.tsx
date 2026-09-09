import { useState } from 'react'
import type { CharacterProfile } from './game'
import { Icon } from './Icons'

export function CharacterPortrait({ profile }: { profile?: CharacterProfile }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return profile?.imageUrl && failedUrl !== profile.imageUrl ? (
    <img
      className="character-portrait"
      src={profile.imageUrl}
      alt={profile.name}
      onError={() => setFailedUrl(profile.imageUrl)}
    />
  ) : (
    <span className="character-placeholder" aria-label={profile?.name ?? 'Captain portrait'}>
      <Icon name="compass" />
    </span>
  )
}
