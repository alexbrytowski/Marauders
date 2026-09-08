# Marauders implementation status

Updated 2026-09-07 against [GAME_RULES.md](GAME_RULES.md). This is a playable local
prototype; it is not yet ready for public hosting. See [decisions](DECISIONS.md)
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
- [x] Owners place two ships per owned port in empty dark-blue cells before play.
- [x] Responsive desktop/phone layouts, keyboard map navigation, accessible labels,
  native modal focus containment, and reduced-motion styles.
- [~] Wider mobile/touch and screen-reader playtesting. Desktop and 390px layouts
  have automated screenshots/overflow checks; real-device testing remains.
- [x] Replace prototype text encoding artifacts and default Vite page metadata.
- [ ] Final character names/artwork when provided by the game owner.
- [ ] Implement balanced perks after their exact wording is decided. Perks remain
  disabled in the initial build, per GAME_RULES.md.

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
- [ ] Replace local JSON storage with a database-backed match model and migrations.
- [ ] Add multiple matches with lobby codes and match-scoped SignalR groups.
- [ ] Add managed account authentication and account/seat recovery before launch.
- [ ] Add database backup/retention/restore procedures and audit deployment secrets.

## Before public launch

- [ ] Choose hosting provider/domain and deploy staging behind managed HTTPS with a
  database and WebSocket support. No external deployment has been performed.
- [ ] Add provider-specific deployment pipeline, migrations, rollback procedure,
  and secret management.
- [ ] Complete four-player playtests for timeout, simultaneous encounters, captures,
  elimination, victory, mobile play, and spectator/reconnection behavior.
- [ ] Publish privacy/contact information matched to final authentication/analytics.
- [ ] Configure uptime/error monitoring and an incident/recovery runbook.

## Current verification

- Client lint and production build passed after final layout adjustments.
- 25 server tests passed in Release, zero warnings.
- Both end-to-end tests passed: the five-browser multiplayer scenario and a
  same-origin published-build smoke test. Final desktop/phone board and battle
  captures were inspected; fit/zoom and horizontal overflow checks passed.
- Release build and same-origin publish passed with zero warnings/errors.
- Debug build initially encountered the old running prototype's executable lock;
  Release builds/tests use a separate output directory.

## Next work

1. Database-backed matches, lobby codes, and room-scoped synchronization.
2. Managed authentication, real multiplayer playtesting, then staging/launch work.

The board/UI/rules milestone is a verified stopping point. The owner requested a
handoff here before the next major piece of work.

## Owner decisions still needed

- Exact dark-blue membership if any photo cells differ from the first-ring mapping.
- Final character roster and perk mechanics, especially Loaded Dice timing and
  Divine Intervention limits.
- Playtested timer durations and acceptance of the documented timeout policy.
- Hosting/domain, authentication provider, privacy expectations, and save retention.
