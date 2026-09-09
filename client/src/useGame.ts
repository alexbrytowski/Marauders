import { useEffect, useRef, useState } from 'react'
import { HubConnectionBuilder } from '@microsoft/signalr'
import { getJson } from './game'
import type { Board, CharacterProfile, Command, Game, MapOption, Session } from './game'

export function useGame() {
  const [game, setGame] = useState<Game | null>(null)
  const [boards, setBoards] = useState<Record<string, Board>>({})
  const [maps, setMaps] = useState<MapOption[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [profiles, setProfiles] = useState<CharacterProfile[]>([])
  const [connection, setConnection] = useState('Connecting')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const accept = (next: Game) =>
    setGame((current) => (!current || next.revision >= current.revision ? next : current))
  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const hub = new HubConnectionBuilder().withUrl('/hubs/game').withAutomaticReconnect().build()
    const resync = async () => {
      const [state, identity] = await Promise.all([
        getJson<Game>('/api/game'),
        getJson<Session>('/api/session'),
      ])
      if (!cancelled) {
        accept(state)
        setSession(identity)
      }
    }
    hub.on('gameUpdated', (state: Game) => {
      if (!cancelled) {
        accept(state)
        // A reset can release seats in every connected browser.
        void getJson<Session>('/api/session')
          .then((identity) => {
            if (!cancelled) setSession(identity)
          })
          .catch((e) => {
            if (!cancelled) setError(String(e))
          })
      }
    })
    hub.onreconnecting(() => {
      if (!cancelled) setConnection('Reconnecting')
    })
    hub.onreconnected(() => {
      if (!cancelled) {
        setConnection('Live')
        void resync().catch((e) => setError(String(e)))
      }
    })
    const connect = async () => {
      try {
        const [identity, mapOptions, characters] = await Promise.all([
          getJson<Session>('/api/session'),
          getJson<MapOption[]>('/api/maps'),
          getJson<CharacterProfile[]>('/api/characters'),
        ])
        const mapBoards = await Promise.all(
          mapOptions.map((map) => getJson<Board>(`/api/board?mapId=${encodeURIComponent(map.id)}`)),
        )
        if (cancelled) return
        setSession(identity)
        setMaps(mapOptions)
        setBoards(Object.fromEntries(mapBoards.map((map) => [map.id, map])))
        setProfiles(characters)
        await hub.start()
        if (cancelled) {
          await hub.stop()
          return
        }
        await resync()
        setConnection('Live')
        setError('')
      } catch (e) {
        if (!cancelled) {
          setConnection('Offline')
          setError(e instanceof Error ? e.message : 'Connection failed. Retrying…')
          retry = setTimeout(connect, 3000)
        }
      }
    }
    hub.onclose(() => {
      if (!cancelled) {
        setConnection('Offline')
        retry = setTimeout(connect, 3000)
      }
    })
    void connect()
    return () => {
      cancelled = true
      clearTimeout(retry)
      void hub.stop()
    }
  }, [])
  const send = async (path: string, body: object) => {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      accept(await getJson<Game>(path, body))
      setSession(await getJson<Session>('/api/session'))
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.')
      try {
        accept(await getJson<Game>('/api/game'))
      } catch {
        /* retain useful state while disconnected */
      }
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const act = (command: Command) => send('/api/game/action', { ...command, expectedRevision: game?.revision })
  const selectedBoard = game ? boards[game.mapId] : null
  const board = selectedBoard?.version === game?.boardVersion ? selectedBoard : null
  return {
    game,
    board,
    boards,
    maps,
    profiles,
    session,
    connection,
    error,
    busy,
    act,
    send,
    clearError: () => setError(''),
  }
}
