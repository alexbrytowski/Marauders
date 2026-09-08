# Marauders contributor guide

## Project map

- `client/` is the React + TypeScript UI, built with Vite.
- `server/` is the ASP.NET Core API and SignalR hub. Game-rule enforcement belongs here.
- `GAME_RULES.md` is the product/rules source of truth.
- `Original Marauders Board.jpeg` is the visual reference for the board.
- `TASKLIST.md` is the implementation and release checklist.

## Working agreement

- Treat `GAME_RULES.md` as authoritative. If a requested behavior conflicts with it or fills in an unspecified detail, call that out and record the decision in `TASKLIST.md` or a dedicated decision document before encoding it.
- Keep clients untrusted: the server must derive the acting player from authenticated session/connection identity, validate every rule, make random rolls, and publish the resulting state/events.
- Do not put secrets, connection strings, production URLs, or `server/data/game-state.json` in version control.
- Preserve the original board image. Create derived board data/assets instead of modifying it.
- Prefer small, focused commits. Do not overwrite unrelated working-tree changes.

## Local development

Prerequisites: a .NET 10 SDK and a current Node.js/npm installation.

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

The Vite dev server proxies `/api` and `/hubs` to `http://localhost:5133`.

## Verification

Run the relevant checks before handing off a change:

```powershell
Set-Location client
npm run lint
npm run build

Set-Location ..
dotnet build Marauders.slnx
dotnet test Marauders.slnx
```

Add server unit tests for rule changes and an end-to-end multi-browser test for changes affecting turns, permissions, SignalR synchronization, or persistence. Update `TASKLIST.md` when a listed item changes status.

## Hosting direction

Deploy the client and API behind HTTPS on the same public origin where possible. Use a real database and managed identity/authentication before public release; the current single JSON game-state file is local-development-only.
