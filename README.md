# Marauders

A four-player pirate strategy game with a playable hex map, private browser seats,
public battles, and server-enforced rules. See [GAME_RULES.md](GAME_RULES.md),
[TASKLIST.md](TASKLIST.md), and [implementation decisions](DECISIONS.md).

Requires a .NET 10 SDK and current Node.js/npm (Node 24 is used in CI).

## Run locally

On Windows, double-click **Start-Marauders.cmd** in the project folder. Or run
this from any PowerShell directory:

```powershell
C:\Marauders\Start-Marauders.cmd
```

The launcher finds the project-local .NET SDK automatically, builds the app, and
starts both services. Open `http://localhost:5173` when it says READY. Keep its
window open while playing; Ctrl+C stops the services it started. Running it again
while the game is ready reports the existing URL. It does not reset your game.

For separate development terminals, use:

```powershell
Set-Location server
dotnet run
```

In another terminal:

```powershell
Set-Location client
npm ci
npm run dev
```

Open `http://localhost:5173`. Four separate browser profiles/devices claim the four
seats. Another tab in the same browser remains the same captain. Additional visitors
watch as spectators. The first captain hosts and chooses who drafts first.

If an already-open terminal still says `dotnet` is not recognized, use
`& C:\Marauders\.dotnet-sdk\dotnet.exe run` from `server`, or use the launcher
above. The SDK has been added to this machine's user PATH; reopen the terminal
application for it to take effect. The launcher does not depend on that change.

### Play all four captains on one computer

Double-click **Play-Local-Crew.cmd**. It builds the game and opens four independent
Edge windows with their own persistent browser profiles and prefilled captain seats.
Windows open maximized and follow your actual monitor/window size. F11 toggles
the browser's full-screen mode.
After updating from the fixed 1100×850 launcher, close and reopen the crew launcher
once. Refreshing an old window cannot remove its emulated viewport.
To restart with a fresh match while keeping seats, close the launcher and run
`node tools/start-marauders.mjs --crew --reset`. This uses the password-protected
reset API and archives the previous match.
The practice game runs on `http://localhost:5175` with separate state under
`artifacts/local-crew/`, so your main game's save is unaffected. Both launchers use
60 seconds per round and 20 per action by default; environment settings can override these.
Keep its launcher open; Ctrl+C closes the practice services and windows. Reopening
it restores the four seats and practice game. Use Game controller to reset it.
On Linux, install Playwright Chromium first; the same launcher supports `--crew`.

The launcher shows a newly generated local reset password in its terminal unless
you already supplied `Game__ResetPassword`. Passwords are never stored in Git or
the save. See [operations](OPERATIONS.md) for configuration, backup, and recovery.

## Play

1. Join with a name, color, and cosmetic character. Vote for Classic, The Narrows,
   or Shattered Isles; you can change or clear your vote before the draft.
2. The host starts a snake draft. The server draws the map with one ticket per vote
   (equal chances if nobody votes) and reveals the perks. Select a port, then confirm the pick.
3. The final pick automatically launches two ships per owned port and starts play.
4. Roll to sail, select a ship, choose a highlighted destination, and confirm its
   route. A route stops when combat triggers. Unused movement can be split among ships.
5. Select a ship in an enemy harbor to attack that port with an unused action.
6. Everyone watches the battle dialog. The active captain rolls; only the losing
   captain chooses their casualty. Rolls remain in the captain's log.
7. At round end, select owned ports for construction, then finish the round.

The whole map fits the monitor by default, with the original corner captain cards,
controls underneath, and personal Ports/Fleet/Shipyards tabs. Zoom is optional;
**Fit** restores the whole map. Map arrow keys move focus; Enter/Space selects.

Use **How to play** for the complete in-app guide, **About** for game context,
and **Game controller** for password-authorized resets. Ship perks appear as sea
pickups; each ship can hold one. The victory screen charts every team's ships and
ports after each captain round. See [perk balance notes](PERK_BALANCE.md) and
[personal character setup](CHARACTERS.md) for the eight profile names/JPEGs.
Map designs, voting, and reproduction instructions are in [MAPS.md](MAPS.md).

## Verify

```powershell
dotnet build Marauders.slnx --configuration Release
dotnet test Marauders.slnx --configuration Release --no-build
Set-Location client
npm run lint
npm run build
Set-Location ..
dotnet publish server/Marauders.Server.csproj --configuration Release --output artifacts/publish
Set-Location client
npm run test:e2e
```

Browser tests use installed Edge on Windows. On Linux, first run
`npx playwright install --with-deps chromium`. Tests start isolated services on
5134/5174 and use a temporary save directory. They do not reset your local match.

## Configuration and storage

See [.env.example](.env.example) for shell/hosting variable names. ASP.NET reads
environment variables; this file is a reference, not an automatically loaded secret file.
`Game__TurnSeconds` defaults to 60, `Game__ActionSeconds` to 20. Both need playtesting.

The current single match is stored in `server/data/game-state-v2.json`. Session
bindings are private; signing keys are under `server/data/keys/`. Preserve both to
retain browser seats across server restarts. Neither belongs in version control.
The original `game-state.json` is preserved and is not migrated onto the new grid.
The owner chose one private game for friends with JSON persistence and browser
identity. Database-backed matches, lobby codes, and managed accounts are outside
the current scope. Keep a single server process and back up its data and keys.

## Same-origin build

Build the client, then run:

```powershell
dotnet publish server/Marauders.Server.csproj --configuration Release --output artifacts/publish
```

The publish target includes `client/dist` under `wwwroot` so the API, hub, and UI can
share one origin. Production enables HTTPS/HSTS and secure cookies. Trust proxy
headers only from your actual reverse proxy. Hosting, backup retention, and remote
deployment are tracked in the tasklist and [operations guide](OPERATIONS.md).

The board is derived from the reference JPEG, which is untouched. See
[BOARD_MAPPING.md](BOARD_MAPPING.md) to reproduce and review the extraction.
