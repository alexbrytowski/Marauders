# Marauders implementation status

Updated 2026-09-08 against [GAME_RULES.md](GAME_RULES.md) and the owner's notes in
[9-8-26.md](9-8-26.md). Scope is one private game for friends, retaining server
state and JSON persistence. See [decisions](DECISIONS.md)
and [board mapping notes](BOARD_MAPPING.md) for explicit interpretations.

Legend: `[x]` implemented and locally verified; `[~]` partial or needs wider
verification; `[ ]` not done. CI configuration is present but has not run remotely.

## Board and player experience

- [x] Replace the photo with a server-defined SVG hex map: land, water, 13 ports,
  harbor zones, colored ship tokens, zoom, route previews, and legal-cell highlights.
- [~] Certify the map against the original photo. Terrain was extracted and the
  overlay inspected; harbor connectivity and minimum setup capacity are tested.
  Final owner review of exact dark-blue membership and glare-obscured cells remains.
- [x] Four corner captain cards show ports, fleet/cap, action dice, active turn,
  character, and construction progress. Personal tabs expose ports, fleet, shipyards.
- [x] Public battle dialog for all players and spectators: participants, helper/
  harbor dice, each public roll, results, casualty choices, and continuation.
- [x] Public persistent captain's log for turns, movement, rolls, capture, losses,
  construction, timeouts, elimination, and victory.
- [x] One captain per signed browser session, shared across tabs, preserved by
  refresh/reconnection/server restart. Extra visitors get spectator controls.
- [x] Server derives the actor from authenticated identity; client player IDs grant
  no authority. Wrong-turn, wrong-owner, stale-revision and spectator commands fail.
- [x] Four-seat lobby, distinct colors, generic cosmetic character choices, host
  selection of first player, twelve-pick snake draft, one unowned port.
- [x] Three playable maps: the unchanged original named Classic, The Narrows,
  and Shattered Isles. Lobby votes become tickets in a server-drawn lottery;
  no votes gives each map equal odds. Previews, odds, selection, and saved map
  identity synchronize across browsers. Designs and checks are in MAPS.md.
- [~] Four-player balance playtesting for the new maps and their draft strategies.
- [x] Owners place two ships per owned port in empty dark-blue cells before play.
- [x] Responsive desktop/phone layouts, keyboard map navigation, accessible labels,
  native modal focus containment, and reduced-motion styles.
- [~] Wider mobile/touch and screen-reader playtesting. Desktop and 390px layouts
  have automated screenshots/overflow checks; real-device testing remains.
- [x] Replace prototype text encoding artifacts and default Vite page metadata.
- [x] Eight configurable character profiles with JPEG support and placeholders;
  setup and private asset handling are documented in CHARACTERS.md.
- [ ] Install the final eight names/JPEGs when provided by the game owner.
- [x] Implement ship-held perks: Black Pearl conversion, Glass Cannon 0–8,
  Loaded Dice 1/2 → 3, and a port-local Architect. One perk per ship, no fleet limit.
- [x] Random open-water pickups with balanced sailing access and spacing; pickup
  along movement routes, public effects, and drops on ship destruction.
- [~] Balance playtest for perks and pickup quantity; analysis in PERK_BALANCE.md.
- [x] About and How to play pages, verified in the browser.
- [x] Round-by-round fleet/port snapshots and victory charts/table; server capture,
  timeout, construction timing, persistence, and browser verification passed.

## Rules and game flow

- [x] Population-based action dice; server-generated random rolls; split movement
  across ships; no stacking, land traversal, or crossing occupied cells.
- [x] Check every step of a route and stop at the first automatic battle, retaining
  unspent movement. The client previews that stopping point.
- [x] Adjacent enemy ships and shared-harbor encounters trigger combat. Active
  captain chooses among simultaneous encounters; further encounters are rechecked.
- [x] Nonchaining helpers within two hexes of each team's trigger, public ties/
  rerolls, loser-owned casualty selection, continued battle after helper losses.
- [x] Owned harbor defense contributes an extra ship-battle die, not a casualty.
- [x] Port attacks cost one unused action, include eligible helpers, expose both
  sides' rolls, and require ship combat to be resolved first.
- [x] Defense wins weaken the port indefinitely without destroying attackers;
  allied harbor entry resets weakness; unowned ports retain it.
- [x] Capture transfers ownership, voids construction, converts remaining ships
  after final-port loss, and declares victory at all 13 ports. Further play stops.
- [x] Construction obeys fleet plus in-progress population cap, stays at its chosen
  port, completes after two future owner rounds, and cannot move on launch turn.
