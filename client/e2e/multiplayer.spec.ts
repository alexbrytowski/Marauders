import { test, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Board, Game } from '../src/game'
import { colors, key } from '../src/game'

const root = path.resolve('..')
let server: ChildProcess
let dataDirectory: string
let output = ''
const headers = { 'X-Marauders-Client': 'web' }

async function startServer(published = false) {
  output = ''
  const localDotnet = path.join(root, '.dotnet-sdk', 'dotnet.exe')
  server = spawn(
    existsSync(localDotnet) ? localDotnet : 'dotnet',
    [path.join(root, published ? 'artifacts/publish/Marauders.Server.dll' : 'server/bin/Release/net10.0/Marauders.Server.dll'), '--urls', 'http://127.0.0.1:5134'],
    {
      cwd: path.join(root, published ? 'artifacts/publish' : 'server'),
      windowsHide: true,
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        Game__DataDirectory: dataDirectory,
        Game__TurnSeconds: '1800',
        Game__ActionSeconds: '900',
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

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(path.join(tmpdir(), 'marauders-e2e-'))
  await startServer()
})
test.afterAll(async () => {
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
