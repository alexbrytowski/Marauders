import { useState } from 'react'
import { CharacterPortrait } from './CharacterPortrait'
import { colors } from './game'
import type { CharacterProfile, Game } from './game'

const colorNames = ['Coral', 'Teal', 'Violet', 'Gold']

export function JoinCrew({
  game,
  profiles,
  disabled,
  send,
}: {
  game: Game
  profiles: CharacterProfile[]
  disabled: boolean
  send: (path: string, body: object) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [character, setCharacter] = useState('')
  const colorTaken = game.players.some((p) => p.color === color)
  const characterTaken = game.players.some((p) => p.character === character)
  const canJoin =
    !disabled &&
    !!name.trim() &&
    colors.includes(color) &&
    !colorTaken &&
    profiles.some((p) => p.id === character) &&
    !characterTaken

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canJoin) void send('/api/game/players', { name: name.trim(), color, character })
      }}
    >
      <label htmlFor="captain-name">CAPTAIN NAME</label>
      <input
        id="captain-name"
        placeholder="What shall we call you?"
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="nickname"
        required
      />
      <fieldset className="crew-color-picker">
        <legend>YOUR COLOR</legend>
        <div className="color-picker">
          {colors.map((c, index) => {
            const owner = game.players.find((p) => p.color === c)
            const selected = color === c && !owner
            return (
              <div className="crew-color-option" key={c}>
                <button
                  type="button"
                  className={selected ? 'chosen' : ''}
                  style={{ '--crew': c } as React.CSSProperties}
                  disabled={!!owner || disabled}
                  onClick={() => setColor(c)}
                  aria-label={`Choose ${c} crew color`}
                  aria-pressed={selected}
                  title={owner ? `${colorNames[index]} — taken by ${owner.name}` : colorNames[index]}
                >
                  {owner ? '×' : selected ? '✓' : ''}
                </button>
                <span>{colorNames[index]}</span>
                {owner && <small title={`Taken by ${owner.name}`}>Taken</small>}
              </div>
            )
          })}
        </div>
      </fieldset>
      <fieldset className="profile-picker">
        <legend>YOUR CHARACTER</legend>
        {profiles.map((profile) => {
          const owner = game.players.find((p) => p.character === profile.id)
          const selected = character === profile.id && !owner
          return (
            <button
              key={profile.id}
              type="button"
              aria-label={`Choose ${profile.name}`}
              aria-pressed={selected}
              disabled={!!owner || disabled}
              title={owner ? `Taken by ${owner.name}` : profile.name}
              onClick={() => setCharacter(profile.id)}
            >
              <CharacterPortrait profile={profile} />
              <span className="profile-name">{profile.name}</span>
              <small className="profile-status">
                {owner ? `Taken by ${owner.name}` : selected ? 'Selected ✓' : 'Available'}
              </small>
            </button>
          )
        })}
      </fieldset>
      <p className="join-guidance" role="status">
        {colorTaken || characterTaken
          ? `Your selected ${colorTaken && characterTaken ? 'color and character are' : colorTaken ? 'color is' : 'character is'} now taken. Choose again.`
          : 'Choose a character and a color to join. Each belongs to one captain only.'}
      </p>
      <p className="perk-note">Characters are cosmetic. Collect ship perks at sea.</p>
      <button className="primary join-button" type="submit" disabled={!canJoin}>
        Join the crew <span>→</span>
      </button>
    </form>
  )
}
