# Marauders

A four-player pirate strategy game with a playable hex map, private browser seats,
public battles, and server-enforced rules. See [GAME_RULES.md](GAME_RULES.md),
[TASKLIST.md](TASKLIST.md), and [implementation decisions](DECISIONS.md).

Requires a .NET 10 SDK and current Node.js/npm (Node 24 is used in CI).

For Railway, follow [DEPLOY.md](DEPLOY.md). The Dockerfile builds the UI and API
together and includes all eight approved web portraits. One persistent `/data`
volume holds the single JSON game, browser keys and reset archives.

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
watch as spectators. The first captain hosts and chooses who takes the first turn.

If an already-open terminal still says `dotnet` is not recognized, use
`& C:\Marauders\.dotnet-sdk\dotnet.exe run` from `server`, or use the launcher
above. The SDK has been added to this machine's user PATH; reopen the terminal
application for it to take effect. The launcher does not depend on that change.

### Play all four captains on one computer

Double-click **Play-Local-Crew.cmd**. It resets the practice game, releases any old
seat bindings, builds the game, and opens four independent
Edge windows with their own persistent browser profiles and prefilled captain seats.
Windows open maximized and follow your actual monitor/window size. F11 toggles
the browser's full-screen mode.
After updating from the fixed 1100×850 launcher, close and reopen the crew launcher
once. Refreshing an old window cannot remove its emulated viewport.
Each launch starts a fresh practice match and archives the previous match. The
practice launcher releases old seat bindings before opening the four windows, so
stale browser profiles do not become spectators.
The practice game runs on `http://localhost:5175` with separate state under
`artifacts/local-crew/`, so your main game's save is unaffected. Both launchers use
135 seconds minimum per round and 45 per action by default; larger fleets get more turn time.
Keep its launcher open; Ctrl+C closes the practice services and windows. Running
Play-Local-Crew.cmd again starts a fresh practice match, as described above; it
does not resume the previous practice game. Use Game controller for an in-app reset.
On Linux, install Playwright Chromium first; the same launcher supports `--crew`.

To rehearse the endgame pacing, double-click **Play-Local-Crew-Round-50.cmd**.
It behaves like the normal local-crew launcher, but the fresh match begins at
round 50 after all four captains ready up. This lets you see the warning appear
at round 58 and the longer construction timing activate at round 66. It uses the
same disposable local-crew save area and never changes the main local game.

To test the action-dice change directly, double-click
**Play-Local-Crew-Round-99.cmd**. The fresh match begins at round 99, using one
action die per three ships for that round, then activates one die per two ships
at round 100. It uses the same isolated, disposable practice save.

The launcher shows a newly generated local reset password in its terminal unless
you already supplied `Game__ResetPassword`. Passwords are never stored in Git or
the save. See [operations](OPERATIONS.md) for configuration, backup, and recovery.

## Play

1. Join with a name, color, and cosmetic character. Vote for Classic, The Choke,
   or Serpent's Coil; you can change or clear your vote before play starts.
2. The host chooses who goes first, then all four captains press **Ready to sail**.
   The fourth ready draws the map with one ticket per vote (equal chances if nobody votes)
   and reveals six perks. Each captain receives three geographically balanced random
   ports drawn from a broad fair band. The most central port stays neutral: Blackwater,
   Northgate, or Serpent's Heart, depending on the map.
3. Two ships automatically launch at every owned port and play begins immediately.
4. Roll 4–6 to sail, select a ship, choose a highlighted destination, and confirm its
   route. A route stops when combat triggers. Unused movement can be split among ships.
5. Select a ship in an enemy harbor to attack that port with an unused action.
6. Everyone watches the battle dialog. The active captain rolls; only the losing
   captain chooses their casualty. Rolls remain in the captain's log.
7. At round end, select owned ports for construction, then finish the round. Unchosen builds start at random owned ports automatically, including on timeout.
8. Whirlpools may appear after a captain turn. Enter one to teleport, then chart
   again with unused movement. Each pair lasts two full cycles.

Hover ports to inspect shipbuilding and ships to read their perks. Black Pearl
recruits on a 1-in-6 roll; Mouth to Feed replaces Architect and adds one population
slot. Cheat Death rerolls the first losing exchange its carrier joins, then respawns
in open water. Ships grant one action die per three ships before round 100 and per
two ships starting at round 100, always rounding up. Ports assist
their owner's triggering ship from up to two hexes away, even outside harbor water.
**Forfeit and leave** asks for confirmation, removes your fleet, leaves your ports
neutral with full defense, and releases your browser seat. The last remaining port owner wins.

The whole map fits the monitor by default, with the original corner captain cards,
controls underneath, and personal Ports/Fleet/Shipyards tabs. Zoom is optional;
**Fit** restores the whole map. Map arrow keys move focus; Enter/Space selects.

Use **How to play** for nine short chapters, from board basics through the round-progression timeline and advanced rules,
with interactive examples using the actual map and pieces. Each chapter has a
direct link, previous/next navigation, and expandable details. Use **About** for game context,
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
`Game__TurnSeconds` defaults to 135 (minimum turn budget), `Game__ActionSeconds` to 45.
Each turn gets the greater of that minimum or `(starting action dice + 1) * action seconds`.
Two dice get 2:15; five get 4:30. Existing saved deadlines remain unchanged. These still need playtesting.

The current single match is stored in `server/data/game-state-v2.json`. Session
bindings are private; signing keys are under `server/data/keys/`. Preserve both to
retain browser seats across server restarts. Neither belongs in version control.
The original `game-state.json` is preserved and is not migrated onto the new grid.
The owner chose one small game with open joining and browser identity. There is
no invitation gate; reset remains password-protected. The current local store is
JSON. On September 11 the owner confirmed retaining that single-game design for
Railway, superseding the database prerequisite. The hosted game starts fresh;
local saves are excluded from the container. Keep one server process and back up
its persistent data and keys. See the
[launch checklist](TASKLIST.md) and [launch review](LAUNCH_REVIEW.md).

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
