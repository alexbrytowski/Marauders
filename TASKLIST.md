# Marauders implementation status

Updated 2026-09-10 against [GAME_RULES.md](GAME_RULES.md), the owner's overnight notes, and earlier notes in
[9-8-26.md](9-8-26.md) and [Thoughts.txt](Thoughts.txt). Scope is one private game for friends, retaining server
state and JSON persistence. See [decisions](DECISIONS.md)
and [board mapping notes](BOARD_MAPPING.md) for explicit interpretations.

Legend: `[x]` implemented and locally verified; `[~]` partial or needs wider
verification; `[ ]` not done. CI configuration is present but has not run remotely.

## Board and player experience

- [x] September 10 handbook: eight chapters from basic pieces to advanced rules,
  direct links and previous/next navigation, actual Classic terrain and shared
  ship/port/dice artwork, interactive draft/movement/battle/port/build/perk/whirlpool
  examples, and keyboard-accessible controls. Desktop and narrow layouts reviewed.
- [x] Every captain readies in the lobby; the fourth ready draws the map and
  starts the draft automatically. Public persisted first captain and ready states,
  undo ready, vote/crew/order invalidation, concurrent clicks, spectator rejection,
  restart restoration, and reset clearing. Server and full multi-browser checks pass.

- [x] September 10: confirmed forfeit/leave in the lobby, draft, and play,
  including from a battle. Remove the captain's ports, fleet, perks, and builds;
  release their browser identity, skip their picks/turns, and handle final victory.
- [x] Replace Architect with Mouth to Feed (+1 fleet capacity per holder anywhere
  at sea), migrate saved perks, and raise Black Pearl recruitment to exactly 10%.
- [x] Port construction badges and hover/focus details list ships and remaining
  owner rounds. Ship hover/focus displays the carried perk and effect.
- [x] The Choke replaces The Narrows: two broad seas and one three-hex crossing,
  with ports on both banks. Serpent's Coil replaces the third map with a winding
  inner approach and an eastern shortcut. Preserve v2/v3 terrain for existing saves.
- [x] September 10 map review: arrange The Choke's bay ports in circles, including
  inner shores and north/south ends. Add a two-hex-wide northern shortcut near
  Serpent's Heart, keeping the eastern breach and winding route. Fresh drafts use v4.
- [x] Whirlpools: one 5% server check after each captain turn, empty open-water
  endpoints at least ten hexes apart, one pair lasting two full captain cycles.
  Teleport for one movement; stop charting, retain movement, check exit combat,
  block occupied exits, synchronize appearance/expiry, and persist the lifetime.
- [x] Fix the supplied PNG's duplicate choices: equivalent forces/support form
  one battle. Keep choices when assistance differs; resume older duplicate saves.
- [ ] Owner handles the old Marauders video and personal photos; install the
  approved assets when supplied.

- [x] September 9 Classic playtest: replace the unused dice faces with an explicit
  text count; show actual movement results separately for every viewer.
- [x] Cycle cosmetic movement/combat dice for 1.3 seconds, then reveal the server
  result and log together. Disable actions during the reveal, retain newer server
  updates, skip animation on initial load/refresh and with reduced motion.
- [x] Public battle close-up with large ship numbers at their real hexes, trigger/
  helper labels, keyboard-selectable casualty tokens, and a loss confirmation.
  Retain lost/recruited participants on the map and in saved battle snapshots.
- [x] Automatically resolve a sole eligible casualty on the server, including
  recruitment and perk drops. Resume older pending sole-casualty saves once.
- [x] Display every reachable port attack in the command deck without selecting a
  board ship. Show trigger choices, helpers, and unused-action requirements.
- [x] Hide lottery details after drafting. Preserve the map name on the chart and
  the selection event in the public log.
- [x] Fit the chart and normal controls together across desktop resolutions;
  center the fitted map and zoom from its actual size in 25% steps, keeping the
  viewed center. Keep corner cards and personal tabs.
- [x] Enlarge ship/token numbers and experiment with large port numbers on nearby
  nonplayable land, linked to the actual port. Original board/photo untouched.

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
- [x] Three playable maps: the unchanged original named Classic, The Choke,
  and Serpent's Coil. Lobby votes become tickets in a server-drawn lottery;
  no votes gives each map equal odds. Previews, odds, selection, and saved map
  identity synchronize across browsers. Designs and checks are in MAPS.md.
- [~] Four-player balance playtesting for the new maps and their draft strategies.
- [x] September 9 geography pass: replace alternate-map symmetry and repeated
  islands with uneven coastlines, varied harbor exposure, unequal crossings, and
  local port clusters. These v2 layouts are preserved for legacy saves; the
  September 10 concepts and v4 refinements supersede them for new games. See MAPS.md.
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
- [x] Implement ship-held perks: Black Pearl conversion at 10%, Glass Cannon 0–8,
  Loaded Dice 1/2 → 3, and Mouth to Feed +1 population. One perk per ship, no fleet limit.
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
  after final-port loss, and declares victory at every remaining port. Further play stops.
