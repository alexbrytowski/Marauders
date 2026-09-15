import { test, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Board, Game } from '../src/game'
import { colors, directions, distance, key } from '../src/game'
import { openLocalCrew } from '../../tools/local-crew.mjs'

const root = path.resolve('..')
let server: ChildProcess
let dataDirectory: string
let output = ''
const headers = { 'X-Marauders-Client': 'web' }
const resetPassword = randomBytes(24).toString('hex')
const characterIds = [
  'navigator',
  'corsair',
  'privateer',
  'buccaneer',
  'captain-5',
  'captain-6',
  'captain-7',
  'captain-8',
]
const characterNames = [
  'Alex the Merciless',
  'Alyssa the Sea Witch',
  'Dylan the Salty Dog',
  'Hayven the Merchant',
  'Jacob the Vengeful',
  'Jared the Oil Baron',
  'Josh the Phantom',
  'Steven the Cruel',
]

test('overnight changes synchronize whirlpools, hover details, equivalent battles and confirmed forfeits', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    const errors: string[] = []
    for (let i = 0; i < pages.length; i++) {
      pages[i].on('pageerror', (e) => errors.push(e.message))
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Overnight ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const sea = new Set(board.cells.filter((c) => c.terrain === 'water').map(key))
    const open = board.cells.find((c) =>
      [-3, -2, -1, 0, 1, 2, 3, 4].every((q) =>
        [-1, 0, 1].every((r) => sea.has(key({ q: c.q + q, r: c.r + r }))),
      ),
    )!
    const first = { q: open.q + 1, r: open.r }
    const second = board.cells.find(
      (c) =>
        c.terrain === 'water' &&
        distance(c, first) >= 10 &&
        directions.some((d) => sea.has(key({ q: c.q + d.q, r: c.r + d.r }))),
    )!
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    await stopServer()
    const saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      phase: 'playing',
      activePlayerId: ids[0],
      turnOrder: ids,
      turnNumber: 1,
      remainingActions: 2,
      remainingMovement: 6,
      lastRoll: 6,
      isBuildPhase: false,
      turnEndsAt: new Date(Date.now() + 1_800_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 900_000).toISOString(),
      ships: [
        {
          id: 'overnight-a',
          number: 10,
          ownerId: ids[0],
          portId: 'port-1',
          q: open.q,
          r: open.r,
          perk: 'mouth-to-feed',
        },
        // Keep every captain able to act during the eight-turn lifetime check.
        // Shipless captains with full construction queues can skip their turns.
        ...[1, 2, 3].map((i) => {
          const portId = `port-${i * 3 + 1}`
          const hex = board.cells.find((c) => c.harborId === portId)!
          return { id: `overnight-idle-${i}`, ownerId: ids[i], portId, number: 30 + i, q: hex.q, r: hex.r }
        }),
      ],
      constructions: [
        {
          id: 'overnight-build',
          ownerId: ids[0],
          portId: 'port-1',
          remainingOwnerTurns: 2,
          startedTurnNumber: 1,
        },
      ],
      perkPickups: [],
      whirlpool: { first, second: { q: second.q, r: second.r }, remainingTurns: 8 },
      revision: saved.game.revision + 1,
    })
    saved.game.ports.forEach(
      (p: { ownerId: string | null }, i: number) => (p.ownerId = i < 12 ? ids[Math.floor(i / 3)] : null),
    )
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      await expect(page.locator('.sea-map [data-whirlpool]')).toHaveCount(2)
    }
    await pages[0].locator('.sea-map [data-port="port-1"]').hover()
    await expect(pages[0].getByRole('tooltip')).toContainText(
      'Building 1 ship(s). Ship 1: 2 owner rounds until launch',
    )
    await expect(pages[0].locator('[data-port="port-1"]')).toHaveAttribute('data-building', '1')
    await pages[0].locator('[data-ship="overnight-a"]').hover()
    await expect(pages[0].getByRole('tooltip')).toContainText('Mouth to Feed')
    await expect(pages[0].getByTestId('player-card-0').locator('.captain-stats')).toContainText('1/7')
    await pages[0].screenshot({ path: testInfo.outputPath('overnight-hover-and-whirlpools.png') })
    await pages[0].locator('[data-ship="overnight-a"]').click()
    await pages[0].locator(`[data-hex="${key(first)}"]`).click()
    await expect(pages[0].getByRole('button', { name: /Sail 1 hex/ })).toContainText(
      'teleport, then chart again',
    )
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Sail 1 hex/ }).click())
    expect(game.ships[0]).toMatchObject({ q: second.q, r: second.r })
    expect(game.remainingMovement).toBe(5)
    for (const page of pages)
      await expect(page.locator(`[data-hex="${key(second)}"]`)).toHaveAttribute('data-ship', 'overnight-a')
    // The exact pair and timer survive a process restart in all signed sessions.
    await stopServer()
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      await expect(page.locator('.whirlpool-status')).toContainText('8 turns left')
    }
    expect((await state(pages[4])).whirlpool).toEqual(game.whirlpool)
    const out = directions
      .map((d) => ({ q: second.q + d.q, r: second.r + d.r }))
      .find((h) => sea.has(key(h)))!
    await pages[0].locator('[data-ship="overnight-a"]').click()
    await pages[0].locator(`[data-hex="${key(out)}"]`).click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Sail 1 hex/ }).click())
    expect(game.ships[0]).toMatchObject(out)
    expect(game.remainingMovement).toBe(4)
    for (let round = 1; round <= 8; round++) {
      const turn = game.turnNumber
      const actor = pages[ids.indexOf(game.activePlayerId!)]
      while (game.turnNumber === turn) {
        const response = await actor.request.post('/api/game/action', {
          headers,
          data: { type: 'end-turn', expectedRevision: game.revision },
        })
        expect(response.status()).toBe(200)
        game = await response.json()
      }
      if (round < 8)
        for (const page of pages)
          await expect(page.locator('.whirlpool-status')).toContainText(`${8 - round} turns left`)
    }
    expect(game.whirlpool).toBeNull()
    for (const page of pages) await expect(page.locator('.sea-map [data-whirlpool]')).toHaveCount(0)
    // Reproduce the supplied PNG: both target pairs have exactly the same forces.
    await stopServer()
    const battleSave = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(battleSave.game, {
      activePlayerId: ids[0],
      remainingActions: 2,
      remainingMovement: 2,
      isBuildPhase: false,
      whirlpool: null,
      combat: null,
      combatChoices: [],
      ships: [
        {
          id: 'overnight-a',
          number: 10,
          ownerId: ids[0],
          portId: 'port-1',
          q: open.q,
          r: open.r,
          perk: 'mouth-to-feed',
        },
        { id: 'overnight-ah', number: 8, ownerId: ids[0], portId: 'port-1', q: open.q - 1, r: open.r },
        { id: 'overnight-b', number: 21, ownerId: ids[1], portId: 'port-4', q: open.q + 2, r: open.r },
        { id: 'overnight-bh', number: 22, ownerId: ids[1], portId: 'port-4', q: open.q + 2, r: open.r - 1 },
      ],
      revision: battleSave.game.revision + 1,
    })
    await writeFile(savePath, JSON.stringify(battleSave))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    await pages[0].locator('[data-ship="overnight-a"]').click()
    await pages[0].locator(`[data-hex="${key(first)}"]`).click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Sail 1 hex/ }).click())
    expect(game.combatChoices).toHaveLength(0)
    expect(game.combat?.participantShipIds).toHaveLength(4)
    for (const page of pages) {
      await expect(page.getByLabel('Battle close-up')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Choose your battle' })).toHaveCount(0)
    }
    await pages[0].screenshot({ path: testInfo.outputPath('overnight-single-battle.png') })
    expect(
      (
        await pages[4].request.post('/api/game/action', {
          headers,
          data: { type: 'forfeit', playerId: ids[0], expectedRevision: game.revision },
        })
      ).status(),
    ).toBe(400)
    await pages[1].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    await expect(pages[1].getByRole('dialog', { name: 'Forfeit this voyage?' })).toContainText(
      '3 ports will become neutral with full defense. Your 2 ships',
    )
    await pages[1].getByRole('button', { name: 'Keep playing' }).click()
    expect((await state(pages[0])).ports).toHaveLength(13)
    await pages[1].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Roll battle dice/ }).click(),
    )
    await expect(pages[1].getByRole('dialog', { name: 'Forfeit this voyage?' })).toContainText(
      'The game changed',
    )
    await pages[1].getByRole('button', { name: 'Review latest state' }).click()
    const turn = game.turnNumber
    game = await clickAction(pages[1], () =>
      pages[1].getByRole('button', { name: 'Confirm forfeit' }).click(),
    )
    expect(game.ports).toHaveLength(13)
    expect(game.ships).toHaveLength(2)
    expect(game.turnNumber).toBe(turn)
    expect(game.combat).toBeNull()
    for (const page of pages) {
      await expect(page.locator('.sea-map [data-port]')).toHaveCount(13)
      await expect(page.getByLabel('Battle close-up')).toHaveCount(0)
    }
    await expect(pages[1].locator('.identity')).toContainText('Spectating')
    await pages[1].reload()
    await expect(pages[1].locator('.identity')).toContainText('Spectating')
    expect(
      (
        await pages[1].request.post('/api/game/action', {
          headers,
          data: { type: 'roll-movement', playerId: ids[0] },
        })
      ).status(),
    ).toBe(400)
    // Leaving during the active turn advances play, then a final forfeit wins.
    await pages[0].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Confirm forfeit' }).click(),
    )
    expect(game.activePlayerId).toBe(ids[2])
    expect(game.turnNumber).toBe(turn + 1)
    expect(game.constructions.some((b) => b.ownerId === ids[0] || b.ownerId === ids[1])).toBe(false)
    await pages[3].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    game = await clickAction(pages[3], () =>
      pages[3].getByRole('button', { name: 'Confirm forfeit' }).click(),
    )
    expect(game.phase).toBe('finished')
    expect(game.winnerId).toBe(ids[2])
    expect(game.ports).toHaveLength(13)
    await stopServer()
    await startServer()
    await pages[4].reload()
    await expect(pages[4].locator('.connection')).toHaveText('Live')
    expect((await state(pages[4])).winnerId).toBe(ids[2])
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('automatic rebuilding, six-die clocks and final-opponent forfeit synchronize and persist', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    for (let i = 0; i < pages.length; i++) {
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Pacing ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    await stopServer()
    const saved = JSON.parse(await readFile(savePath, 'utf8'))
    const first = board.cells.find((c) => c.harborId === 'port-1')!
    const fleet = Array.from({ length: 8 }, (_, i) =>
      board.cells
        .filter((c) => c.harborId === `port-${i + 4}`)
        .slice(0, 2)
        .map((c, n) => ({
          id: `large-fleet-${i}-${n}`,
          ownerId: ids[1],
          portId: `port-${i + 4}`,
          number: i * 2 + n + 2,
          q: c.q,
          r: c.r,
        })),
    ).flat()
    expect(fleet).toHaveLength(16)
    Object.assign(saved.game, {
      phase: 'playing',
      activePlayerId: ids[0],
      turnOrder: ids,
      turnNumber: 9,
      remainingActions: 0,
      remainingMovement: 0,
      isBuildPhase: true,
      availableBuilds: 5,
      turnEndsAt: new Date(Date.now() + 600_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 600_000).toISOString(),
      ships: [
        { id: 'small-fleet', ownerId: ids[0], portId: 'port-1', number: 1, q: first.q, r: first.r },
        ...fleet,
      ],
      constructions: [],
      perkPickups: [],
      revision: saved.game.revision + 1,
    })
    saved.game.ports.forEach((p: { ownerId: string | null }, i: number) => {
      p.ownerId = i < 3 ? ids[0] : i < 12 ? ids[1] : null
    })
    await writeFile(savePath, JSON.stringify(saved))
    await startServer(false, true)
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    game = await state(pages[0])
    expect(
      (
        await pages[4].request.post('/api/game/action', {
          headers,
          data: { type: 'end-turn', playerId: ids[0], expectedRevision: game.revision },
        })
      ).status(),
    ).toBe(400)
    expect(
      (
        await pages[1].request.post('/api/game/action', {
          headers,
          data: { type: 'build', portId: 'port-2', expectedRevision: game.revision },
        })
      ).status(),
    ).toBe(400)
    await pages[0].locator('.sea-map [data-port="port-2"]').click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /^Build at / }).click())
    const manual = game.constructions[0]
    await expect(pages[0].locator('.command-buttons')).toContainText('random ports for any left at turn end')
    await pages[0].screenshot({ path: testInfo.outputPath('automatic-build-hint.png'), fullPage: true })
    await pages[0].getByRole('button', { name: 'Finish round →', exact: true }).click()
    const endReview = pages[0].getByRole('dialog', { name: 'Finish this round?' })
    await expect(endReview).toContainText('4 ships without a chosen build port')
    await expect(endReview).toContainText('Any unassigned builds will start at randomly chosen ports you own')
    await endReview.getByRole('button', { name: 'Keep playing' }).click()
    expect((await state(pages[0])).revision).toBe(game.revision)
    await pages[0].getByRole('button', { name: 'Finish round →', exact: true }).click()
    await pages[0].screenshot({ path: testInfo.outputPath('unfinished-builds-confirmation.png') })
    game = await clickAction(pages[0], () =>
      endReview.getByRole('button', { name: 'Finish round anyway' }).click(),
    )
    expect(game.activePlayerId).toBe(ids[1])
    expect(game.remainingActions).toBe(6)
    const started = new Date(game.events.findLast((e) => e.kind === 'turn')!.at).getTime()
    expect(new Date(game.turnEndsAt!).getTime() - started).toBe(315_000)
    expect(new Date(game.actionEndsAt!).getTime() - started).toBe(45_000)
    expect(game.constructions).toHaveLength(5)
    expect(game.constructions.find((b) => b.id === manual.id)).toEqual(manual)
    expect(game.events.filter((e) => e.message.includes('automatically started a ship'))).toHaveLength(4)
    for (const build of game.constructions) {
      expect(build.remainingOwnerTurns).toBe(2)
      expect(game.ports.find((p) => p.id === build.portId)?.ownerId).toBe(ids[0])
    }
    for (const page of pages) {
      await expect(page.locator('.captains-log')).toContainText('automatically started a ship')
      expect((await state(page)).constructions).toEqual(game.constructions)
    }
    const budget = game.turnEndsAt
    const builds = game.constructions
    await stopServer()
    await startServer(false, true)
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      const restored = await state(page)
      expect(restored.turnEndsAt).toBe(budget)
      expect(restored.constructions).toEqual(builds)
    }
    // Expire an unfinished six-die turn; the server fills its two missing ships.
    await stopServer()
    const expired = JSON.parse(await readFile(savePath, 'utf8'))
    expired.game.actionEndsAt = new Date(Date.now() - 1_000).toISOString()
    await writeFile(savePath, JSON.stringify(expired))
    await startServer(false, true)
    await expect.poll(async () => (await state(pages[4])).turnNumber).toBe(11)
    game = await state(pages[4])
    expect(game.activePlayerId).toBe(ids[0])
    expect(game.constructions.filter((b) => b.ownerId === ids[1])).toHaveLength(2)
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      expect((await state(page)).constructions).toEqual(game.constructions)
    }
    await pages[1].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    game = await clickAction(pages[1], () =>
      pages[1].getByRole('button', { name: 'Confirm forfeit' }).click(),
    )
    expect(game.phase).toBe('finished')
    expect(game.winnerId).toBe(ids[0])
    expect(game.players.filter((p) => !p.hasForfeited)).toHaveLength(3)
    expect(game.ports.filter((p) => p.ownerId === null)).toHaveLength(10)
    expect(game.turnEndsAt).toBeNull()
    expect(game.actionEndsAt).toBeNull()
    expect(game.roundHistory.filter((h) => h.isFinal)).toHaveLength(1)
    for (const page of pages) {
      await expect(page.locator('.victory-banner')).toContainText('The only captain with ports')
      await expect(page.locator('.countdown')).toHaveCount(0)
    }
    await stopServer()
    await startServer(false, true)
    await pages[4].reload()
    await expect(pages[4].locator('.victory-banner')).toContainText('Pacing 1 rules the sea')
    const finished = await state(pages[4])
    expect(finished.winnerId).toBe(ids[0])
    expect(finished.roundHistory.filter((h) => h.isFinal)).toHaveLength(1)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

