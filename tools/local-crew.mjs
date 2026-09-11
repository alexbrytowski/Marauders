import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const require = createRequire(new URL('../client/package.json', import.meta.url))

// Separate persistent profiles use the real signed-browser identity flow.
// No debug seat-switching endpoint or client-supplied player ID is needed.
export async function openLocalCrew(root, url, headless = false) {
  const { chromium } = require('@playwright/test')
  const contexts = []
  try {
    for (let i = 0; i < 4; i++) {
      const directory = path.join(root, 'artifacts', 'local-crew', `captain-${i + 1}`)
      await mkdir(directory, { recursive: true })
      const context = await chromium.launchPersistentContext(directory, {
        channel: process.platform === 'win32' ? 'msedge' : undefined,
        headless,
        // Use the native window dimensions. A fixed emulated viewport leaves
        // blank space when a captain maximizes the window on a large monitor.
        viewport: null,
        args: ['--start-maximized'],
      })
      contexts.push(context)
      const page = context.pages()[0] ?? await context.newPage()
      await page.goto(url)
      await page.locator('.connection.connected').waitFor({ timeout: 30_000 })
      if (await page.getByLabel('CAPTAIN NAME').isVisible()) {
        await page.getByLabel('CAPTAIN NAME').fill(`Captain ${i + 1}`)
        const color = ['#ed7866', '#69c5bc', '#b19bdf', '#e6be68'][i]
        const choice = page.getByLabel(`Choose ${color} crew color`)
        if (await choice.isEnabled()) await choice.click()
        await page.locator('.profile-picker button:enabled').first().click()
        await page.getByRole('button', { name: /Join the crew/ }).click()
        await page.getByText('Your seat is reserved.').waitFor()
      }
    }
    if (headless) {
      const identities = await Promise.all(contexts.map(async (context) => (await context.request.get(`${url}/api/session`)).json()))
      if (identities.some((s) => !s.playerId) || new Set(identities.map((s) => s.playerId)).size !== 4)
        throw new Error('Local crew check did not create four independent captain identities.')
    }
    return contexts
  } catch (error) {
    await Promise.all(contexts.map((context) => context.close()))
    throw error
  }
}
