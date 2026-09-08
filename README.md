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

## Play

1. Join with a name, color, and cosmetic character.
2. The host starts a snake draft. Select a port on the map, then confirm the pick.
3. Select each owned port and click two highlighted harbor cells to place ships.
4. Roll to sail, select a ship, choose a highlighted destination, and confirm its
   route. A route stops when combat triggers. Unused movement can be split among ships.
5. Select a ship in an enemy harbor to attack that port with an unused action.
6. Everyone watches the battle dialog. The active captain rolls; only the losing
   captain chooses their casualty. Rolls remain in the captain's log.
7. At round end, select owned ports for construction, then finish the round.

Use the corner cards or personal Ports/Fleet/Shipyards tabs to inspect your crew.
Map arrow keys move focus; Enter/Space selects. Zoom controls enlarge the map for
touch play, and Fit returns to the whole-board view.

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
`Game__TurnSeconds` defaults to 120, `Game__ActionSeconds` to 45. Both need playtesting.

The current single match is stored in `server/data/game-state-v2.json`. Session
bindings are private; signing keys are under `server/data/keys/`. Preserve both to
retain browser seats across server restarts. Neither belongs in version control.
The original `game-state.json` is preserved and is not migrated onto the new grid.
JSON persistence and browser-only identity are local-development foundations;
database-backed matches and managed authentication remain release requirements.

## Same-origin build

Build the client, then run:

```powershell
dotnet publish server/Marauders.Server.csproj --configuration Release --output artifacts/publish
```

The publish target includes `client/dist` under `wwwroot` so the API, hub, and UI can
share one origin. Production enables HTTPS/HSTS and secure cookies. Trust proxy
headers only from your actual reverse proxy. Hosting, database, authentication,
backups, and remote deployment are still tracked in the tasklist.

The board is derived from the reference JPEG, which is untouched. See
[BOARD_MAPPING.md](BOARD_MAPPING.md) to reproduce and review the extraction.
