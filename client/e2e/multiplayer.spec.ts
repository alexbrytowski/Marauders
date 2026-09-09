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

const root = path.resolve('..')
let server: ChildProcess
let dataDirectory: string
let output = ''
const headers = { 'X-Marauders-Client': 'web' }
const resetPassword = randomBytes(24).toString('hex')

async function startServer(published = false) {
  output = ''
  const localDotnet = path.join(root, '.dotnet-sdk', 'dotnet.exe')
  server = spawn(
    existsSync(localDotnet) ? localDotnet : 'dotnet',
    [
      path.join(
        root,
        published
          ? 'artifacts/publish/Marauders.Server.dll'
          : 'server/bin/Release/net10.0/Marauders.Server.dll',
      ),
      '--urls',
      'http://127.0.0.1:5134',
    ],
    {
      cwd: path.join(root, published ? 'artifacts/publish' : 'server'),
      windowsHide: true,
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        Game__DataDirectory: dataDirectory,
        Game__TurnSeconds: '1800',
        Game__ActionSeconds: '900',
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
async function clickAction(page: Page, click: () => Promise<void>) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/game/action') && r.request().method() === 'POST',
  )
  await click()
  const result = await response
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

test('four browser seats, draft, placement, permissions, reconnect, shared battles and persistence', async ({
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
  game = await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Begin port draft/ }).click())
  for (let pick = 0; pick < 12; pick++) {
    const actor = pages[ids.indexOf(game.activePlayerId!)],
      port = game.ports[pick]
    await actor.locator(`[data-port="${port.id}"]`).click()
    game = await clickAction(actor, () =>
      actor.getByRole('button', { name: `Claim ${port.name}`, exact: true }).click(),
    )
  }
  const board: Board = await (await pages[0].request.get('/api/board')).json()
  for (let player = 0; player < 4; player++) {
    const actor = pages[ids.indexOf(game.activePlayerId!)]
    for (const port of game.ports.filter((p) => p.ownerId === game.activePlayerId)) {
      await actor.locator(`[data-port="${port.id}"]`).click()
      for (const cell of board.cells.filter((c) => c.harborId === port.id).slice(0, 2)) {
        game = await clickAction(actor, () => actor.locator(`[data-hex="${key(cell)}"]`).click())
        await expect(actor.locator(`[data-hex="${key(cell)}"] [class="ship-token"]`)).toBeVisible()
      }
    }
    game = await clickAction(actor, () => actor.getByRole('button', { name: /Fleet ready/ }).click())
  }
  expect(game.ships).toHaveLength(24)
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
  expect(game.lastRoll).toBeGreaterThanOrEqual(1)
  for (const page of pages)
    await expect(page.locator('.captains-log')).toContainText(`rolled ${game.lastRoll} movement`)
  await pages[1].reload()
  await expect(pages[1].locator('.identity')).toHaveText('Blackbeard')
  const extraTab = await contexts[0].newPage()
  await extraTab.goto('/')
  await expect(extraTab.locator('.identity')).toHaveText('Anne Bonny')
  await extraTab.close()
  await pages[0].screenshot({ path: testInfo.outputPath('game-desktop.png'), fullPage: true })
  await pages[0].setViewportSize({ width: 390, height: 844 })
  await pages[0].screenshot({ path: testInfo.outputPath('game-mobile.png'), fullPage: true })
  expect(await pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(
    await pages[0].locator('.chart-scroll').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBeTruthy()
  await pages[0].getByRole('button', { name: 'Zoom in', exact: true }).click()
  expect(
    await pages[0].locator('.chart-scroll').evaluate((node) => node.scrollWidth > node.clientWidth),
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
  expect(game.combat?.status).toBe('choose-loss')
  const loser = ids.indexOf(game.combat!.losingPlayerId!),
    casualty = game.ships.find((s) => s.ownerId === game.combat!.losingPlayerId)!
  expect(await spectator.getByRole('button', { name: /Lose ship/ }).count()).toBe(0)
  for (const page of pages) await expect(page.locator('.battle-result')).toHaveText(game.combat!.message)
  game = await clickAction(pages[loser], () =>
    pages[loser].getByRole('button', { name: `Lose ship ${casualty.number}` }).click(),
  )
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
        .getByRole('button', { name: `Captain ${i + 5}` })
        .click()
      await pages[i].getByRole('button', { name: /Join the crew/ }).click()
      await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    }
    game = await state(controller)
    expect(game.players.map((p) => p.character)).toEqual(['captain-5', 'captain-6', 'captain-7', 'captain-8'])
    await pages[0].screenshot({ path: testInfo.outputPath('profiles-desktop.png'), fullPage: true })
    await pages[0].getByRole('link', { name: 'How to play', exact: true }).click()
    await expect(pages[0].getByRole('heading', { name: 'How to play', exact: true })).toBeVisible()
    await expect(pages[0].getByText('Glass Cannon:', { exact: true })).toBeVisible()
    await pages[0].getByRole('link', { name: 'About', exact: true }).click()
    await expect(pages[0].getByRole('heading', { name: 'About Marauders' })).toBeVisible()
    await pages[0].getByRole('link', { name: 'The voyage', exact: true }).click()
    await pages[0].getByLabel('WHO PICKS FIRST?').selectOption(game.players[3].id)
    await review(false)
    await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Begin port draft/ }).click())
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
      await pages[i].getByRole('button', { name: /Join the crew/ }).click()
      await expect(pages[i].getByText('Your seat is reserved.')).toBeVisible()
    }
    const newCrew = await state(controller)
    await expect(pages[0].getByLabel('WHO PICKS FIRST?')).toHaveValue(newCrew.players[0].id)
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Begin port draft/ }).click(),
    )
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

