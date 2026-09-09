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
- [x] Original corner captain cards show ports, fleet/cap, action dice, active turn,
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
- [x] Reveal all four perks before the first draft pick and preserve the layout
  through drafting, reconnects, server restarts, and launch on all three maps.
- [x] Final port pick automatically launches two ships per owned harbor and starts
  play. No placement or fleet confirmation; old setup saves resume automatically.
- [x] Restore the original UI and fit the whole board to the monitor by default.
  Keep the native-window launcher fix; remove the 1800px page and 840px map caps.
  Restored layout, all 13 visible ports, and optional zoom verified at 1920px and 2560px.
- [x] Keyboard map navigation, accessible labels,
  native modal focus containment, and reduced-motion styles.
- [~] Wider screen-reader playtesting. Mobile/touch refinement is deferred by the
  owner; desktop monitors are the target for this private game.
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
- [~] Playtest timer lengths and timeout casualty policy. Owner-approved defaults
  are now 60/20 seconds in both launchers; the four-window practice override is
  removed. Deterministic automatic casualty handling is recorded in DECISIONS.md.

## Engineering before staging

- [x] .NET 10 local SDK available; SDK major/feature roll-forward pinned by global.json.
- [x] Server unit tests for board/rules and store concurrency, private identities,
  rejected commands, immutable snapshots, and reload/persistence.
- [x] Five-context browser test covers four-player joining, duplicate seats, draft,
  automatic fleets, spectator restrictions, forged actor IDs, public rolls, cross-tab
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
  independent save, and the normal configurable clocks; four signed sessions verified.
- [x] Remove the practice launcher's fixed 1100×850 browser viewport and start maximized.
  Native content resizing of all four launcher windows verified at 1920px and 2560px,
  with all ports fitting and no map scrolling in the default view.
- [x] Explicit --reset startup option uses the authenticated reset API, archives the
  old match, and retains seats. Owner-requested practice reset and restart completed.
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
  elimination, victory, desktop usability, and spectator/reconnection behavior.
- [ ] Publish owner-approved privacy/contact information for the actual host and
  personal character photos; no analytics or managed account provider is configured.
- [ ] Configure uptime/error alerts once hosting is chosen; the incident/recovery
  runbook is in OPERATIONS.md.

## Current verification

- Client lint and production build passed with the September 8 changes.
- 59 server tests passed in Debug and previously in Release, including automatic setup,
  immutable predraft pickups, legacy save continuation, and 60/20-second deadlines.
- All seven browser scenarios passed: four-player setup/rules/permissions, native
  launcher window resizing, live 60/20-second clocks and timeout synchronization, controller reset/profiles/help,
  perks/victory history, both new maps and voting, and published same-origin serving.
  Restart persistence covers ballots, selected maps, and predraft perk locations.
- Restored-layout screenshot review passed at 1920×1080 and 2560×1440. Native
  resizing tests cover all four actual launcher contexts, without viewport emulation.
- Normal launcher and four-window practice launcher startup checks passed; API,
  website, browser sessions, and owned-service cleanup were verified.
- Debug build and same-origin publish passed with zero warnings/errors. The live
  practice server locks its Release DLL, so final verification uses Debug without
  interrupting the owner's match.

## Next work

1. Four-player map/perk/timer/desktop playtesting using Play-Local-Crew.cmd or desktop browsers.
2. Owner-supplied character assets and original-board review.
3. Owner-selected hosting/domain, deployment, and hosted operational checks.

## Owner decisions still needed

- Exact dark-blue membership if any photo cells differ from the first-ring mapping.
- Final eight character names/JPEGs; playtest feedback on perk power and quantity.
- Feedback on the new 60/20-second timers and documented timeout policy.
- Hosting/domain, privacy/contact wording, and acceptance of the proposed backup retention.