async function startServer(published = false, playtestTimers = false) {
  output = ''
  const environment = { ...process.env }
  if (playtestTimers) {
    delete environment.Game__TurnSeconds
    delete environment.Game__ActionSeconds
  }
  const localDotnet = path.join(root, '.dotnet-sdk', 'dotnet.exe')
  server = spawn(
    existsSync(localDotnet) ? localDotnet : 'dotnet',
    [
      path.join(
        root,
        published
          ? 'artifacts/publish/Marauders.Server.dll'
          : `server/bin/${process.env.MARAUDERS_TEST_CONFIGURATION ?? 'Release'}/net10.0/Marauders.Server.dll`,
      ),
      '--urls',
      'http://127.0.0.1:5134',
    ],
    {
      cwd: path.join(root, published ? 'artifacts/publish' : 'server'),
      windowsHide: true,
      env: {
        ...environment,
        ASPNETCORE_ENVIRONMENT: 'Development',
        Game__DataDirectory: dataDirectory,
        ...(playtestTimers ? {} : { Game__TurnSeconds: '1800', Game__ActionSeconds: '900' }),
        Game__ResetPassword: resetPassword,
        DOTNET_CLI_HOME: path.join(root, '.dotnet'),
        ...(existsSync(localDotnet) ? { DOTNET_ROOT: path.dirname(localDotnet) } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  server.stdout?.on('data', (b) => {
    output += b.toString()
  })
  server.stderr?.on('data', (b) => {
    output += b.toString()
  })
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error(output)
        try {
          return (await fetch('http://127.0.0.1:5134/api/health')).status
        } catch {
          return 0
        }
      },
      { timeout: 20_000 },
    )
    .toBe(200)
  const sessionCheck = await fetch('http://127.0.0.1:5134/api/session')
  expect(sessionCheck.status, output).toBe(200)
}
async function stopServer() {
  if (server && server.exitCode === null) {
    const stopped = new Promise<void>((resolve) => server.once('exit', () => resolve()))
    server.kill()
    await stopped
  }
}
async function state(page: Page): Promise<Game> {
  return (await page.request.get('/api/game')).json()
}
async function readyCrew(pages: Page[]) {
  let game = await state(pages[0])
  for (const page of pages.slice(0, 4)) {
    await expect(page.getByRole('button', { name: 'Ready to sail', exact: true })).toBeEnabled()
    game = await clickAction(page, () =>
      page.getByRole('button', { name: 'Ready to sail', exact: true }).click(),
    )
  }
  return game
}
async function clickAction(page: Page, click: () => Promise<void>) {
  const [result] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/game/action') && r.request().method() === 'POST'),
    click(),
  ])
  expect(result.status(), await result.text()).toBe(200)
  // The response can arrive before React has applied the new revision.
  await expect(page.locator('.error')).toHaveCount(0)
  return result.json() as Promise<Game>
}

test.beforeEach(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'marauders-e2e-'))
  await startServer()
})
test.afterEach(async () => {
  await stopServer()
})

