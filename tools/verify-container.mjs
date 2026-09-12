// CI-only disposable container/volume. Never connects to the hosted game.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

const image = process.argv[2] ?? 'marauders:verify'
const name = `marauders-verify-${randomBytes(6).toString('hex')}`
const volume = `${name}-data`
const environment = { ...process.env, Game__ResetPassword: randomBytes(32).toString('hex') }
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env: environment }).trim()
try {
  docker('volume', 'create', volume)
  docker('run', '--detach', '--name', name, '--publish', '127.0.0.1::8080',
    '--mount', `type=volume,source=${volume},target=/data`,
    '--env', 'Game__ResetPassword', '--env', 'Game__TrustForwardedHeaders=true', '--env', 'PORT=8080', image)
  const port = docker('port', name, '8080/tcp').split(':').at(-1)
  const origin = `http://127.0.0.1:${port}`
  async function ready() {
    for (let attempt = 0; attempt < 120; attempt++) {
      try { if ((await fetch(`${origin}/api/health`)).status === 200) return } catch { /* starting */ }
      await setTimeout(250)
    }
    throw new Error('Container never passed its HTTP readiness probe.')
  }
  await ready()
  const status = docker('exec', name, 'cat', '/proc/1/status')
  assert.match(status, /^Uid:\s+1654\s+1654\s+1654\s+1654$/m, 'The server must run as app, not root.')
  const headers = { 'X-Forwarded-Proto': 'https', 'X-Marauders-Client': 'web' }
  const session = await fetch(`${origin}/api/session`, { headers })
  assert.equal(session.status, 200)
  const cookie = session.headers.get('set-cookie')
  assert.match(cookie, /secure/i)
  headers.Cookie = cookie.split(';')[0]
  const profiles = await (await fetch(`${origin}/api/characters`, { headers })).json()
  assert.equal(profiles.length, 8)
  for (const profile of profiles) {
    const portrait = await fetch(`${origin}${profile.imageUrl}`, { headers })
    assert.equal(portrait.status, 200)
    assert.match(portrait.headers.get('content-type'), /image\/jpeg/)
  }
  const joined = await fetch(`${origin}/api/game/players`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Container captain', color: '#ed7866', character: profiles[0].id }),
  })
  assert.equal(joined.status, 200)
  const before = await joined.json()
  docker('restart', name)
  await ready()
  const after = await (await fetch(`${origin}/api/game`, { headers })).json()
  assert.equal(after.id, before.id)
  assert.equal(after.revision, before.revision)
  assert.equal((await (await fetch(`${origin}/api/session`, { headers })).json()).playerId, before.players[0].id)
  docker('exec', name, 'test', '-f', '/data/game-state-v2.json')
  console.log('Container passed: non-root server, mounted save, portraits, secure seat and restart persistence.')
} catch (error) {
  try { console.error(docker('logs', name)) } catch { /* container may not have started */ }
  throw error
} finally {
  try { docker('rm', '--force', name) } catch { /* only this test's generated name */ }
  try { docker('volume', 'rm', volume) } catch { /* only this test's generated volume */ }
}
