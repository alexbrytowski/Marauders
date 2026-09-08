# Marauders

Marauders is a four-player online pirate board-game prototype.

Prerequisites: .NET 10 SDK and Node.js/npm.

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

Open the Vite URL shown in the terminal. The server persists one local-development match in `server/data/game-state.json`; this is not a production hosting design.

See [the rules](GAME_RULES.md), [current implementation status](TASKLIST.md), and [contributor guidance](AGENTS.md).
