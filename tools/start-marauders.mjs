import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { randomBytes } from 'node:crypto'
import { openLocalCrew } from './local-crew.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverDirectory = path.join(root, 'server')
const clientDirectory = path.join(root, 'client')
const localSdk = path.join(root, '.dotnet-sdk', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet')
const dotnet = existsSync(localSdk) ? localSdk : 'dotnet'
const environment = {
  ...process.env,
  DOTNET_CLI_HOME: path.join(root, '.dotnet'),
  DOTNET_NOLOGO: '1',
  ...(existsSync(localSdk) ? { DOTNET_ROOT: path.dirname(localSdk) } : {}),
}
const crewMode = process.argv.includes('--crew')
const apiPort = crewMode ? 5135 : 5133
const clientPort = crewMode ? 5175 : 5173
const apiUrl = `http://localhost:${apiPort}`
const websiteUrl = `http://localhost:${clientPort}`
const boardVersion = JSON.parse(readFileSync(path.join(serverDirectory, 'board.json'), 'utf8')).version
const checkOnly = process.argv.includes('--check')
const resetOnStart = process.argv.includes('--reset')
const children = new Set()
let crewContexts = []
let stopping = false

function launch(file, args, cwd, env = environment) {
  const child = spawn(file, args, { cwd, env, stdio: 'inherit', windowsHide: true })
  children.add(child)
  child.once('exit', () => children.delete(child))
  child.once('error', () => children.delete(child))
  return child
}

async function run(file, args, cwd) {
  const child = launch(file, args, cwd)
  await new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`Could not start ${file}: ${error.message}`)))
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited with code ${code}. See the output above.`)))
  })
}

async function npm(args) {
  // npm.cmd is a batch file on Windows. All command arguments here are fixed
  // project commands; paths are passed separately through cwd.
  if (process.platform === 'win32') await run('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], clientDirectory)
  else await run('npm', args, clientDirectory)
}

async function isOurGame(origin) {
  try {
    const response = await fetch(`${origin}/api/maps`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return false
    const maps = await response.json()
    return Array.isArray(maps) && maps.some(map => map.id === 'classic' && map.version === boardVersion)
  } catch { return false }
}

async function portInUse(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: 'localhost', port })
    const finish = used => { socket.destroy(); resolve(used) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(1000, () => finish(false))
  })
}

async function stopChildren() {
  stopping = true
  await Promise.all(crewContexts.map(context => context.close().catch(() => {})))
  crewContexts = []
  await Promise.all([...children].map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 4000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })))
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void stopChildren().then(() => process.exit(0))
})

try {
  console.log('\nMARAUDERS — starting your local game\n')
  if (await isOurGame(websiteUrl)) {
    if (resetOnStart) throw new Error('Close the existing launcher before starting with --reset.')
    console.log(`Marauders is already running. Open ${websiteUrl}\n`)
    if (crewMode) throw new Error('The local crew game is already running. Use its four windows, or close its launcher before reopening them.')
  } else {
    const [apiBusy, clientBusy] = await Promise.all([portInUse(apiPort), portInUse(clientPort)])
    if (apiBusy || clientBusy) {
      throw new Error(`Port ${[apiBusy ? apiPort : null, clientBusy ? clientPort : null].filter(Boolean).join(' / ')} is already in use. Close the old server or website terminal, then run the launcher again.`)
    }
    await run(dotnet, ['--version'], root)
    const vite = path.join(clientDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
    if (!existsSync(vite)) await npm(['ci'])
    await npm(['run', 'build'])
    await run(dotnet, ['build', path.join(serverDirectory, 'Marauders.Server.csproj'), '--configuration', 'Release', '--nologo'], root)

    const resetPassword = environment.Game__ResetPassword || randomBytes(18).toString('base64url')
    // Print only the newly generated local password, never a configured secret.
    if (!environment.Game__ResetPassword && !checkOnly) console.log(`Local game controller password for this run: ${resetPassword}\n`)
    const api = launch(dotnet, [path.join(serverDirectory, 'bin', 'Release', 'net10.0', 'Marauders.Server.dll'), '--urls', apiUrl], serverDirectory, {
      ...environment, ASPNETCORE_ENVIRONMENT: 'Development', Game__ResetPassword: resetPassword,
      ...(crewMode ? { Game__DataDirectory: path.join(root, 'artifacts', 'local-crew', 'data') } : {}),
    })
    const client = launch(process.execPath, [vite, '--host', 'localhost', '--port', String(clientPort), '--strictPort'], clientDirectory, {
      ...environment, MARAUDERS_API_URL: apiUrl,
    })
    let serviceFailure
    const closed = Promise.race([api, client].map(child => new Promise(resolve => {
      child.once('error', error => { serviceFailure = error; resolve() })
      child.once('exit', code => { serviceFailure = new Error(`A game service stopped (code ${code}).`); resolve() })
    })))
    const deadline = Date.now() + 45_000
    let ready = false
    while (Date.now() < deadline && !serviceFailure) {
      if (await isOurGame(websiteUrl)) { ready = true; break }
      await delay(300)
    }
    if (serviceFailure) throw serviceFailure
    if (!ready) throw new Error('The website did not become ready. See the server output above.')
    if (resetOnStart) {
      const sessionResponse = await fetch(`${websiteUrl}/api/session`)
      if (!sessionResponse.ok) throw new Error('Could not create a session for the requested reset.')
      const cookie = sessionResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      const previous = await (await fetch(`${websiteUrl}/api/game`)).json()
      const response = await fetch(`${websiteUrl}/api/game/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Marauders-Client': 'web', Cookie: cookie },
        body: JSON.stringify({ password: resetPassword, gameId: previous.id, expectedRevision: previous.revision, releaseSeats: crewMode }),
      })
      if (!response.ok) throw new Error(`Could not reset the match: ${(await response.json()).error}`)
      console.log(`Match reset to the lobby. ${crewMode ? 'Captain seats released for the new crew windows' : 'Captain seats retained'}; the previous match was archived.\n`)
    }
    console.log(`\nREADY — open ${websiteUrl}\nKeep this window open while playing. Press Ctrl+C to stop both services.\n`)
    if (crewMode) {
      crewContexts = await openLocalCrew(root, websiteUrl, checkOnly)
      console.log('Four independent captain windows are ready. This practice game has its own save, separate from your main game.\n')
    }
    if (checkOnly) {
      const response = await fetch(`${websiteUrl}/api/session`)
      if (!response.ok || !(await response.json()).hasOwnProperty('playerId')) throw new Error('The browser session endpoint did not respond correctly.')
      console.log('Startup check passed: website, API, and browser session are reachable.')
    } else {
      await closed
      if (!stopping) throw serviceFailure
    }
  }
} catch (error) {
  console.error(`\nCould not start Marauders: ${error.message}\n`)
  process.exitCode = 1
} finally {
  await stopChildren()
}