test('perks collect and drop publicly, zero rolls render, and victory history survives restart', async ({
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
      rolls: { [ids[0]]: [0], [ids[1]]: [6] },
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
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: 'Lose ship 1', exact: true }).click(),
    )
    expect(game.perkPickups[0].kind).toBe('glass-cannon')
    game = await clickAction(pages[0], () =>
      pages[0].getByRole('button', { name: /Continue the voyage/ }).click(),
    )
    for (const p of pages) await expect(p.locator('[data-perk="glass-cannon"]')).toHaveCount(1)
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
      p.ownerId = i < 12 ? ids[0] : null
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
    expect(game.roundHistory.at(-1)?.teams[0].ports).toBe(13)
    await clickAction(pages[0], () => pages[0].getByRole('button', { name: /Continue to victory/ }).click())
    for (const p of pages)
      await expect(p.getByRole('heading', { name: 'The voyage, round by round' })).toBeVisible()
    await pages[4].getByLabel('Chart', { exact: true }).selectOption('ports')
    await pages[4].getByText('View exact round statistics').click()
    await expect(pages[4].getByRole('cell', { name: '1 / 13', exact: true })).toBeVisible()
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
      game = await clickAction(pages[0], () =>
        pages[0].getByRole('button', { name: /Begin port draft/ }).click(),
      )
      expect(game.mapId).toBe(mapId)
      expect(game.mapSelection?.totalTickets).toBe(4)
      const board: Board = await (await pages[0].request.get('/api/board')).json()
      expect(board.id).toBe(mapId)
      expect(board.version).toBe(game.boardVersion)
      for (const p of pages) {
        await expect(p.getByRole('region', { name: 'Selected map' })).toContainText(board.name)
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
      const act = async (data: object) => {
        const actor = pages[ids.indexOf(game.activePlayerId!)]
        const result = await actor.request.post('/api/game/action', {
          headers,
          data: { ...data, expectedRevision: game.revision },
        })
        expect(result.status(), await result.text()).toBe(200)
        game = await result.json()
      }
      for (let i = 0; i < 12; i++) await act({ type: 'draft', portId: game.ports[i].id })
      for (let i = 0; i < 4; i++) {
        const ports = game.ports.filter((p) => p.ownerId === game.activePlayerId)
        for (const port of ports)
          for (const cell of board.cells.filter((c) => c.harborId === port.id).slice(0, 2))
            await act({ type: 'place', portId: port.id, q: cell.q, r: cell.r })
        await act({ type: 'finish-placement' })
      }
      expect(game.ships).toHaveLength(24)
      expect(game.perkPickups).toHaveLength(4)
      for (const p of pages) await expect(p.locator('.sea-map [data-perk]')).toHaveCount(4)
      await pages[4].screenshot({ path: testInfo.outputPath(`${mapId}-board.png`), fullPage: true })
      const actor = pages[ids.indexOf(game.activePlayerId!)]
      game = await clickAction(actor, () =>
        actor.getByRole('button', { name: 'Roll to sail', exact: true }).click(),
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
})