- [x] Construction obeys fleet plus in-progress population cap, stays at its chosen
  port, completes after two future owner rounds, and cannot move on launch turn.
- [x] Spawning prefers empty owning-harbor cells, then nearest reachable open sea.
- [x] Zero-ship captains enter construction; eliminated captains are skipped.
- [x] Separate configurable round/action clocks, visible countdowns, immediate
  deadline validation, and normal construction completion on timeout.
- [~] Playtest timer lengths and timeout casualty policy. Owner-approved defaults
  are now 90/30 seconds in both launchers; the four-window practice override is
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

- September 10 handbook/readiness: client lint/build, Debug solution build,
  all 100 server tests, and all 11 browser scenarios pass. Same-origin publish
  succeeds. New coverage verifies four-captain readiness, undo, simultaneous final
  clicks, authenticated identity, stale setup rejection, public first captain,
  map vote invalidation, cross-tab/restart restoration, one automatic draft,
  automatic fleets, and rematch clearing. Legacy lobbies load unready.
  Guide coverage exercises all eight chapters, deep links/history/refresh,
  keyboard map inspection, shared movement, helper loss, ties, port capture,
  construction, perks, and whirlpools without mutating the live game. Guide and
  lobby screenshots reviewed at desktop and narrow sizes; previews retained in
  ignored artifacts/handbook-ready-2026-09-10. Existing working-tree changes and
  the original board JPEG were preserved.

- September 10 map review: the v4 map build passes client lint/build, Debug
  solution build, and all 95 server tests. Both revised layouts pass the
  five-browser map scenario: voting, drafting, launch, sailing, synchronization,
  restart persistence, and loading all four v2/v3 legacy layouts. The source
  browser run encountered concurrent guided-rules/readiness work importing an
  unfinished HowToPlayPage module. Map verification therefore used a snapshot
  of the just-tested client/server build, served together on isolated port 5136.
  Snapshot, test output, and screenshots are in ignored artifacts/map-review/;
  the passing log is artifacts/map-review-e2e.log. Both labeled v4 map previews
  and actual browser boards were visually reviewed. Publish and its same-origin
  smoke check also pass; combined-source verification belongs to the ongoing
  guided-rules/readiness change. Existing matches and live services were untouched.

- September 10 overnight changes: client lint/build, Debug solution build, and
  all 90 server tests pass. Same-origin publish succeeds without warnings.
  The new five-browser scenario verifies hover details, population display,
  whirlpool travel/expiry/restart, equivalent battles, cancel/stale confirmation,
  spectator rejection, seat release, active-turn skipping, and forfeit victory.
  Both new maps pass setup/sailing/restart checks; five browsers also load each
  legacy v2 layout and its perks correctly. The full browser pass found a
  1366x768 controls overflow; reduced navigation spacing fixed it. Targeted
  reruns pass at 1366x768, 1536x864, 1920x1080, and 2560x1440. Screenshots of
  the maps, hover inspection, and shared battle were reviewed. Nine browser
  scenarios are covered across the regression pass and targeted reruns; logs
  and previews remain under ignored artifacts/ and client/test-results/.
  Fresh launchers load the revised rules; existing saves retain their map version.
  Four-player balance playtesting of the new geography and perks remains open.

- September 9 Classic playtest follow-up: client lint/build and 66 server tests
  pass. The new five-browser scenario verifies shared roll presentation, reduced
  motion, map-based casualty selection/permissions, and port attacks without a
  board selection. Fitted map/controls and proportional zoom pass at 1366x768,
  1536x864, 1920x1080, and 2560x1440; board and battle screenshots reviewed.
  All eight browser scenarios pass, including native launcher resizing, live
  90/30-second timeout synchronization, saved automatic casualties, controller
  reset, perks, both alternate maps, and same-origin published serving. The map
  sailing test now waits for the visible roll reveal before choosing a destination.
  Debug build and same-origin publish pass with zero warnings/errors. Review
  screenshots are saved under the ignored artifacts/playtest-2026-09-09 directory.

- September 9 local startup recovery: the owner confirmed the incompatible
  Shattered Isles v1 draft was unused test data. Archived that practice save,
  returned to a fresh lobby, and rebound all four practice browser seats.
  The crew launcher startup check, client lint/build, and 62 Release server tests
  pass. The original archive remains under the ignored practice data backups.
- September 9 map revision: 62 server tests pass, including all-water and harbor
  connectivity, two independent Narrows crossings, automatic fleets, perks, and
  saved v2 identity. Client lint and production build pass. PNG previews were
  rendered from the playable JSON and visually reviewed. The five-browser map
  scenario passed for both v2 layouts, including setup, sailing, synchronization,
  and restart persistence (Debug build; EventLog disabled in the test process).
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
- Feedback on the new 90/30-second timers, larger port labels, and documented timeout policy.
- Hosting/domain, privacy/contact wording, and acceptance of the proposed backup retention.