test('early endings confirm unused dice and movement while other browsers and timeouts stay in sync', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    const errors: string[] = []
    for (let i = 0; i < pages.length; i++) {
      pages[i].on('pageerror', (error) => errors.push(error.message))
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Careful captain ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await readyCrew(pages)
    const ids = game.players.map((player) => player.id)
    const actor = pages[0]
    const endActions = actor.getByRole('button', { name: 'End actions', exact: true })
    const review = actor.getByRole('dialog', { name: 'End actions early?' })
    let endRequests = 0
    actor.on('request', (request) => {
      if (request.url().endsWith('/api/game/action') && request.postDataJSON()?.type === 'end-turn')
        endRequests++
    })
    for (const page of pages.slice(1))
      await expect(page.getByRole('button', { name: 'End actions', exact: true })).toHaveCount(0)
    await endActions.click()
    await expect(review).toContainText('2 unused action dice')
    await expect(review.getByRole('listitem')).toHaveCount(1)
    await expect(review.getByRole('button', { name: 'Keep playing' })).toBeFocused()
    await actor.keyboard.press('Enter')
    await expect(review).not.toBeVisible()
    await expect(endActions).toBeFocused()
    await endActions.click()
    await actor.keyboard.press('Escape')
    await expect(review).not.toBeVisible()
    expect(endRequests).toBe(0)
    expect((await state(actor)).revision).toBe(game.revision)
    for (const page of pages.slice(1)) {
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await expect(page.getByLabel('Turn status')).toContainText('Careful captain 1 has the helm')
    }

    // A same-seat tab can act while the first tab is reviewing. The old review must close.
    const sibling = await contexts[0].newPage()
    await sibling.goto('/')
    await expect(sibling.locator('.connection')).toHaveText('Live')
    await endActions.click()
    game = await clickAction(sibling, () => sibling.getByRole('button', { name: 'Roll to sail' }).click())
    await expect(review).not.toBeVisible()
    expect(endRequests).toBe(0)
    await endActions.click()
    await expect(review).toContainText('1 unused action die')
    await expect(review).toContainText(`${game.remainingMovement} movement points`)
    await actor.screenshot({ path: testInfo.outputPath('unused-actions-confirmation.png') })
    game = await clickAction(actor, () => review.getByRole('button', { name: 'End actions anyway' }).click())
    expect(endRequests).toBe(1)
    expect(game.activePlayerId).toBe(ids[1])
    expect(game.turnNumber).toBe(2)
    await expect(review).not.toBeVisible()
    for (const page of [actor, ...pages.slice(2), sibling])
      await expect(page.getByLabel('Turn status')).toContainText('Careful captain 2 has the helm')

    // The last die has been rolled, but its remaining movement still needs confirmation.
    const second = pages[1]
    await clickAction(second, () => second.getByRole('button', { name: 'Roll to sail' }).click())
    await clickAction(second, () => second.getByRole('button', { name: 'Pass movement' }).click())
    game = await clickAction(second, () => second.getByRole('button', { name: 'Roll to sail' }).click())
    expect(game.remainingActions).toBe(0)
    await second.getByRole('button', { name: 'End actions', exact: true }).click()
    const movementReview = second.getByRole('dialog', { name: 'End actions early?' })
    await expect(movementReview.getByRole('listitem')).toHaveText(`${game.remainingMovement} movement points`)
    game = await clickAction(second, () =>
      movementReview.getByRole('button', { name: 'End actions anyway' }).click(),
    )
    expect(game.activePlayerId).toBe(ids[2])

    // Review is local UI; it cannot hold up the authoritative action clock.
    await stopServer()
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    const saved = JSON.parse(await readFile(savePath, 'utf8'))
    saved.game.actionEndsAt = new Date(Date.now() + 15_000).toISOString()
    const missingShip = game.ships.find((ship) => ship.ownerId === ids[3])!
    saved.game.ships = saved.game.ships.filter((ship: { id: string }) => ship.id !== missingShip.id)
    saved.game.revision++
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    await pages[2].getByRole('button', { name: 'End actions', exact: true }).click()
    const timeoutReview = pages[2].getByRole('dialog', { name: 'End actions early?' })
    await expect(timeoutReview).toBeVisible()
    await expect(timeoutReview).not.toBeVisible({ timeout: 20_000 })
    game = await state(pages[2])
    expect(game.activePlayerId).toBe(ids[3])
    expect(game.turnNumber).toBe(4)
    for (const page of pages.slice(0, 3).concat(pages[4]))
      await expect(page.getByLabel('Turn status')).toContainText('Careful captain 4 has the helm')

    // Once the captain has used every die and assigned every build, finishing needs no extra click.
    const fourth = pages[3]
    for (let i = 0; i < 2; i++) {
      await clickAction(fourth, () => fourth.getByRole('button', { name: 'Roll to sail' }).click())
      game = await clickAction(fourth, () => fourth.getByRole('button', { name: 'Pass movement' }).click())
    }
    expect(game.isBuildPhase).toBe(true)
    expect(game.availableBuilds).toBe(1)
    const buildPort = game.ports.find((port) => port.ownerId === ids[3])!
    await fourth.locator(`.sea-map [data-port="${buildPort.id}"]`).click()
    game = await clickAction(fourth, () => fourth.getByRole('button', { name: /^Build at / }).click())
    expect(game.availableBuilds).toBe(0)
    game = await clickAction(fourth, () =>
      fourth.getByRole('button', { name: 'Finish round →', exact: true }).click(),
    )
    expect(game.activePlayerId).toBe(ids[0])
    expect(game.turnNumber).toBe(5)
    await expect(fourth.getByRole('dialog')).not.toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('construction battles stay with the finishing captain through restart before the next turn begins', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    const errors: string[] = []
    for (let i = 0; i < pages.length; i++) {
      pages[i].on('pageerror', (error) => errors.push(error.message))
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Launch captain ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await state(pages[0])
    const ids = game.players.map((player) => player.id)
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const harbor = board.cells.filter((cell) => cell.harborId === 'port-4')
    expect(harbor.length).toBeGreaterThan(2)
    const distant = board.cells.find((cell) => cell.terrain === 'water' && distance(cell, harbor[0]) > 8)!
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    await stopServer()
    const saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      phase: 'playing',
      activePlayerId: ids[1],
      turnOrder: ids,
      turnNumber: 10,
      remainingActions: 0,
      remainingMovement: 0,
      isBuildPhase: true,
      isEndingRound: false,
      turnEndsAt: new Date(Date.now() + 600_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 600_000).toISOString(),
      ships: [
        ...harbor.slice(0, 2).map((cell, i) => ({
          id: `launch-enemy-${i}`,
          ownerId: ids[0],
          portId: 'port-1',
          number: i + 1,
          q: cell.q,
          r: cell.r,
        })),
        { id: 'next-captain', ownerId: ids[2], portId: 'port-7', number: 3, q: distant.q, r: distant.r },
      ],
      constructions: [
        { id: 'due-launch', ownerId: ids[1], portId: 'port-4', remainingOwnerTurns: 1, startedTurnNumber: 2 },
        {
          id: 'later-launch',
          ownerId: ids[1],
          portId: 'port-5',
          remainingOwnerTurns: 2,
          startedTurnNumber: 6,
        },
      ],
      perkPickups: [],
      combat: null,
      combatChoices: [],
      revision: saved.game.revision + 1,
    })
    saved.game.ports.forEach((port: { ownerId: string | null }, i: number) => {
      port.ownerId = i < 12 ? ids[Math.floor(i / 3)] : null
    })
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    const builder = pages[1]
    await builder.getByRole('button', { name: 'Finish round →', exact: true }).click()
    game = await clickAction(builder, () =>
      builder.getByRole('button', { name: 'Finish round anyway' }).click(),
    )
    expect(game.activePlayerId).toBe(ids[1])
    expect(game.turnNumber).toBe(10)
    expect(game.isEndingRound).toBe(true)
    expect(game.combatPlayerId).toBe(ids[1])
    expect(game.combat?.attackerId).toBe(ids[1])
    expect(game.combat?.defenderId).toBe(ids[0])
    expect(game.turnEndsAt).toBeNull()
    expect(game.availableBuilds).toBe(0)
    expect(game.constructions.find((build) => build.id === 'later-launch')?.remainingOwnerTurns).toBe(1)
    expect(game.roundHistory).toHaveLength(0)
    const builds = game.constructions
    const battleId = game.combat!.id
    for (const page of pages) {
      await expect(page.getByRole('dialog', { name: 'Battle on the high seas' })).toBeVisible()
      await expect(page.locator('.battle-note')).toContainText('before the next captain’s turn begins')
    }
    for (const i of [0, 2, 3, 4]) {
      await expect(pages[i].getByRole('button', { name: 'Roll battle dice', exact: true })).toHaveCount(0)
      await expect(pages[i].locator('.battle-actions')).toContainText('Waiting for Launch captain 2 to roll')
      expect(
        (
          await pages[i].request.post('/api/game/action', {
            headers,
            data: {
              type: 'roll-combat',
              combatId: battleId,
              playerId: ids[1],
              expectedRevision: game.revision,
            },
          })
        ).status(),
      ).toBe(400)
    }
    expect((await state(builder)).revision).toBe(game.revision)
    await builder
      .getByRole('dialog', { name: 'Battle on the high seas' })
      .screenshot({ path: testInfo.outputPath('construction-battle-controller.png') })
    await stopServer()
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      const restored = await state(page)
      expect(restored.combat?.id).toBe(battleId)
      expect(restored.isEndingRound).toBe(true)
      expect(restored.combatPlayerId).toBe(ids[1])
      expect(restored.availableBuilds).toBe(0)
      expect(restored.constructions).toEqual(builds)
      expect(restored.turnEndsAt).toBeNull()
    }
    for (let exchanges = 0; game.isEndingRound; exchanges++) {
      expect(exchanges).toBeLessThan(30)
      if (game.combat!.status === 'awaiting-roll') {
        game = await clickAction(builder, () =>
          builder.getByRole('button', { name: /Roll (battle dice|next exchange)/ }).click(),
        )
      } else if (game.combat!.status === 'choose-loss') {
        const loser = pages[ids.indexOf(game.combat!.losingPlayerId!)]
        const casualty = game.ships.find(
          (ship) =>
            ship.ownerId === game.combat!.losingPlayerId && game.combat!.participantShipIds.includes(ship.id),
        )!
        await loser
          .locator('.battle-fleet')
          .getByRole('button', { name: new RegExp(`^Ship ${casualty.number} `) })
          .click()
        game = await clickAction(loser, () =>
          loser.getByRole('button', { name: `Lose ship ${casualty.number}` }).click(),
        )
      } else {
        await expect(pages[2].getByRole('button', { name: /Continue the voyage/ })).toHaveCount(0)
        game = await clickAction(builder, () =>
          builder.getByRole('button', { name: /Continue the voyage/ }).click(),
        )
      }
    }
    expect(game.activePlayerId).toBe(ids[2])
    expect(game.turnNumber).toBe(11)
    expect(game.constructions.filter((build) => build.ownerId === ids[1])).toEqual(builds)
    expect(game.events.filter((event) => event.message.includes('launched a ship'))).toHaveLength(1)
    expect(game.roundHistory).toHaveLength(1)
    const started = new Date(game.events.findLast((event) => event.kind === 'turn')!.at).getTime()
    expect(new Date(game.turnEndsAt!).getTime() - started).toBe(1_800_000)
    expect(new Date(game.actionEndsAt!).getTime() - started).toBe(900_000)
    for (const page of pages) {
      await expect(page.getByRole('dialog', { name: 'Battle on the high seas' })).not.toBeVisible()
      expect((await state(page)).turnNumber).toBe(11)
    }
    await expect(pages[2].getByRole('button', { name: 'Roll to sail' })).toBeEnabled()
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('full playthrough changes synchronize port support, Cheat Death respawns and neutral port capture', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({
        viewport: { width: 1920, height: 1080 },
        reducedMotion: 'reduce',
      }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    const errors: string[] = []
    for (let i = 0; i < pages.length; i++) {
      pages[i].on('pageerror', (error) => errors.push(error.message))
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Playthrough ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    expect(
      (
        await pages[0].request.post('/api/game/action', {
          headers,
          data: { type: 'vote-map', mapId: 'classic' },
        })
      ).status(),
    ).toBe(200)
    let game = await readyCrew(pages)
    const ids = game.players.map((player) => player.id)
    expect(game.ports.filter((port) => port.ownerId === null).map((port) => port.id)).toEqual(['port-7'])
    for (const kind of [
      'black-pearl',
      'glass-cannon',
      'loaded-dice',
      'mouth-to-feed',
      'black-and-white',
      'cheat-death',
    ]) {
      await pages[4].locator(`.sea-map [data-perk="${kind}"]`).hover()
      await pages[4]
        .getByRole('tooltip')
        .screenshot({ path: testInfo.outputPath(`pickup-${kind}-hover.png`) })
    }
    await pages[4].locator('.chart-header').hover()
    await pages[4].locator('.sea-map [data-perk="cheat-death"]').focus()
    await pages[4].getByRole('tooltip').screenshot({ path: testInfo.outputPath('pickup-keyboard-focus.png') })
    await pages[4].screenshot({ path: testInfo.outputPath('uncollected-perk-explanation.png') })
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const portHex = board.cells.find((cell) => cell.portId === 'port-1')!
    const water = board.cells.filter((cell) => cell.terrain === 'water')
    const position = water
      .flatMap((a) =>
        water
          .filter((b) => distance(a, b) === 1 && distance(b, portHex) === 3)
          .map((b) => ({
            a,
            b,
            start: water.find((start) => distance(start, a) === 1 && distance(start, b) > 1),
          })),
      )
      .find(({ a, start }) => distance(a, portHex) === 2 && start)!
    expect(position).toBeTruthy()
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    await stopServer()
    const saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      remainingMovement: 1,
      remainingActions: 2,
      lastRoll: 4,
      combat: null,
      combatChoices: [],
      perkPickups: [],
      whirlpool: null,
      isBuildPhase: false,
      ships: [
        {
          id: 'death-a',
          number: 1,
          ownerId: ids[0],
          portId: 'port-1',
          q: position.start!.q,
          r: position.start!.r,
          perk: 'cheat-death',
        },
        {
          id: 'death-b',
          number: 2,
          ownerId: ids[1],
          portId: 'port-4',
          q: position.b.q,
          r: position.b.r,
          perk: 'cheat-death',
        },
      ],
      revision: game.revision + 1,
    })
    saved.game.ports.forEach(
      (port: { ownerId: string | null }, i: number) =>
        (port.ownerId = i < 12 ? ids[Math.floor(i / 3)] : null),
    )
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    await pages[0].locator('[data-ship="death-a"]').click()
    await pages[0].locator(`[data-hex="${key(position.a)}"]`).click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Sail 1 hex/ }).click())
    expect(game.combat?.supportingPortIds).toEqual(['port-1'])
    for (const page of pages)
      await expect(page.locator('.battle-modal')).toContainText('includes port support within two hexes')
    expect(
      (
        await pages[4].request.post('/api/game/action', {
          headers,
          data: { type: 'roll-combat', combatId: game.combat!.id, playerId: ids[0] },
        })
      ).status(),
    ).toBe(400)
    for (
      let attempt = 0;
      attempt < 30 && !game.events.some((event) => event.message.includes('consumed Cheat Death'));
      attempt++
    ) {
      game = await clickAction(pages[0], () =>
        pages[0].getByRole('button', { name: /Roll (battle dice|next exchange)/ }).click(),
      )
    }
    const consumed = game.events.filter((event) => event.message.includes('consumed Cheat Death')).length
    expect(consumed).toBeGreaterThan(0)
    expect(game.combat?.status).toBe('awaiting-roll')
    expect(game.combat?.message).toContain('used Cheat Death')
    expect(game.perkPickups.filter((pickup) => pickup.kind === 'cheat-death')).toHaveLength(consumed)
    for (const pickup of game.perkPickups) {
      expect(board.cells.find((cell) => key(cell) === key(pickup))?.terrain).toBe('water')
      expect(game.ships.some((ship) => key(ship) === key(pickup))).toBe(false)
    }
    for (const page of pages) {
      await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
      await expect(page.locator('.captains-log')).toContainText('consumed Cheat Death')
      await expect(page.locator('.sea-map [data-perk="cheat-death"]')).toHaveCount(consumed)
      expect((await state(page)).combat).toEqual(game.combat)
    }
    await pages[4].screenshot({ path: testInfo.outputPath('cheat-death-forced-reroll.png'), fullPage: true })
    const rejectedRound = game.combat!.round
    const publicRolls = game.events.filter((event) => event.kind === 'roll').length
    await expect(pages[0].getByRole('button', { name: 'Roll next exchange' })).toBeVisible()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Roll next exchange' }).click(),
    )
    expect(game.combat!.round).toBe(rejectedRound + 1)
    expect(game.events.filter((event) => event.kind === 'roll')).toHaveLength(publicRolls + 1)
    for (const page of pages) {
      await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
      expect((await state(page)).combat).toEqual(game.combat)
    }
    await pages[4].screenshot({ path: testInfo.outputPath('cheat-death-port-support.png'), fullPage: true })
    await stopServer()
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      expect((await state(page)).perkPickups).toEqual(game.perkPickups)
      expect((await state(page)).combat).toEqual(game.combat)
    }
    // A third captain can forfeit while the result is open. Their neutral ports persist.
    await pages[2].getByRole('button', { name: 'Forfeit and leave', exact: true }).click()
    game = await clickAction(pages[2], () =>
      pages[2].getByRole('button', { name: 'Confirm forfeit' }).click(),
    )
    expect(game.ports).toHaveLength(13)
    expect(game.ports.filter((port) => port.ownerId === null)).toHaveLength(4)
    for (const page of pages) await expect(page.locator('.sea-map [data-port]')).toHaveCount(13)
    // Place a surviving ship in that neutral harbor and finish the previous encounter.
    await stopServer()
    const captureSave = JSON.parse(await readFile(savePath, 'utf8'))
    const harbor = board.cells.find((cell) => cell.harborId === 'port-7')!
    Object.assign(captureSave.game, {
      combat: null,
      combatChoices: [],
      remainingMovement: 0,
      remainingActions: 2,
      ships: [
        { id: 'neutral-attacker', number: 3, ownerId: ids[0], portId: 'port-1', q: harbor.q, r: harbor.r },
      ],
      revision: game.revision + 1,
    })
    // A previously weakened neutral port guarantees this scenario's capture.
    captureSave.game.ports.find((port: { id: string }) => port.id === 'port-7').defenseWeakness = 6
    await writeFile(savePath, JSON.stringify(captureSave))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    const attack = await pages[0].request.post('/api/game/action', {
      headers,
      data: { type: 'attack-port', shipId: 'neutral-attacker', portId: 'port-7' },
    })
    expect(attack.status()).toBe(200)
    game = await attack.json()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Roll battle dice/ }).click(),
    )
    expect(game.ports.find((port) => port.id === 'port-7')?.ownerId).toBe(ids[0])
    for (const page of pages) {
      await expect(page.locator('.battle-result')).toContainText('captured Blackwater')
      expect((await state(page)).ports).toEqual(game.ports)
    }
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('portraits and required exclusive choices synchronize across browsers and survive restart', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    for (const page of pages) {
      await page.goto('/')
      await expect(page.locator('.connection')).toHaveText('Live')
      await expect(page.locator('.profile-picker button')).toHaveCount(8)
      await expect(page.locator('form [aria-pressed="true"]')).toHaveCount(0)
    }
    const profiles: { id: string; name: string; imageUrl: string }[] = await (
      await pages[0].request.get('/api/characters')
    ).json()
    expect(profiles.map((p) => p.name)).toEqual(characterNames)
    for (const profile of profiles) {
      const button = pages[0].getByRole('button', { name: `Choose ${profile.name}`, exact: true })
      await expect(button).toBeEnabled()
      // Personal photos stay outside Git. Verify all installed images locally;
      // a checkout without the owner's files must still offer named fallbacks.
      if (existsSync(path.join(root, 'server/wwwroot', profile.imageUrl))) {
        const portrait = button.getByRole('img', { name: profile.name, exact: true })
        await expect(portrait).toBeVisible()
        await expect
          .poll(() => portrait.evaluate((img: HTMLImageElement) => img.naturalWidth))
          .toBeGreaterThan(0)
      } else await expect(button.getByLabel(profile.name, { exact: true })).toBeVisible()
    }
    const join = (page: Page) => page.getByRole('button', { name: /Join the crew/ })
    const chooseCharacter = (page: Page, i: number) =>
      page.getByRole('button', { name: `Choose ${characterNames[i]}`, exact: true })
    const chooseColor = (page: Page, i: number) => page.getByLabel(`Choose ${colors[i]} crew color`)
    await pages[0].getByLabel('CAPTAIN NAME').fill('First claimant')
    await expect(join(pages[0])).toBeDisabled()
    await chooseCharacter(pages[0], 0).click()
    await expect(join(pages[0])).toBeDisabled()
    await pages[0].getByLabel('CAPTAIN NAME').press('Enter')
    expect((await state(pages[0])).players).toHaveLength(0)
    await chooseColor(pages[0], 0).click()
    await expect(join(pages[0])).toBeEnabled()
    await pages[1].getByLabel('CAPTAIN NAME').fill('Second claimant')
    await chooseColor(pages[1], 1).click()
    await expect(join(pages[1])).toBeDisabled()
    await chooseCharacter(pages[1], 0).click()
    await pages[0].screenshot({ path: testInfo.outputPath('characters-desktop.png'), fullPage: true })
    const initial = await state(pages[0])
    for (const data of [
      { name: 'Missing', color: colors[0] },
      { name: 'Missing', character: characterIds[0] },
      { name: 'Invalid', color: colors[0], character: 'unknown' },
      { name: 'Invalid', color: 'red', character: characterIds[0] },
    ])
      expect((await pages[4].request.post('/api/game/players', { headers, data })).status()).toBe(400)
    expect((await state(pages[0])).revision).toBe(initial.revision)
    // Both browsers have selected the same character before either claims it.
    const results = await Promise.all(
      pages.slice(0, 2).map((page, i) =>
        page.request.post('/api/game/players', {
          headers,
          data: { name: `Claimant ${i}`, color: colors[i], character: characterIds[0] },
        }),
      ),
    )
    expect(results.map((r) => r.status()).sort()).toEqual([200, 400])
    const winner = results[0].status() === 200 ? 0 : 1
    const loser = 1 - winner
    expect(await results[loser].json()).toMatchObject({
      error: expect.stringContaining('character is already taken'),
    })
    await expect(chooseCharacter(pages[loser], 0)).toBeDisabled()
    await expect(chooseColor(pages[loser], winner)).toBeDisabled()
    await expect(join(pages[loser])).toBeDisabled()
    await expect(pages[loser].locator('.join-guidance')).toContainText('now taken')
    await expect(pages[loser].locator('.profile-picker [aria-pressed="true"]')).toHaveCount(0)
    let game = await state(pages[0])
    expect(game.players).toHaveLength(1)
    const duplicateColor = await pages[4].request.post('/api/game/players', {
      headers,
      data: { name: 'Color claimant', color: game.players[0].color, character: characterIds[1] },
    })
    expect(duplicateColor.status()).toBe(400)
    expect(await duplicateColor.json()).toMatchObject({
      error: expect.stringContaining('color is already taken'),
    })
    await stopServer()
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    await expect(pages[winner].getByText('Your seat is reserved.')).toBeVisible()
    await expect(chooseCharacter(pages[loser], 0)).toBeDisabled()
    await expect(chooseColor(pages[loser], winner)).toBeDisabled()
    expect((await state(pages[loser])).players).toEqual(game.players)
    const sibling = await contexts[winner].newPage()
    await sibling.goto('/')
    await expect(sibling.getByText('Your seat is reserved.')).toBeVisible()
    await expect(sibling.locator('.crew-identity small')).toHaveText(characterNames[0])
    await sibling.close()
    const left = await pages[winner].request.post('/api/game/action', {
      headers,
      data: { type: 'forfeit', expectedRevision: game.revision },
    })
    expect(left.status()).toBe(200)
    await expect(chooseCharacter(pages[loser], 0)).toBeEnabled()
    await expect(chooseColor(pages[loser], winner)).toBeEnabled()
    for (let i = 0; i < 4; i++) {
      await pages[i].reload()
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      await pages[i].getByLabel('CAPTAIN NAME').fill(`Portrait captain ${i + 1}`)
      await chooseCharacter(pages[i], i).click()
      await chooseColor(pages[i], i).click()
      await join(pages[i]).click()
      await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    }
    game = await state(pages[0])
    expect(new Set(game.players.map((p) => p.character)).size).toBe(4)
    expect(new Set(game.players.map((p) => p.color)).size).toBe(4)
    await expect(pages[4].getByRole('heading', { name: 'Watch the voyage.' })).toBeVisible()
    game = await readyCrew(pages)
    expect(game.phase).toBe('playing')
    await expect(pages[4].locator('.captain-emblem')).toHaveCount(4)
    await pages[4].screenshot({ path: testInfo.outputPath('characters-draft.png'), fullPage: true })
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('captains ready together, restore lobby setup, and automatically start one shared game', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, () =>
      browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    for (let i = 0; i < 5; i++) {
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Ready captain ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    const post = (page: Page, data: object) => page.request.post('/api/game/action', { headers, data })
    for (const page of pages)
      await expect(page.getByLabel('Captain readiness')).toContainText('0 / 4 captains ready')
    await expect(pages[4].getByRole('button', { name: 'Ready to sail', exact: true })).toHaveCount(0)
    expect(
      (
        await post(pages[4], {
          type: 'set-ready',
          isReady: true,
          lobbyVersion: game.lobbyVersion,
          playerId: ids[0],
        })
      ).status(),
    ).toBe(400)
    expect(
      (await post(pages[1], { type: 'set-first-player', firstPlayerId: ids[2], playerId: ids[0] })).status(),
    ).toBe(400)
    expect((await post(pages[0], { type: 'start-draft', firstPlayerId: ids[0] })).status()).toBe(400)
    // Forging another captain's ID still only readies the authenticated seat.
    expect(
      (
        await post(pages[1], {
          type: 'set-ready',
          isReady: true,
          lobbyVersion: game.lobbyVersion,
          playerId: ids[0],
        })
      ).status(),
    ).toBe(200)
    game = await state(pages[0])
    expect(game.players.map((p) => p.isReady)).toEqual([false, true, false, false])
    await clickAction(pages[1], () => pages[1].getByRole('button', { name: 'Undo ready' }).click())
    await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Ready to sail', exact: true }).click(),
    )
    const oldVersion = game.lobbyVersion
    game = await clickAction(pages[0], async () => {
      await pages[0].getByLabel('WHO GOES FIRST?').selectOption(ids[2])
    })
    expect(game.players.every((p) => !p.isReady)).toBe(true)
    for (const page of pages.slice(1))
      await expect(page.getByLabel('Captain readiness')).toContainText('Ready captain 3 takes the first turn')
    expect(
      (await post(pages[1], { type: 'set-ready', isReady: true, lobbyVersion: oldVersion })).status(),
    ).toBe(400)
    await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Ready to sail', exact: true }).click(),
    )
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Vote for Classic', exact: true }).click(),
    )
    expect(game.players[0].isReady).toBe(false)
    await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Ready to sail', exact: true }).click(),
    )
    await clickAction(pages[1], () =>
      pages[1].getByRole('button', { name: 'Ready to sail', exact: true }).click(),
    )
    const sameSeat = await contexts[0].newPage()
    await sameSeat.goto('/')
    await expect(sameSeat.getByRole('button', { name: 'Undo ready' })).toBeVisible()
    await stopServer()
    await startServer()
    for (const page of [...pages, sameSeat]) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
      await expect(page.getByLabel('Captain readiness')).toContainText('2 / 4 captains ready')
    }
    await expect(pages[0].getByLabel('WHO GOES FIRST?')).toHaveValue(ids[2])
    await pages[0].locator('.lobby-panel').screenshot({ path: testInfo.outputPath('ready-lobby.png') })
    // Two simultaneous clicks use the same setup version without revision collisions.
    await Promise.all(
      pages
        .slice(2, 4)
        .map((page) =>
          clickAction(page, () => page.getByRole('button', { name: 'Ready to sail', exact: true }).click()),
        ),
    )
    game = await state(pages[0])
    expect(game.phase).toBe('playing')
    expect(game.activePlayerId).toBe(ids[2])
    expect(
      game.events.filter((e) => e.message.startsWith('Three ports were randomly assigned')),
    ).toHaveLength(1)
    expect(game.mapId).toBe('classic')
    expect(game.perkPickups).toHaveLength(6)
    for (const page of [...pages, sameSeat]) {
      await expect(page.locator('.sea-map [data-perk]')).toHaveCount(6)
      await expect(page.getByLabel('Captain readiness')).toHaveCount(0)
    }
    expect(
      (await post(pages[3], { type: 'set-ready', isReady: true, lobbyVersion: game.lobbyVersion })).status(),
    ).toBe(400)
    // The fourth ready atomically deals all ports and launches the fleets.
    expect(game.ports.filter((p) => !p.ownerId).map((p) => p.id)).toEqual(['port-7'])
    for (const id of ids) expect(game.ports.filter((p) => p.ownerId === id)).toHaveLength(3)
    expect(game.phase).toBe('playing')
    expect(game.ships).toHaveLength(24)
    for (const page of pages) await expect(page.locator('.sea-map [data-ship]')).toHaveCount(24)
    const reset = await pages[4].request.post('/api/game/reset', {
      headers,
      data: { password: resetPassword, gameId: game.id, expectedRevision: game.revision },
    })
    expect(reset.status()).toBe(200)
    for (const page of pages)
      await expect(page.getByLabel('Captain readiness')).toContainText('0 / 4 captains ready')
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('paged handbook teaches with interactive game pieces without changing the voyage', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/#how-to-play')
  await expect(page.locator('.connection')).toHaveText('Live')
  const before = await state(page)
  const chapter = page.locator('.handbook-chapter')
  const feedback = chapter.locator('.example-feedback')
  await expect(page.getByRole('navigation', { name: 'Rule chapters' }).getByRole('link')).toHaveCount(8)
  await expect(page.getByRole('heading', { name: 'Meet the board' })).toBeFocused()
  await chapter.getByRole('button', { name: 'Land', exact: true }).click()
  await expect(feedback).toContainText('cannot sail onto or through')
  await chapter
    .locator('svg [role="button"]')
    .filter({ has: page.locator('.ship-token') })
    .first()
    .focus()
  await page.keyboard.press('Enter')
  await expect(feedback).toContainText('numbered, crew-colored ships')
  await page.screenshot({ path: testInfo.outputPath('handbook-basics.png'), fullPage: true })
  const next = () =>
    page.getByRole('navigation', { name: 'Chapter navigation' }).getByRole('link', { name: /^Next/ }).click()
  await next()
  await expect(page).toHaveURL(/how-to-play\/setup$/)
  await chapter.getByRole('button', { name: 'Show another deal' }).click()
  await expect(feedback).toContainText('Three ports each')
  await next()
  await chapter.getByLabel('Fleet size:').fill('8')
  await expect(chapter).toContainText('8 ships → 3 action dice')
  await chapter.getByRole('button', { name: 'Try a roll of 5' }).click()
  for (let i = 0; i < 3; i++) await chapter.getByRole('button', { name: 'Sail ship 1 one hex' }).click()
  for (let i = 0; i < 2; i++) await chapter.getByRole('button', { name: 'Sail ship 2 one hex' }).click()
  await expect(feedback).toContainText('Ship 1 sailed 3; ship 2 sailed 2. 0 of 5 movement left.')
  await expect(chapter.getByRole('button', { name: 'Sail ship 1 one hex' })).toBeDisabled()
  await next()
  await chapter.getByRole('button', { name: 'Choose a loss', exact: true }).click()
  await chapter.getByRole('button', { name: 'Compare example dice' }).click()
  await chapter.getByRole('button', { name: 'Remove ship 2' }).click()
  await expect(feedback).toContainText('battle continues')
  await page.screenshot({ path: testInfo.outputPath('handbook-battle.png'), fullPage: true })
  await chapter.getByRole('button', { name: 'Tie & reroll', exact: true }).click()
  await chapter.getByRole('button', { name: 'Compare example dice' }).click()
  await expect(feedback).toContainText('Two sixes do not beat one six')
  await chapter.getByRole('button', { name: 'Try the reroll example' }).click()
  await expect(feedback).toContainText('Your 5 beats their 3')
  await chapter.getByText('Combat odds without perks', { exact: true }).click()
  await expect(chapter.getByRole('table', { name: 'Chance to win one exchange' })).toContainText('11.38%')
  await expect(chapter.getByRole('table', { name: 'Chance to win the full encounter' })).toContainText(
    '99.95%',
  )
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`handbook-combat-odds-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await next()
  await chapter.getByRole('button', { name: 'Try a defense win' }).click()
  await chapter.getByRole('button', { name: 'Try another defense win' }).click()
  await chapter.getByRole('button', { name: 'Try another defense win' }).click()
  await chapter.getByRole('button', { name: 'Try the capture example' }).click()
  await expect(feedback).toContainText('You capture the port')
  await expect(chapter.locator('.example-dice .die')).toHaveCount(3)
  await page.screenshot({ path: testInfo.outputPath('handbook-port.png'), fullPage: true })
  await next()
  await chapter.getByRole('button', { name: 'Your second round' }).click()
  await expect(feedback).toContainText('cannot move yet')
  await next()
  await chapter.getByRole('button', { name: 'Glass Cannon' }).click()
  await expect(chapter.getByLabel('Rolled 0')).toBeVisible()
  await expect(chapter.getByLabel('Rolled 8')).toBeVisible()
  await next()
  await chapter.getByRole('button', { name: 'Enter the whirlpool' }).click()
  await expect(feedback).toContainText('now has 3')
  await expect(page).toHaveURL(/how-to-play\/extras$/)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Find an advantage', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Find an advantage', exact: true })).toBeVisible()
  for (const [width, height] of [
    [1920, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`handbook-perks-${width}.png`), fullPage: true })
  }
  expect((await state(page)).revision).toBe(before.revision)
  expect(errors).toEqual([])
})

test('four browser seats, random ports and six perks, automatic launch, permissions, reconnect, shared battles and persistence', async ({
  browser,
}, testInfo) => {
  const contexts: BrowserContext[] = [],
    pages: Page[] = [],
    errors: string[] = []
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } })
    contexts.push(context)
    const page = await context.newPage()
    pages.push(page)
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await expect(page.locator('.connection')).toHaveText('Live')
    if (i < 4) {
      await page.getByLabel('CAPTAIN NAME').fill(['Anne Bonny', 'Blackbeard', 'Mary Read', 'Calico Jack'][i])
      await page.getByLabel(`Choose ${colors[i]} crew color`).click()
      await page.getByRole('button', { name: `Choose ${characterNames[i]}`, exact: true }).click()
      await page.getByRole('button', { name: /Join the crew/ }).click()
      await expect(page.getByText('Your seat is reserved.')).toBeVisible()
      expect(
        (
          await page.request.post('/api/game/players', {
            headers,
            data: { name: 'Duplicate', color: colors[i], character: 'navigator' },
          })
        ).status(),
      ).toBe(400)
    }
  }
  const spectator = pages[4]
  await expect(spectator.getByText('Watch the voyage.')).toBeVisible()
  await pages[0].screenshot({ path: testInfo.outputPath('lobby-desktop.png'), fullPage: true })
  let game = await state(pages[0])
  const ids = game.players.map((p) => p.id)
  expect(
    (
      await spectator.request.post('/api/game/action', {
        headers,
        data: { type: 'start-draft', firstPlayerId: ids[0], playerId: ids[0] },
      })
    ).status(),
  ).toBe(400)
  expect(
    (
      await pages[0].request.post('/api/game/action', {
        data: { type: 'start-draft', firstPlayerId: ids[0] },
      })
    ).status(),
  ).toBe(403)
  game = await readyCrew(pages)
  expect(game.phase).toBe('playing')
  expect(game.ships).toHaveLength(24)
  const revealedPerks = game.perkPickups
  expect(revealedPerks).toHaveLength(6)
  for (const page of pages) await expect(page.locator('.sea-map [data-perk]')).toHaveCount(6)
  await stopServer()
  await startServer()
  for (const page of pages) {
    await page.reload()
    await expect(page.locator('.connection')).toHaveText('Live')
    await expect(page.locator('.sea-map [data-perk]')).toHaveCount(6)
  }
  expect((await state(spectator)).perkPickups).toEqual(revealedPerks)
  expect((await state(spectator)).ports).toEqual(game.ports)
  for (const id of ids) expect(game.ports.filter((p) => p.ownerId === id)).toHaveLength(3)
  const board: Board = await (await pages[0].request.get('/api/board')).json()
  for (const port of game.ports) {
    const ships = game.ships.filter((s) => s.portId === port.id)
    expect(ships).toHaveLength(port.ownerId ? 2 : 0)
    for (const ship of ships) {
      expect(ship.ownerId).toBe(port.ownerId)
      expect(board.cells.find((c) => key(c) === key(ship))?.harborId).toBe(port.id)
    }
  }
  expect(game.ships).toHaveLength(24)
  expect(new Set(game.ships.map(key)).size).toBe(24)
  for (const page of pages) {
    await expect(page.locator('.sea-map [data-ship]')).toHaveCount(24)
    await expect(page.getByRole('button', { name: /Fleet ready/ })).toHaveCount(0)
  }
  await expect(spectator.getByRole('heading', { name: 'Anne Bonny has the helm', exact: true })).toBeVisible()
  expect(await spectator.getByRole('button', { name: 'Roll to sail' }).count()).toBe(0)
  const forged = await pages[1].request.post('/api/game/action', {
    headers,
    data: { type: 'roll-movement', playerId: ids[0] },
  })
  expect(forged.status()).toBe(400)
  const before = game.revision
  game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: 'Roll to sail' }).click())
  expect(game.revision).toBeGreaterThan(before)
  expect(game.lastRoll).toBeGreaterThanOrEqual(4)
  expect(game.lastRoll).toBeLessThanOrEqual(6)
  for (const page of pages)
    await expect(page.locator('.captains-log')).toContainText(`rolled ${game.lastRoll} movement`)
  await pages[1].reload()
  await expect(pages[1].locator('.identity')).toHaveText('Blackbeard')
  const extraTab = await contexts[0].newPage()
  await extraTab.goto('/')
  await expect(extraTab.locator('.identity')).toHaveText('Anne Bonny')
  await extraTab.close()
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await pages[0].setViewportSize(viewport)
    await pages[0].evaluate(() => window.scrollTo(0, 0))
    await expect(pages[0].locator('.sea-map')).toHaveClass(/fit-map/)
    const frameBounds = (await pages[0].locator('.chart-scroll').boundingBox())!
    expect(frameBounds.y + frameBounds.height).toBeLessThanOrEqual(viewport.height)
    expect(
      await pages[0]
        .locator('.chart-scroll')
        .evaluate(
          (node) => node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1,
        ),
    ).toBeTruthy()
    const leftCard = (await pages[0].locator('.seat-0').boundingBox())!
    const rightCard = (await pages[0].locator('.seat-1').boundingBox())!
    expect(leftCard.x + leftCard.width).toBeLessThan(frameBounds.x)
    expect(rightCard.x).toBeGreaterThan(frameBounds.x + frameBounds.width)
    await expect(pages[0].locator('.personal-deck')).toBeVisible()
    const controlBounds = await pages[0].getByRole('region', { name: 'Captain controls' }).boundingBox()
    expect(controlBounds!.width).toBeGreaterThan(viewport.width * 0.95)
    const footerBounds = (await pages[0].locator('.chart-footer').boundingBox())!
    expect(footerBounds.y + footerBounds.height).toBeLessThanOrEqual(controlBounds!.y)
    expect(await pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await pages[0].screenshot({ path: testInfo.outputPath(`game-${viewport.width}.png`), fullPage: true })
  }
  const frame = pages[0].locator('.chart-scroll')
  expect(await frame.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBeTruthy()
  expect(
    await pages[0].locator('.chart-scroll').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBeTruthy()
  await pages[0].getByRole('button', { name: 'Zoom in', exact: true }).click()
  expect(
    await frame.evaluate(
      (node) => node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth,
    ),
  ).toBeTruthy()
  await pages[0].getByRole('button', { name: 'Fit board', exact: true }).click()
  await pages[0].setViewportSize({ width: 1440, height: 1080 })

  // Seed only this test's private save, with the server stopped. Existing browser
  // bindings are retained. No production/debug mutation endpoint is introduced.
  await stopServer()
  const savePath = path.join(dataDirectory, 'game-state-v2.json')
  const saved = JSON.parse(await readFile(savePath, 'utf8'))
  const cellKeys = new Set(board.cells.filter((c) => c.terrain === 'water').map(key))
  const open = board.cells.find((c) =>
    [-2, -1, 0, 1, 2, 3, 4].every((q) =>
      [-1, 0, 1].every((r) => cellKeys.has(key({ q: c.q + q, r: c.r + r }))),
    ),
  )!
  saved.game.ships = [
    { id: 'e2e-a', ownerId: ids[0], portId: 'port-1', number: 1, q: open.q, r: open.r },
    { id: 'e2e-b', ownerId: ids[1], portId: 'port-2', number: 2, q: open.q + 2, r: open.r },
  ]
  saved.game.remainingActions = 1
  saved.game.remainingMovement = 6
  saved.game.lastRoll = 6
  saved.game.revision++
  saved.game.combat = null
  saved.game.combatChoices = []
  saved.game.perkPickups = []
  saved.game.isBuildPhase = false
  await writeFile(savePath, JSON.stringify(saved))
  await startServer()
  for (const page of pages) {
    await page.reload()
    await expect(page.locator('.connection')).toHaveText('Live')
  }
  await expect(pages[0].locator('.identity')).toHaveText('Anne Bonny')
  await pages[0].locator('[data-ship="e2e-a"]').click()
  await pages[0].locator(`[data-hex="${open.q + 1},${open.r}"]`).click()
  game = await clickAction(pages[0], () =>
    pages[0].getByRole('button', { name: /Sail 1 hex · battle ahead/ }).click(),
  )
  for (const page of pages) await expect(page.getByRole('dialog')).toBeVisible()
  await spectator.screenshot({ path: testInfo.outputPath('battle-desktop.png'), fullPage: true })
  await spectator.setViewportSize({ width: 390, height: 844 })
  await spectator.screenshot({ path: testInfo.outputPath('battle-mobile.png'), fullPage: true })
  expect(
    await spectator.getByRole('dialog').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBeTruthy()
  await spectator.setViewportSize({ width: 1440, height: 1080 })
  let rounds = 0
  while (game.combat?.status === 'awaiting-roll') {
    expect(++rounds).toBeLessThan(30)
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Roll (battle dice|next exchange)/ }).click(),
    )
  }
  expect(game.combat?.status).toBe('resolved')
  expect(game.combat?.message).toContain('automatically')
  expect(game.combat?.ships).toHaveLength(2)
  expect(await spectator.getByRole('button', { name: /Lose ship/ }).count()).toBe(0)
  for (const page of pages) await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
  for (const page of pages) await expect(page.locator('.battle-map-ship.removed')).toHaveCount(1)
  // The resolved battle, including the lost ship's position, survives a restart.
  await stopServer()
  await startServer()
  for (const page of pages) {
    await page.reload()
    await expect(page.locator('.battle-map-ship.removed')).toHaveCount(1)
    await expect(page.locator('.rolling-die')).toHaveCount(0)
  }
  game = await clickAction(pages[0], () =>
    pages[0].getByRole('button', { name: /Continue the voyage/ }).click(),
  )
  for (const page of pages) await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(game.ships).toHaveLength(1)
  const persistedRevision = game.revision
  await stopServer()
  await startServer()
  await pages[0].reload()
  await expect(pages[0].locator('.connection')).toHaveText('Live')
  expect((await state(pages[0])).revision).toBe(persistedRevision)
  await expect(pages[0].locator('.identity')).toHaveText('Anne Bonny')
  expect(errors).toEqual([])
  for (const context of contexts) await context.close()
})

test('crew launcher uses native window size and the original UI fits the whole board', async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium', 'The crew launcher uses Chromium browser windows.')
  const practiceRoot = await mkdtemp(path.join(tmpdir(), 'marauders-native-window-'))
  const contexts: BrowserContext[] = await openLocalCrew(practiceRoot, 'http://127.0.0.1:5174', true)
  try {
    const pages = contexts.map((context) => context.pages()[0])
    await readyCrew(pages)
    for (let i = 0; i < contexts.length; i++) {
      expect(pages[i].viewportSize()).toBeNull()
      const nativeWindow = await contexts[i].newCDPSession(pages[i])
      const { windowId } = await nativeWindow.send('Browser.getWindowForTarget')
      await nativeWindow.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })
      for (const width of [1920, 2560]) {
        const height = width === 1920 ? 1080 : 1440
        // Resize the actual browser contents, without emulating a viewport.
        await nativeWindow.send('Browser.setContentsSize', { windowId, width, height })
        await expect.poll(() => pages[i].evaluate(() => innerWidth)).toBe(width)
        await expect.poll(() => pages[i].evaluate(() => innerHeight)).toBe(height)
        await expect(pages[i].locator('.sea-map')).toHaveClass(/fit-map/)
        const frame = pages[i].locator('.chart-scroll')
        expect(
          await frame.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
          ),
        ).toBeTruthy()
        const bounds = (await frame.boundingBox())!
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
        for (const port of await pages[i].locator('[data-port]').all()) {
          const cell = (await port.boundingBox())!
          expect(cell.x).toBeGreaterThanOrEqual(bounds.x)
          expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width)
          expect(cell.y).toBeGreaterThanOrEqual(bounds.y)
          expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height)
        }
        if (i === 0) await pages[i].screenshot({ path: testInfo.outputPath(`native-${width}.png`) })
      }
      await nativeWindow.detach()
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('longer playtest clocks start at automatic launch and timeout synchronizes across five browsers', async ({
  browser,
}) => {
  await stopServer()
  await startServer(false, true)
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  try {
    for (let i = 0; i < 5; i++) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
      contexts.push(context)
      const page = await context.newPage()
      pages.push(page)
      await page.goto('/')
      await expect(page.locator('.connection')).toHaveText('Live')
      if (i < 4) {
        const joined = await page.request.post('/api/game/players', {
          headers,
          data: { name: `Timer captain ${i}`, color: colors[i], character: characterIds[i] },
        })
        expect(joined.status()).toBe(200)
      }
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    game = await readyCrew(pages)
    expect(game.phase).toBe('playing')
    const turnStarted = new Date(game.events.findLast((event) => event.kind === 'turn')!.at).getTime()
    expect(new Date(game.turnEndsAt!).getTime() - turnStarted).toBe(135_000)
    expect(new Date(game.actionEndsAt!).getTime() - turnStarted).toBe(45_000)
    for (const page of pages) {
      await expect(page.locator('.sea-map [data-ship]')).toHaveCount(24)
      await expect(page.locator('.countdown')).toHaveCount(2)
    }
    await expect.poll(async () => (await state(pages[4])).turnNumber, { timeout: 50_000 }).toBe(2)
    game = await state(pages[4])
    expect(game.activePlayerId).toBe(ids[1])
    for (const page of pages) {
      await expect(page.locator('.captains-log')).toContainText('Timer captain 0 ran out of time')
      await expect(page.locator('.captain-card.active h2')).toContainText('Timer captain 1')
    }
    const stale = await pages[0].request.post('/api/game/action', {
      headers,
      data: { type: 'roll-movement', playerId: ids[1] },
    })
    expect(stale.status()).toBe(400)
    game = await clickAction(pages[1], () => pages[1].getByRole('button', { name: 'Roll to sail' }).click())
    expect(game.activePlayerId).toBe(ids[1])
    expect(game.remainingMovement).toBeGreaterThan(0)
  } finally {
    for (const context of contexts) await context.close()
  }
})

test('password controller, eight profiles, help pages, and reset synchronization across five browsers', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()))
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    for (const p of pages) {
      await p.goto('/')
      await expect(p.locator('.connection')).toHaveText('Live')
    }
    const controller = pages[4]
    let game = await state(controller)
    const invalid = await controller.request.post('/api/game/reset', {
      headers,
      data: { password: 'incorrect', gameId: game.id, expectedRevision: game.revision, releaseSeats: true },
    })
    expect(invalid.status()).toBe(403)
    expect((await state(controller)).revision).toBe(game.revision)
    await controller
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Game controller' })
      .click()
    const review = async (release: boolean) => {
      await controller.getByLabel('Reset password', { exact: true }).fill(resetPassword)
      await controller.getByLabel('Release all seats').setChecked(release)
      await controller.getByRole('button', { name: 'Review reset' }).click()
    }
    const confirm = async (status = 200) => {
      const response = controller.waitForResponse(
        (r) => r.url().endsWith('/api/game/reset') && r.request().method() === 'POST',
      )
      await controller.getByRole('button', { name: 'Confirm reset', exact: true }).click()
      expect((await response).status()).toBe(status)
    }
    await review(true)
    await confirm()
    for (let i = 0; i < 4; i++) {
      await expect(pages[i].getByRole('heading', { name: 'Take the helm.' })).toBeVisible()
      await expect(pages[i].locator('.profile-picker button')).toHaveCount(8)
      await pages[i].getByLabel('CAPTAIN NAME').fill(`Test captain ${i + 1}`)
      await pages[i].getByLabel(`Choose ${colors[i]} crew color`).click()
      await pages[i]
        .locator('.profile-picker')
        .getByRole('button', { name: `Choose ${characterNames[i + 4]}`, exact: true })
        .click()
      await pages[i].getByRole('button', { name: /Join the crew/ }).click()
      await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    }
    game = await state(controller)
    expect(game.players.map((p) => p.character)).toEqual(['captain-5', 'captain-6', 'captain-7', 'captain-8'])
    await pages[0].screenshot({ path: testInfo.outputPath('profiles-desktop.png'), fullPage: true })
    await pages[0].getByRole('link', { name: 'How to play', exact: true }).click()
    await expect(pages[0].getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()
    await expect(pages[0].getByRole('heading', { name: 'Meet the board', exact: true })).toBeVisible()
    await pages[0].getByRole('link', { name: 'About', exact: true }).click()
    await expect(pages[0].getByRole('heading', { name: 'About Marauders' })).toBeVisible()
    await pages[0].getByRole('link', { name: 'The voyage', exact: true }).click()
    await clickAction(pages[0], () =>
      pages[0]
        .getByLabel('WHO GOES FIRST?')
        .selectOption(game.players[3].id)
        .then(() => {}),
    )
    await review(false)
    await readyCrew(pages)
    await confirm(400)
    await expect(controller.getByRole('alert')).toContainText('The game changed')
    await review(false)
    await confirm()
    for (let i = 0; i < 4; i++) await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    await review(true)
    await confirm()
    for (let i = 0; i < 4; i++) {
      await expect(pages[i].getByRole('heading', { name: 'Take the helm.' })).toBeVisible()
      await expect(pages[i].locator('.identity')).toHaveText('Spectating')
    }
    game = await state(controller)
    expect(game.players).toHaveLength(0)
    const limited = await controller.request.post('/api/game/reset', {
      headers,
      data: { password: resetPassword, gameId: game.id, expectedRevision: game.revision },
    })
    expect(limited.status()).toBe(429)
    // Reusing these pages must not retain a first-player ID from the released crew.
    for (let i = 0; i < 4; i++) {
      await pages[i].getByLabel('CAPTAIN NAME').fill(`New captain ${i + 1}`)
      await pages[i].getByLabel(`Choose ${colors[i]} crew color`).click()
      await pages[i].getByRole('button', { name: `Choose ${characterNames[i]}`, exact: true }).click()
      await pages[i].getByRole('button', { name: /Join the crew/ }).click()
      await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    }
    const newCrew = await state(controller)
    await expect(pages[0].getByLabel('WHO GOES FIRST?')).toHaveValue(newCrew.players[0].id)
    game = await readyCrew(pages)
    await controller.setViewportSize({ width: 390, height: 844 })
    await controller.screenshot({ path: testInfo.outputPath('controller-mobile.png'), fullPage: true })
    expect(await controller.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await stopServer()
    await startServer()
    await pages[0].reload()
    await expect(pages[0].locator('.connection')).toHaveText('Live')
    expect((await state(pages[0])).id).toBe(game.id)
    expect(
      (await contexts[0].request.get('http://127.0.0.1:5174/api/session').then((r) => r.json())).playerId,
    ).toBe(newCrew.players[0].id)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('perks, Black and White override, zero rolls, and victory history synchronize and persist', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()))
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()))
    for (let i = 0; i < 5; i++) {
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4) {
        await pages[i].getByLabel('CAPTAIN NAME').fill(`Perk captain ${i + 1}`)
        await pages[i].getByLabel(`Choose ${colors[i]} crew color`).click()
        await pages[i].getByRole('button', { name: `Choose ${characterNames[i]}`, exact: true }).click()
        await pages[i].getByRole('button', { name: /Join the crew/ }).click()
        await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
      }
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const sea = new Set(board.cells.filter((c) => c.terrain === 'water').map(key))
    const open = board.cells.find((c) =>
      [-2, -1, 0, 1, 2, 3].every((q) => [-1, 0, 1].every((r) => sea.has(key({ q: c.q + q, r: c.r + r })))),
    )!
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    // Test-only offline fixture; production exposes no arbitrary state mutation API.
    await stopServer()
    let saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      phase: 'playing',
      turnOrder: ids,
      activePlayerId: ids[0],
      turnNumber: 1,
      remainingActions: 2,
      remainingMovement: 3,
      turnEndsAt: new Date(Date.now() + 1_800_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 900_000).toISOString(),
      ships: [
        { id: 'perk-a', ownerId: ids[0], portId: 'port-1', number: 1, q: open.q, r: open.r },
        { id: 'perk-b', ownerId: ids[1], portId: 'port-4', number: 2, q: open.q + 3, r: open.r },
        { id: 'perk-helper', ownerId: ids[0], portId: 'port-1', number: 3, q: open.q + 1, r: open.r - 1 },
      ],
      perkPickups: [{ kind: 'glass-cannon', q: open.q + 1, r: open.r }],
      revision: saved.game.revision + 1,
    })
    saved.game.ports.forEach(
      (p: { ownerId: string | null }, i: number) => (p.ownerId = i < 12 ? ids[Math.floor(i / 3)] : null),
    )
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const p of pages) {
      await p.reload()
      await expect(p.locator('.connection')).toHaveText('Live')
    }
    await expect(pages[4].locator('[data-perk="glass-cannon"]')).toHaveCount(1)
    await pages[0].locator('[data-ship="perk-a"]').click()
    await pages[0].locator(`[data-hex="${open.q + 1},${open.r}"]`).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Sail 1 hex', exact: true }).click(),
    )
    expect(game.ships[0].perk).toBe('glass-cannon')
    for (const p of pages) {
      await expect(p.locator('[data-perk="glass-cannon"]')).toHaveCount(0)
      await expect(p.locator('[data-ship="perk-a"]')).toHaveAccessibleName(/carrying Glass Cannon/)
    }
    await pages[4].screenshot({ path: testInfo.outputPath('perks-board.png'), fullPage: true })
    await pages[0].locator(`[data-hex="${open.q + 2},${open.r}"]`).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Sail 1 hex · battle ahead/ }).click(),
    )
    // Force the already-tested zero-roll result to inspect the public casualty UI deterministically.
    await stopServer()
    saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game.combat, {
      status: 'choose-loss',
      winnerId: ids[1],
      losingPlayerId: ids[0],
      round: 1,
      rolls: { [ids[0]]: [0, 1], [ids[1]]: [6] },
      message: 'Glass Cannon rolled 0; choose a casualty.',
    })
    saved.game.revision++
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const p of pages) {
      await p.reload()
      await expect(p.locator('.connection')).toHaveText('Live')
      await expect(p.getByLabel('Rolled 0', { exact: true })).toHaveText('0')
    }
    await pages[0].getByRole('button', { name: /^Select Ship 1,/ }).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Lose ship 1', exact: true }).click(),
    )
    expect(game.perkPickups[0].kind).toBe('glass-cannon')
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Continue the voyage/ }).click(),
    )
    for (const p of pages) await expect(p.locator('[data-perk="glass-cannon"]')).toHaveCount(1)
    // The binary perk replaces every die with one shared server result and keeps
    // that dedicated presentation for all captains and the spectator.
    await stopServer()
    saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      activePlayerId: ids[0],
      isBuildPhase: false,
      remainingActions: 2,
      remainingMovement: 1,
      turnEndsAt: new Date(Date.now() + 1_800_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 900_000).toISOString(),
      combat: null,
      combatChoices: [],
      perkPickups: [],
      ships: [
        {
          id: 'black-white-a',
          ownerId: ids[0],
          portId: 'port-1',
          number: 10,
          q: open.q,
          r: open.r,
          perk: 'black-and-white',
        },
        {
          id: 'black-white-b',
          ownerId: ids[1],
          portId: 'port-4',
          number: 20,
          q: open.q + 2,
          r: open.r,
        },
      ],
    })
    saved.game.revision++
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const p of pages) {
      await p.reload()
      await expect(p.locator('.connection')).toHaveText('Live')
    }
    await pages[0].locator('[data-ship="black-white-a"]').click()
    await pages[0].locator(`[data-hex="${open.q + 1},${open.r}"]`).click()
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Sail 1 hex · battle ahead/ }).click(),
    )
    for (const p of pages) {
      await expect(p.getByLabel('Black and White battle override')).toBeVisible()
      await expect(p.getByRole('button', { name: 'Draw black or white', exact: true })).toHaveCount(
        p === pages[0] ? 1 : 0,
      )
      await expect(p.locator('.battle-dice')).toHaveCount(0)
    }
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Draw black or white', exact: true }).click(),
    )
    expect(['black', 'white']).toContain(game.combat?.blackWhiteResult)
    expect(game.combat?.blackWhiteOwnerId).toBe(ids[0])
    expect(game.combat?.rolls).toEqual({ [ids[0]]: [], [ids[1]]: [] })
    const binaryResult = game.combat!.blackWhiteResult!
    for (const p of pages) {
      await expect(p.getByLabel(`${binaryResult} was drawn`, { exact: true })).toContainText(
        binaryResult.toUpperCase(),
      )
      await expect(p.locator('.captains-log')).toContainText('Black and White exchange')
    }
    await pages[4].screenshot({ path: testInfo.outputPath('black-and-white-battle.png'), fullPage: true })
    await stopServer()
    await startServer()
    for (const p of pages) {
      await p.reload()
      await expect(p.getByLabel(`${binaryResult} was drawn`, { exact: true })).toBeVisible()
    }
    game = await state(pages[0])
    expect(game.combat?.blackWhiteResult).toBe(binaryResult)
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Continue the voyage/ }).click(),
    )
    // A final port battle exercises real server capture and final-round recording.
    await stopServer()
    saved = JSON.parse(await readFile(savePath, 'utf8'))
    const harbor = board.cells.find((c) => c.harborId === 'port-13')!
    Object.assign(saved.game, {
      activePlayerId: ids[0],
      isBuildPhase: false,
      remainingActions: 10,
      remainingMovement: 0,
      combat: null,
      combatChoices: [],
      ships: [
        {
          id: 'final-ship',
          ownerId: ids[0],
          portId: 'port-1',
          number: 3,
          q: harbor.q,
          r: harbor.r,
          perk: 'loaded-dice',
        },
      ],
      roundHistory: [
        {
          turn: 1,
          activePlayerId: ids[0],
          at: new Date().toISOString(),
          isFinal: false,
          teams: ids.map((playerId) => ({ playerId, ships: 6, ports: 3 })),
        },
      ],
    })
    saved.game.ports.forEach((p: { ownerId: string | null; defenseWeakness: number }, i: number) => {
      p.ownerId = i < 11 ? ids[0] : i === 12 ? ids[1] : null
      p.defenseWeakness = i === 12 ? 10 : 0
    })
    saved.game.revision++
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const p of pages) {
      await p.reload()
      await expect(p.locator('.connection')).toHaveText('Live')
    }
    await pages[0].locator('[data-ship="final-ship"]').click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /^Attack / }).click())
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Roll battle dice', exact: true }).click(),
    )
    expect(game.winnerId).toBe(ids[0])
    expect(game.roundHistory.at(-1)?.teams[0].ports).toBe(12)
    expect(game.ports.filter((p) => p.ownerId === null)).toHaveLength(1)
    await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Continue to victory/ }).click())
    for (const p of pages)
      await expect(p.getByRole('heading', { name: 'The voyage, round by round' })).toBeVisible()
    await pages[4].getByLabel('Chart', { exact: true }).selectOption('ports')
    await pages[4].getByText('View exact round statistics').click()
    await expect(pages[4].getByRole('cell', { name: '1 / 12', exact: true })).toBeVisible()
    await pages[4].screenshot({ path: testInfo.outputPath('victory-history-desktop.png'), fullPage: true })
    await pages[4].setViewportSize({ width: 390, height: 844 })
    await pages[4].screenshot({ path: testInfo.outputPath('victory-history-mobile.png'), fullPage: true })
    expect(await pages[4].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    const history = game.roundHistory
    await stopServer()
    await startServer()
    await pages[4].reload()
    await expect(pages[4].locator('.connection')).toHaveText('Live')
    expect((await state(pages[4])).roundHistory).toEqual(history)
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('map ballots synchronize, exclude spectators, and both new maps support full setup and sailing', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()))
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    for (let i = 0; i < 5; i++) {
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      await expect(pages[i].locator('.map-option')).toHaveCount(3)
      if (i < 4) {
        await pages[i].getByLabel('CAPTAIN NAME').fill(`Map captain ${i + 1}`)
        await pages[i].getByLabel(`Choose ${colors[i]} crew color`).click()
        await pages[i].getByRole('button', { name: `Choose ${characterNames[i]}`, exact: true }).click()
        await pages[i].getByRole('button', { name: /Join the crew/ }).click()
        await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
      }
    }
    let game = await state(pages[0])
    const ids = game.players.map((p) => p.id)
    const ballot = (p: Page, map: string) => p.locator(`[data-map-option="${map}"]`)
    expect(
      (
        await pages[4].request.post('/api/game/action', {
          headers,
          data: { type: 'vote-map', mapId: 'narrows', playerId: ids[0] },
        })
      ).status(),
    ).toBe(400)
    await expect(ballot(pages[4], 'narrows').getByRole('button')).toBeDisabled()
    await clickAction(pages[0], () => ballot(pages[0], 'classic').getByRole('button').click())
    await expect(ballot(pages[1], 'classic')).toContainText('100% chance')
    await clickAction(pages[1], () => ballot(pages[1], 'classic').getByRole('button').click())
    await expect(ballot(pages[2], 'classic')).toContainText('2 votes')
    await clickAction(pages[2], () => ballot(pages[2], 'narrows').getByRole('button').click())
    for (const p of pages) {
      await expect(ballot(p, 'classic')).toContainText('66.7% chance')
      await expect(ballot(p, 'narrows')).toContainText('33.3% chance')
    }
    await clickAction(pages[2], () => ballot(pages[2], 'shattered-isles').getByRole('button').click())
    for (const p of pages) await expect(ballot(p, 'narrows')).toContainText('0% chance')
    await pages[2].reload()
    await expect(pages[2].locator('.connection')).toHaveText('Live')
    await expect(ballot(pages[2], 'shattered-isles').getByRole('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await clickAction(pages[2], () => pages[2].getByRole('button', { name: 'Clear my vote' }).click())
    for (const p of pages) await expect(ballot(p, 'classic')).toContainText('100% chance')
    await pages[4].screenshot({ path: testInfo.outputPath('map-voting-desktop.png'), fullPage: true })
    await pages[4].setViewportSize({ width: 390, height: 844 })
    await pages[4].screenshot({ path: testInfo.outputPath('map-voting-mobile.png'), fullPage: true })
    expect(await pages[4].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await pages[4].setViewportSize({ width: 1440, height: 1080 })

    for (const mapId of ['narrows', 'shattered-isles']) {
      for (let i = 0; i < 4; i++) {
        game = await clickAction(pages[i], () => ballot(pages[i], mapId).getByRole('button').click())
        const count = Object.values(game.mapVotes).filter((id) => id === mapId).length
        for (const p of pages)
          await expect(ballot(p, mapId).locator('.map-odds strong')).toHaveText(
            `${count} ${count === 1 ? 'vote' : 'votes'}`,
          )
      }
      await stopServer()
      await startServer()
      for (const p of pages) {
        await p.reload()
        await expect(p.locator('.connection')).toHaveText('Live')
        await expect(ballot(p, mapId)).toContainText('100% chance')
      }
      game = await readyCrew(pages)
      expect(game.mapId).toBe(mapId)
      expect(game.mapSelection?.totalTickets).toBe(4)
      const board: Board = await (await pages[0].request.get('/api/board')).json()
      expect(board.id).toBe(mapId)
      expect(board.version).toBe(`${mapId}-v7`)
      expect(board.version).toBe(game.boardVersion)
      expect(game.ports).toHaveLength(13)
      const neutralPort = game.ports.filter((port) => port.ownerId === null)
      expect(neutralPort).toHaveLength(1)
      if (mapId === 'narrows') {
        expect(game.ports.some((port) => port.name === 'Northgate')).toBeTruthy()
        expect(neutralPort[0].name).toBe('Northgate')
        expect(game.ports.some((port) => port.name === 'Southgate')).toBeFalsy()
        expect(game.ports.some((port) => port.name === 'Dusk Harbor')).toBeTruthy()
      } else {
        expect(neutralPort[0].name).toBe('Serpent\'s Heart')
        expect(game.ports.some((port) => port.name === 'Fang Harbor')).toBeFalsy()
        expect(game.ports.some((port) => port.name === 'Gull\'s Rest')).toBeTruthy()
      }
      for (const p of pages) {
        await p.getByRole('button', { name: /^All \d+ events$/ }).click()
        await expect(p.locator('.captains-log')).toContainText(`Map draw: ${board.name}`)
        await expect(p.locator('.chart-header')).toContainText(board.name.toUpperCase())
      }
      expect(
        (
          await pages[1].request.post('/api/game/action', {
            headers,
            data: { type: 'vote-map', mapId: 'classic' },
          })
        ).status(),
      ).toBe(400)
      const revealed = game.perkPickups
      expect(revealed).toHaveLength(6)
      for (const p of pages) await expect(p.locator('.sea-map [data-perk]')).toHaveCount(6)
      expect(game.phase).toBe('playing')
      expect(game.perkPickups).toEqual(revealed)
      expect(game.ships).toHaveLength(24)
      expect(game.perkPickups).toHaveLength(6)
      for (const p of pages) await expect(p.locator('.sea-map [data-perk]')).toHaveCount(6)
      await pages[4].screenshot({ path: testInfo.outputPath(`${mapId}-board.png`), fullPage: true })
      const actor = pages[ids.indexOf(game.activePlayerId!)]
      game = await clickAction(actor, () =>
        actor.getByRole('button', { name: 'Roll to sail', exact: true }).click(),
      )
      await expect(actor.locator('.public-movement-roll')).toHaveAttribute(
        'aria-label',
        `Movement roll: ${game.lastRoll}`,
      )
      const occupied = new Set(game.ships.map(key))
      const candidate = game.ships
        .filter((s) => s.ownerId === game.activePlayerId)
        .flatMap((ship) =>
          directions.map((d) => ({
            ship,
            cell: board.cells.find((c) => c.q === ship.q + d.q && c.r === ship.r + d.r),
          })),
        )
        .find(
          ({ cell }) =>
            cell &&
            ['water', 'harbor'].includes(cell.terrain) &&
            !occupied.has(key(cell)) &&
            game.ships
              .filter((s) => s.ownerId !== game.activePlayerId)
              .every(
                (s) =>
                  distance(s, cell) > 1 &&
                  (!cell.harborId || board.cells.find((c) => key(c) === key(s))?.harborId !== cell.harborId),
              ),
        )!
      expect(candidate).toBeTruthy()
      await actor.locator(`[data-ship="${candidate.ship.id}"]`).click()
      await actor.locator(`[data-hex="${key(candidate.cell!)}"]`).click()
      game = await clickAction(actor, () =>
        actor.getByRole('button', { name: 'Sail 1 hex', exact: true }).click(),
      )
      expect(key(game.ships.find((s) => s.id === candidate.ship.id)!)).toBe(key(candidate.cell!))
      const selection = game.mapSelection
      await stopServer()
      await startServer()
      await pages[4].reload()
      await expect(pages[4].locator('.connection')).toHaveText('Live')
      expect((await state(pages[4])).mapSelection).toEqual(selection)
      await expect(pages[4].locator('.chart-header')).toContainText(board.name.toUpperCase())
      const reset = await pages[4].request.post('/api/game/reset', {
        headers,
        data: { password: resetPassword, gameId: game.id, expectedRevision: game.revision },
      })
      expect(reset.status()).toBe(200)
      game = await reset.json()
      expect(game.mapId).toBe('classic')
      expect(game.mapVotes).toEqual({})
      expect(game.mapSelection).toBeNull()
      for (const p of pages) {
        await p.reload()
        await expect(p.locator('.connection')).toHaveText('Live')
        await expect(p.locator('.map-options')).toBeVisible()
      }
    }
    // Existing matches retain v2-v6 geometry while new drafts receive v7.
    for (const [mapId, version] of [
      ['narrows', 'v2'],
      ['shattered-isles', 'v2'],
      ['narrows', 'v3'],
      ['shattered-isles', 'v3'],
      ['narrows', 'v4'],
      ['shattered-isles', 'v4'],
      ['narrows', 'v5'],
      ['shattered-isles', 'v5'],
      ['narrows', 'v6'],
      ['shattered-isles', 'v6'],
    ]) {
      await stopServer()
      const savePath = path.join(dataDirectory, 'game-state-v2.json')
      const saved = JSON.parse(await readFile(savePath, 'utf8'))
      const legacy = JSON.parse(
        await readFile(path.join(root, 'server/maps', `${mapId}-${version}.json`), 'utf8'),
      )
      Object.assign(saved.game, {
        mapId,
        boardVersion: legacy.version,
        phase: 'draft',
        activePlayerId: ids[0],
        turnOrder: ids,
        draftPickNumber: 0,
        ships: [],
        perkPickups: [],
        ports: legacy.ports.map((port: { id: string; name: string }) => ({
          id: port.id,
          name: port.name,
          ownerId: null,
          defenseWeakness: 0,
        })),
        revision: saved.game.revision + 1,
      })
      await writeFile(savePath, JSON.stringify(saved))
      await startServer()
      for (const page of pages) {
        await page.reload()
        await expect(page.locator('.connection')).toHaveText('Live')
        await expect(page.locator('.chart-header')).toContainText('(LEGACY)')
        await expect(page.locator('.sea-map [data-port]')).toHaveCount(legacy.ports.length)
        await expect(page.locator('.sea-map [data-perk]')).toHaveCount(6)
      }
      const legacyBoard: Board = await (await pages[0].request.get('/api/board')).json()
      const latestBoard: Board = await (await pages[0].request.get(`/api/board?mapId=${mapId}`)).json()
      expect(legacyBoard.version).toBe(`${mapId}-${version}`)
      expect(latestBoard.version).toBe(`${mapId}-v7`)
      const changed = legacyBoard.cells.find(
        (c) => latestBoard.cells.find((next) => key(next) === key(c))?.terrain !== c.terrain,
      )!
      for (const page of pages)
        await expect(page.locator(`.sea-map [data-hex="${key(changed)}"]`)).toHaveClass(
          new RegExp(`\\b${changed.terrain}\\b`),
        )
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()))
  }
})

test('published client, API, and hub work from one origin', async ({ page }) => {
  expect(existsSync(path.join(root, 'artifacts/publish/wwwroot/index.html'))).toBeTruthy()
  expect(existsSync(path.join(root, 'artifacts/publish/data/game-state.json'))).toBeFalsy()
  expect(existsSync(path.join(root, 'artifacts/publish/data/game-state-v2.json'))).toBeFalsy()
  await stopServer()
  await startServer(true)
  await page.goto('http://127.0.0.1:5134/')
  await expect(page).toHaveTitle('Marauders · Command the seas')
  await expect(page.locator('.connection')).toHaveText('Live')
  await expect(page.getByRole('group', { name: 'Marauders interactive hex map' })).toBeVisible()
  expect((await page.request.get('http://127.0.0.1:5134/api/board')).status()).toBe(200)
  for (const portrait of await (await page.request.get('/api/characters')).json()) {
    if (existsSync(path.join(root, 'server/wwwroot', portrait.imageUrl))) {
      const response = await page.request.get(`http://127.0.0.1:5134${portrait.imageUrl}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/jpeg')
    }
  }
})

