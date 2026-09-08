# Marauders implementation status

Audited 2026-09-07 against [GAME_RULES.md](GAME_RULES.md). Status reflects the current source, not a playtest certification.

## Snapshot

The project is a functional local prototype, not yet safe or complete for public hosting. It has the core play loop, but several rule-critical behaviors are simplified or missing, and players are not authenticated.

Legend: `[x]` implemented, `[~]` partially implemented or needs verification, `[ ]` not implemented.

## Completed foundation

- [x] React/Vite client and ASP.NET Core/SignalR server are present.
- [x] Lobby accepts up to four named players with colors; a fifth player cannot join as a player.
- [x] Twelve-pick four-player snake draft assigns three of the 13 ports to each player and leaves one unowned.
- [x] Game begins with two ships for every owned port.
- [x] Server computes action count from active ships using the required 1–3 / 4–7 / 8–11 / +4 progression.
- [x] Server-validated movement prevents ships from stacking or crossing occupied cells and spends rolled movement.
- [x] Basic adjacent ship combat, helper dice, tie rerolls, loser-selected ship removal, and SignalR state broadcast exist.
- [x] Enemy/unowned-port attacks, port defense weakness, capture, and final-port ship conversion exist in simplified form.
- [x] End-of-round construction selection and two-owner-turn construction tracking exist in simplified form.
- [x] A two-minute server-side turn timer exists.
- [x] Client production build passes: `npm run build` on 2026-09-07.

## Rule parity work

### Blockers — resolve before real playtesting

- [ ] Replace the rectangular/open-water board model with exact hex data from the original board: water, land, port cells, and each port's dark-blue defense water. The current `BoardDefinition` treats nearly every rectangle cell as navigable water.
- [ ] Make initial ship placement player-selected in legal dark-blue cells. It is currently automatic.
- [ ] Add reliable browser identity and authorization. All mutation endpoints currently accept a caller-supplied `playerId`, so anyone who can see an ID can act as that player; spectators are not actually supported as restricted viewers.
- [ ] Implement game victory when one player owns all ports, show the winner, and stop turns/actions afterward.
- [ ] Add automated server rule tests. There are currently no test projects.

### Combat and attacks

- [ ] Detect all legal combat triggers, including opposing ships sharing a port's dark-blue water, and let the acting player choose which simultaneous combat resolves first.
- [ ] Use the exact assistance rule for each triggered pair, including correct continuation/end behavior after a triggering ship is removed.
- [ ] Add the defending port's extra combat die when ship combat happens in its dark-blue water.
- [ ] Implement port attacks with every eligible participating attacking ship and show all public rolls/results. Current port attacks use one selected ship and expose only the attacker’s last roll.
- [ ] Preserve and display combat/port-attack history so public rolls are auditable.
- [ ] Void construction at a captured port, as required. Current capture changes ownership but leaves those constructions intact.

### Turns, construction, and timers

- [ ] Decide and configure separate playtested action and turn durations; only a fixed two-minute turn timer exists.
- [ ] Make timeout follow the normal end-round path, including construction completion. Current timer advances the active player directly and bypasses build processing.
- [ ] Clearly show construction progress and completed/spillover placement; validate that completion always prefers the owning port’s dark-blue water before wider legal blue water.
- [ ] Ensure players with no ships automatically end/skip their round according to the rule wording, with a clear UI state.

### Setup and player experience

- [ ] Add character selection, character assets when supplied, perk selection, and selected-character display.
- [ ] Implement perks after balancing decisions: Silver Tongue, Loaded Dice, and Divine Intervention.
- [ ] Let players choose who goes first before the draft; current order is lobby join order.
- [ ] Add an explicit spectator experience: join/watch without player controls, reconnect to the same identity, and show whose turn it is.
- [ ] Improve board interaction for mobile/accessibility: valid-cell highlights, movement path preview, keyboard-accessible controls, labels, and responsive layout testing.
- [ ] Fix UI text encoding artifacts such as `â€¦` and `Â·`.

## Engineering and hosting checklist

### Before staging

- [ ] Install/standardize the .NET 10 SDK in developer and CI environments; this audit could not run `dotnet build` because `dotnet` was absent from `PATH`.
- [ ] Add backend unit tests plus API/SignalR integration tests; run them in CI with client lint/build.
- [ ] Replace `server/data/game-state.json` with a database-backed match model (matches, players, ports, ships, constructions, events). Keep transactional/concurrency protection.
- [ ] Support multiple matches with lobby codes instead of one globally persisted match.
- [ ] Move configuration to environment variables and add development/production config examples without secrets.
- [ ] Add structured logs, health/readiness endpoints, error handling, and a database backup/retention plan.
- [ ] Add rate limits, input validation, authenticated authorization policies, secure cookies/tokens, and HTTPS-only production settings.
- [ ] Serve client/API from one origin or configure explicit production CORS and SignalR WebSocket settings. Current CORS permits only `http://localhost:5173`.

### Before public launch

- [ ] Deploy a staging environment with managed HTTPS, a managed database, persistent storage, and real-time WebSocket support.
- [ ] Add production deployment configuration/CI, migrations, rollback steps, and secret management.
- [ ] Run four-player and spectator playtests covering reconnection, refresh, timer expiry, simultaneous combat choices, captures, elimination, and victory.
- [ ] Publish privacy/contact information appropriate to the chosen authentication and analytics approach.
- [ ] Set up uptime/error monitoring and a basic incident/recovery runbook.

## Suggested delivery order

1. Finish exact board data and server rule parity, then write automated rule tests.
2. Add player identity, spectators/reconnects, game completion, and multi-match persistence.
3. Playtest and balance timers/perks; polish the interaction model.
4. Add staging, CI, security hardening, observability, and public deployment.

## Decisions still needed from the game owner

- Exact dark-blue hex membership and any land/water cells that are ambiguous in the photograph.
- First-player selection method and the action/turn time limits after playtesting.
- Character roster, artwork, and whether characters have mechanical effects.
- Final perk wording/balance, including when Loaded Dice applies and how Divine Intervention is invoked.
- Hosting provider/domain, authentication approach, privacy expectations, and whether games must persist indefinitely.
