import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

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
const apiUrl = 'http://localhost:5133'
const websiteUrl = 'http://localhost:5173'
const boardVersion = JSON.parse(readFileSync(path.join(serverDirectory, 'board.json'), 'utf8')).version
const checkOnly = process.argv.includes('--check')
const children = new Set()
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
    const response = await fetch(`${origin}/api/board`, { signal: AbortSignal.timeout(1500) })
    return response.ok && (await response.json()).version === boardVersion
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
    console.log(`Marauders is already running. Open ${websiteUrl}\n`)
  } else {
    const [apiBusy, clientBusy] = await Promise.all([portInUse(5133), portInUse(5173)])
    if (apiBusy || clientBusy) {
      throw new Error(`Port ${[apiBusy ? 5133 : null, clientBusy ? 5173 : null].filter(Boolean).join(' / ')} is already in use. Close the old server or website terminal, then run Start-Marauders.cmd again.`)
    }
    await run(dotnet, ['--version'], root)
    const vite = path.join(clientDirectory, 'node_modules', 'vite', 'bin', 'vite.js')
    if (!existsSync(vite)) await npm(['ci'])
    await npm(['run', 'build'])
    await run(dotnet, ['build', path.join(serverDirectory, 'Marauders.Server.csproj'), '--configuration', 'Release', '--nologo'], root)

    const api = launch(dotnet, [path.join(serverDirectory, 'bin', 'Release', 'net10.0', 'Marauders.Server.dll'), '--urls', apiUrl], serverDirectory, {
      ...environment, ASPNETCORE_ENVIRONMENT: 'Development',
    })
    const client = launch(process.execPath, [vite, '--host', 'localhost', '--port', '5173', '--strictPort'], clientDirectory, {
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
    console.log(`\nREADY — open ${websiteUrl}\nKeep this window open while playing. Press Ctrl+C to stop both services.\n`)
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