- [x] Spawning prefers empty owning-harbor cells, then nearest reachable open sea.
- [x] Zero-ship captains enter construction; eliminated captains are skipped.
- [x] Separate configurable round/action clocks, visible countdowns, immediate
  deadline validation, and normal construction completion on timeout.
- [~] Playtest timer lengths and timeout casualty policy. Defaults are 120/45
  seconds; deterministic automatic casualty handling is recorded in DECISIONS.md.

## Engineering before staging

- [x] .NET 10 local SDK available; SDK major/feature roll-forward pinned by global.json.
- [x] Server unit tests for board/rules and store concurrency, private identities,
  rejected commands, immutable snapshots, and reload/persistence.
- [x] Five-context browser test covers four-player joining, duplicate seats, draft,
  placement, spectator restrictions, forged actor IDs, public rolls, cross-tab
  identity, reconnect, shared battle/casualty UI, and persistence across restarts.
- [x] GitHub Actions workflow runs lint/build, server tests, and browser tests.
  Remote CI execution is not yet verified.
- [x] Atomic local save replacement and revision-ordered client updates. Original
  prototype save is preserved; new schema uses game-state-v2.json.
- [x] Secure cookie policy, mutation rate limiting, cross-origin mutation defense,
  input validation, no-cache API responses, and server-side authorization checks.
- [x] Health endpoint, structured framework logs, exception responses, production
  HSTS/HTTPS configuration, and same-origin static-client publish support.
- [x] Document environment configuration and local verification commands.
- [x] Windows one-command launcher locates the local SDK, builds and starts the API
  and website, waits for readiness, and stops its services on Ctrl+C. User PATH
  includes the installed SDK; existing terminals can use the launcher immediately.
- [x] Retain single-match JSON storage per the owner's revised private-game scope.
  Database, lobby codes, multiple matches, and managed accounts are deferred and
  are not prerequisites for this friends-only version.
- [x] Password-protected controller reset from any browser, keep/release seats,
  archive old saves, and reject stale reset reviews; multi-browser verification passed.
- [x] One-command four-window practice launcher with separate browser profiles,
  independent save, and longer clocks; four independent signed sessions verified.
- [x] Move endpoints into controllers while keeping rule decisions in GameRules
  and atomic save/identity operations in GameStateStore.
- [x] Document JSON backup, retention proposal, restore, and incident response in
  OPERATIONS.md. Reset archives and reload/failure behavior have server tests.
- [x] Keep passwords in process configuration or generate them at local startup;
  ignore local secret files, saves, keys, archives, and private photos in Git.

## Before sharing a hosted game

- [ ] Choose hosting provider/domain and deploy behind managed HTTPS with persistent
  storage, one server instance, and WebSocket support. No external deployment has been performed.
- [ ] Add provider-specific deployment pipeline, rollback, and secret configuration.
- [ ] Complete four-player playtests for timeout, simultaneous encounters, captures,
  elimination, victory, mobile play, and spectator/reconnection behavior.
- [ ] Publish owner-approved privacy/contact information for the actual host and
  personal character photos; no analytics or managed account provider is configured.
- [ ] Configure uptime/error alerts once hosting is chosen; the incident/recovery
  runbook is in OPERATIONS.md.

## Current verification

- Client lint and production build passed with the September 8 changes.
- 56 server tests passed in Release, zero warnings.
- All five browser scenarios passed: four-player rules and permissions, controller
  reset/profiles/help, perks/victory history, both new maps and voting, and published
  same-origin serving. Restart persistence is covered for ballots and selected maps.
- Desktop/mobile screenshot review passed, including map voting and both new boards.
- Normal launcher and four-window practice launcher startup checks passed; API,
  website, browser sessions, and owned-service cleanup were verified.
- Release build and same-origin publish passed with zero warnings/errors.
- Debug build initially encountered the old running prototype's executable lock;
  Release builds/tests use a separate output directory.

## Next work

1. Four-player map/perk/timer/mobile playtesting using Play-Local-Crew.cmd or real devices.
2. Owner-supplied character assets and original-board review.
3. Owner-selected hosting/domain, deployment, and hosted operational checks.

## Owner decisions still needed

- Exact dark-blue membership if any photo cells differ from the first-ring mapping.
- Final eight character names/JPEGs; playtest feedback on perk power and quantity.
- Playtested timer durations and acceptance of the documented timeout policy.
- Hosting/domain, privacy/contact wording, and acceptance of the proposed backup retention.