test('a failed initial state refresh retries without restarting its connected hub', async ({ page }) => {
  let failedOnce = false
  await page.route('**/api/game', async (route) => {
    if (!failedOnce) {
      failedOnce = true
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.goto('/')
  await expect(page.locator('.connection')).toHaveText('Live', { timeout: 8_000 })
  expect(failedOnce).toBeTruthy()
})

test('playtest readability, public roll reveal, map casualty choices and discoverable port attacks', async ({
  browser,
}, testInfo) => {
  const contexts = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      browser.newContext({
        viewport: { width: 1920, height: 1080 },
        reducedMotion: i === 3 ? 'reduce' : 'no-preference',
      }),
    ),
  )
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()))
    for (let i = 0; i < pages.length; i++) {
      await pages[i].goto('/')
      await expect(pages[i].locator('.connection')).toHaveText('Live')
      if (i < 4)
        expect(
          (
            await pages[i].request.post('/api/game/players', {
              headers,
              data: { name: `Playtest ${i + 1}`, color: colors[i], character: characterIds[i] },
            })
          ).status(),
        ).toBe(200)
    }
    let game = await state(pages[0])
    const ids = game.players.map((player) => player.id)
    const board: Board = await (await pages[0].request.get('/api/board')).json()
    const sea = new Set(board.cells.filter((cell) => cell.terrain === 'water').map(key))
    const open = board.cells.find((cell) =>
      [-2, -1, 0, 1, 2, 3, 4].every((q) =>
        [-1, 0, 1].every((r) => sea.has(key({ q: cell.q + q, r: cell.r + r }))),
      ),
    )!
    const savePath = path.join(dataDirectory, 'game-state-v2.json')
    await stopServer()
    let saved = JSON.parse(await readFile(savePath, 'utf8'))
    Object.assign(saved.game, {
      phase: 'playing',
      activePlayerId: ids[0],
      turnOrder: ids,
      turnNumber: 1,
      remainingActions: 3,
      remainingMovement: 0,
      isBuildPhase: false,
      turnEndsAt: new Date(Date.now() + 1_800_000).toISOString(),
      actionEndsAt: new Date(Date.now() + 900_000).toISOString(),
      ships: [
        { id: 'read-a', number: 19, ownerId: ids[0], portId: 'port-1', q: open.q, r: open.r },
        { id: 'read-ah', number: 20, ownerId: ids[0], portId: 'port-1', q: open.q - 1, r: open.r },
        { id: 'read-b', number: 21, ownerId: ids[1], portId: 'port-4', q: open.q + 2, r: open.r },
        { id: 'read-bh', number: 22, ownerId: ids[1], portId: 'port-4', q: open.q + 4, r: open.r },
      ],
      perkPickups: [],
      revision: saved.game.revision + 1,
    })
    saved.game.ports.forEach(
      (port: { ownerId: string | null }, i: number) =>
        (port.ownerId = i < 12 ? ids[Math.floor(i / 3)] : null),
    )
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    await expect(pages[0].locator('.action-dice')).toHaveText('3 Diceremaining')
    await expect(pages[0].locator('.action-dice .die')).toHaveCount(0)
    await expect(pages[0].locator('.map-result')).toHaveCount(0)
    await expect(pages[0].locator('[data-port-label]')).toHaveCount(13)
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 1536, height: 864 },
    ]) {
      await pages[0].setViewportSize(viewport)
      await pages[0].evaluate(() => window.scrollTo(0, 0))
      const chart = pages[0].locator('.chart-scroll')
      await expect
        .poll(() =>
          chart.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1,
          ),
        )
        .toBeTruthy()
      const controls = (await pages[0].locator('.command-deck').boundingBox())!
      expect(
        controls.y + controls.height,
        JSON.stringify(
          await pages[0].evaluate(() =>
            [
              '.masthead',
              '.site-nav',
              '.leave-game',
              '.turn-bar',
              '.game-table',
              '.chart-scroll',
              '.command-deck',
            ].map((selector) => {
              const node = document.querySelector(selector)!,
                rect = node.getBoundingClientRect(),
                style = getComputedStyle(node)
              return {
                selector,
                y: rect.y,
                height: rect.height,
                padding: style.padding,
                margin: style.margin,
                display: style.display,
              }
            }),
          ),
        ),
      ).toBeLessThanOrEqual(viewport.height)
      const map = pages[0].locator('.sea-map'),
        before = (await map.boundingBox())!
      await pages[0].getByRole('button', { name: 'Zoom in', exact: true }).click()
      expect((await map.boundingBox())!.width / before.width).toBeCloseTo(1.25, 1)
      await pages[0].getByRole('button', { name: 'Fit board', exact: true }).click()
      await pages[0].screenshot({
        path: testInfo.outputPath(`playtest-${viewport.width}.png`),
        fullPage: false,
      })
    }
    await pages[0].setViewportSize({ width: 1920, height: 1080 })
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: 'Roll to sail' }).click())
    for (const page of pages) await expect(page.getByLabel('Rolling movement dice')).toHaveCount(0)
    await expect(pages[0].getByRole('button', { name: 'Pass movement' })).toBeEnabled()
    await expect(pages[3].locator('.rolling-die')).toHaveCount(0)
    for (const page of pages)
      await expect(page.locator('.public-movement-roll')).toHaveAttribute(
        'aria-label',
        `Movement roll: ${game.lastRoll}`,
      )
    await pages[0].locator('[data-ship="read-a"]').click()
    await pages[0].locator(`[data-hex="${open.q + 1},${open.r}"]`).click()
    game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Sail 1 hex/ }).click())
    for (const page of pages) await expect(page.getByLabel('Battle close-up')).toBeVisible()
    let rolls = 0
    while (game.combat?.status === 'awaiting-roll') {
      expect(++rolls).toBeLessThan(30)
      game = await clickAction(pages[0], () =>
        pages[0].getByRole('button', { name: /Roll (battle dice|next exchange)/ }).click(),
      )
      await expect(pages[4].locator('.battle-result')).toHaveText('Rolling the battle dice…')
      await expect(pages[4].locator('.battle-dice .rolling-die')).toHaveCount(4)
      await expect(pages[3].locator('.rolling-die')).toHaveCount(0)
      for (const page of pages) await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
    }
    expect(game.combat?.status).toBe('choose-loss')
    const loser = ids.indexOf(game.combat!.losingPlayerId!)
    const helper = game.ships.find(
      (ship) => ship.ownerId === game.combat!.losingPlayerId && ship.id.endsWith('h'),
    )!
    await expect(pages[4].getByRole('button', { name: /^Select Ship/ })).toHaveCount(0)
    expect(
      (
        await pages[4].request.post('/api/game/action', {
          headers,
          data: { type: 'remove-ship', combatId: game.combat!.id, shipId: helper.id },
        })
      ).status(),
    ).toBe(400)
    const unauthorized = loser === 0 ? 1 : 0
    expect(
      (
        await pages[unauthorized].request.post('/api/game/action', {
          headers,
          data: { type: 'remove-ship', combatId: game.combat!.id, shipId: helper.id },
        })
      ).status(),
    ).toBe(400)
    await pages[loser].getByRole('button', { name: new RegExp(`^Select Ship ${helper.number},`) }).focus()
    await pages[loser].keyboard.press('Enter')
    await expect(pages[loser].locator(`[data-battle-ship="${helper.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await pages[loser].screenshot({ path: testInfo.outputPath('battle-selected-casualty.png') })
    game = await clickAction(pages[loser], () =>
      pages[loser].getByRole('button', { name: `Lose ship ${helper.number}`, exact: true }).click(),
    )
    expect(game.combat?.status).toBe('awaiting-roll')
    expect(game.ships.some((ship) => ship.id === helper.id)).toBeFalsy()
    for (const page of pages)
      await expect(page.locator(`[data-battle-ship="${helper.id}"]`)).toHaveClass(/removed/)

    // Port actions are visible with no board selection, and choosing a trigger changes its assistance.
    await stopServer()
    saved = JSON.parse(await readFile(savePath, 'utf8'))
    const harbor = board.cells.filter((cell) => cell.harborId === 'port-13')
    Object.assign(saved.game, {
      combat: null,
      combatChoices: [],
      remainingMovement: 0,
      remainingActions: 2,
      ships: harbor.slice(0, 2).map((cell, i) => ({
        id: `port-attacker-${i}`,
        number: 30 + i,
        ownerId: ids[0],
        portId: 'port-1',
        q: cell.q,
        r: cell.r,
      })),
      revision: saved.game.revision + 1,
    })
    saved.game.ports[12].defenseWeakness = 10
    await writeFile(savePath, JSON.stringify(saved))
    await startServer()
    for (const page of pages) {
      await page.reload()
      await expect(page.locator('.connection')).toHaveText('Live')
    }
    const target = game.ports[12]
    await expect(pages[0].getByRole('region', { name: 'Available port attacks' })).toBeVisible()
    await expect(pages[4].getByRole('region', { name: 'Available port attacks' })).toHaveCount(0)
    await pages[0].getByLabel(`Attacking ship at ${target.name}`).selectOption('port-attacker-1')
    await pages[0].screenshot({ path: testInfo.outputPath('available-port-attack.png') })
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: `Attack ${target.name}`, exact: true }).click(),
    )
    expect(game.combat?.triggerShipId).toBe('port-attacker-1')
    expect(game.remainingActions).toBe(1)
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Roll battle dice', exact: true }).click(),
    )
    for (const page of pages) await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
    expect(game.ports[12].ownerId).toBe(ids[0])
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
