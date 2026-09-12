import { test, expect } from '@playwright/test'
import { spawn, execFileSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Game, CharacterProfile } from '../src/game'
import { colors } from '../src/game'

const root = path.resolve('..')
const backend = 'http://127.0.0.1:5136'
const origin = 'https://127.0.0.1:5176'
const headers = { 'X-Marauders-Client': 'web' }

test('Production HTTPS, portraits, seven browsers, reset and persistent seats survive redeploy', async ({
  browser,
}, testInfo) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'marauders-production-'))
  const password = randomBytes(32).toString('hex')
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl'
  const key = path.join(directory, 'proxy.key')
  const cert = path.join(directory, 'proxy.crt')
  // Ephemeral loopback-only test certificate; never a deployed credential.
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { windowsHide: true, stdio: 'ignore' },
  )
  let server: ChildProcess | undefined
  let output = ''
  const environment = { ...process.env }
  for (const name of Object.keys(environment))
    if (
      name.startsWith('Game__') ||
      name.startsWith('ASPNETCORE_') ||
      name === 'DOTNET_ENVIRONMENT' ||
      name === 'PORT'
    )
      delete environment[name]
  const serverEnv = {
    ...environment,
    ASPNETCORE_ENVIRONMENT: 'Production',
    PORT: '5136',
    Game__DataDirectory: path.join(directory, 'data'),
    Game__ResetPassword: password,
    Game__TrustForwardedHeaders: 'true',
    Game__TurnSeconds: '1800',
    Game__ActionSeconds: '900',
  }
  async function startServer() {
    output = ''
    server = spawn('dotnet', [path.join(root, 'artifacts/publish/Marauders.Server.dll')], {
      cwd: path.join(root, 'artifacts/publish'),
      env: serverEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const log = (b: Buffer) => {
      output += b.toString()
      appendFileSync(testInfo.outputPath('server.log'), b)
    }
    server.stdout?.on('data', log)
    server.stderr?.on('data', log)
    await expect
      .poll(
        async () => {
          if (server?.exitCode !== null) throw new Error(output)
          try {
            return (await fetch(`${backend}/api/health`)).status
          } catch {
            return 0
          }
        },
        { timeout: 20_000 },
      )
      .toBe(200)
  }
  async function stopServer() {
    if (!server || server.exitCode !== null) return
    const child = server
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    child.kill()
    await exited
  }
  const proxy = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const upstream = httpRequest(
      `${backend}${req.url}`,
      {
        method: req.method,
        headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' },
      },
      (response) => {
        res.writeHead(response.statusCode!, response.headers)
        response.pipe(res)
      },
    )
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  proxy.on('upgrade', (req, socket, head) => {
    const upstream = connect(5136, '127.0.0.1', () => {
      const forwarded = { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' }
      upstream.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(forwarded)
            .map(([name, value]) => `${name}: ${value}`)
            .join('\r\n') +
          '\r\n\r\n',
      )
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.on('close', () => socket.destroy())
  })
  const contexts = await Promise.all(
    Array.from({ length: 7 }, () =>
      browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      }),
    ),
  )
  try {
    await startServer()
    await new Promise<void>((resolve) => proxy.listen(5176, '127.0.0.1', resolve))
    const redirect = await fetch(`${backend}/`, { redirect: 'manual' })
    expect(redirect.status).toBe(307)
    expect(redirect.headers.get('location')).toBe('https://127.0.0.1/')
    const sessionProbe = await contexts[0].request.get(`${origin}/api/session`)
    expect(sessionProbe.status(), output).toBe(200)
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    const websockets = new Set<number>()
    const errors: string[] = []
    pages.forEach((page, i) => {
      page.on('websocket', (ws) => {
        if (ws.url().includes('/hubs/game')) websockets.add(i)
      })
      page.on('pageerror', (error) => errors.push(error.message))
    })
    await Promise.all(
      pages.map(async (page) => {
        await page.goto(origin)
        await expect(page.locator('.connection')).toHaveText('Live')
      }),
    )
    expect(websockets.size).toBe(7)
    const profiles: CharacterProfile[] = await (await pages[0].request.get(`${origin}/api/characters`)).json()
    expect(profiles).toHaveLength(8)
    for (const profile of profiles) {
      const response = await pages[0].request.get(`${origin}${profile.imageUrl}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/jpeg')
      const image = pages[0].getByRole('img', { name: profile.name, exact: true })
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    }
    for (let i = 0; i < 4; i++) {
      const response = await pages[i].request.post(`${origin}/api/game/players`, {
        headers,
        data: { name: `Hosted ${i + 1}`, color: colors[i], character: profiles[i].id },
      })
      expect(response.status()).toBe(200)
    }
    const game = async (): Promise<Game> => (await pages[0].request.get(`${origin}/api/game`)).json()
    const lobby = await game()
    expect(lobby.players).toHaveLength(4)
    for (let i = 0; i < 7; i++) {
      const cookie = (await contexts[i].cookies(origin)).find((c) => c.name === 'Marauders.Browser')!
      expect(cookie.secure).toBeTruthy()
      expect(cookie.httpOnly).toBeTruthy()
      expect(cookie.sameSite).toBe('Strict')
      const session = await (await pages[i].request.get(`${origin}/api/session`)).json()
      expect(session.playerId).toBe(i < 4 ? lobby.players[i].id : null)
    }
    for (let i = 0; i < 4; i++) {
      expect(
        (
          await pages[i].request.post(`${origin}/api/game/action`, {
            headers,
            data: { type: 'set-ready', isReady: true, lobbyVersion: lobby.lobbyVersion },
          })
        ).status(),
      ).toBe(200)
    }
    const draft = await game()
    expect(draft.phase).toBe('draft')
    for (let i = 4; i < 7; i++)
      expect(
        (
          await pages[i].request.post(`${origin}/api/game/action`, {
            headers,
            data: { type: 'draft', portId: draft.ports[0].id },
          })
        ).status(),
      ).toBe(400)
    await stopServer()
    await startServer()
    // Existing tabs reconnect to the restarted process with the same signing keys.
    for (const page of pages)
      await expect(page.locator('.connection')).toHaveText('Live', { timeout: 30_000 })
    expect((await game()).id).toBe(draft.id)
    expect((await game()).revision).toBe(draft.revision)
    for (let i = 0; i < 4; i++)
      expect((await (await pages[i].request.get(`${origin}/api/session`)).json()).playerId).toBe(
        lobby.players[i].id,
      )
    const spectator = pages[6]
    await spectator.getByRole('link', { name: 'Game controller', exact: true }).first().click()
    await spectator.getByLabel('Reset password', { exact: true }).fill(password)
    await spectator.getByRole('checkbox').check()
    await spectator.getByRole('button', { name: 'Review reset', exact: true }).click()
    await spectator.getByRole('button', { name: 'Confirm reset', exact: true }).click()
    await expect.poll(async () => (await game()).players.length).toBe(0)
    for (const page of pages) {
      await expect(page.locator('.connection')).toHaveText('Live')
      if (page !== spectator) await expect(page.locator('.profile-picker button')).toHaveCount(8)
    }
    const reset = await game()
    expect(reset.id).not.toBe(draft.id)
    expect(
      (
        await spectator.request.post(`${origin}/api/game/reset`, {
          headers,
          data: { password, gameId: draft.id, expectedRevision: draft.revision },
        })
      ).status(),
    ).toBe(400)
    const archives = await readdir(path.join(directory, 'data/backups'))
    expect(archives).toHaveLength(1)
    const archive = await readFile(path.join(directory, 'data/backups', archives[0]), 'utf8')
    expect(JSON.parse(archive).game.id).toBe(draft.id)
    expect(archive).not.toContain(password)
    for (const privatePath of ['/data/game-state-v2.json', '/data/keys/', '/Game__ResetPassword']) {
      const response = await spectator.request.get(`${origin}${privatePath}`)
      expect(await response.text()).not.toContain('"seats"')
      expect(await response.text()).not.toContain(password)
    }
    await stopServer()
    await startServer()
    expect((await game()).id).toBe(reset.id)
    expect((await game()).players).toHaveLength(0)
    expect(existsSync(path.join(directory, 'data/keys'))).toBeTruthy()
    expect(errors).toEqual([])
  } finally {
    await stopServer()
    proxy.closeAllConnections()
    await Promise.all(contexts.map((context) => context.close()))
    await testInfo.attach('production-server.log', { body: output, contentType: 'text/plain' })
    await new Promise<void>((resolve) => proxy.close(() => resolve()))
  }
})
