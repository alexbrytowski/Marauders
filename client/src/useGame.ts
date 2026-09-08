import { useEffect, useRef, useState } from 'react'
import { HubConnectionBuilder } from '@microsoft/signalr'
import { getJson } from './game'
import type { Board, Command, Game, Session } from './game'

export function useGame() {
  const [game, setGame] = useState<Game | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [session, setSession] = useState<Session | null>(null)
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
      if (!cancelled) accept(state)
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
        const [identity, map] = await Promise.all([
          getJson<Session>('/api/session'),
          getJson<Board>('/api/board'),
        ])
        if (cancelled) return
        setSession(identity)
        setBoard(map)
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
  return { game, board, session, connection, error, busy, act, send, clearError: () => setError('') }
}
