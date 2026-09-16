# Marauders launch checklist

Updated 2026-09-15. Target: one game, four captains plus approximately three
spectators, desktop-first. Joining is open; the owner explicitly declined an
invitation gate. Reset stays password-protected. No hard spectator cap is
implemented or required by this planning assumption.

Completed feature history is in [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md).
See [LAUNCH_REVIEW.md](LAUNCH_REVIEW.md) for findings and hosting options,
[DECISIONS.md](DECISIONS.md) for scope, and [OPERATIONS.md](OPERATIONS.md) for recovery.

Legend: `[x]` verified locally; `[ ]` still required. A passing local check does
not certify the hosted environment. The owner has started Railway setup;
provider settings and a live deployment have not been verified by the agent.

## September 15: round-33 Kraken

- [x] Spawn a stationary, server-randomized Kraken from round 33 in port-safe
  ordinary water, with a one-round warning at round 32, a pink tentacle marker,
  and a red two-hex reach that disappears on death.
- [x] Add server-authoritative three-die, three-life Kraken combat with persistent
  damage, normal fleet helpers/casualties/perk interactions, timeout recovery,
  and no possible port support.
- [x] Drop the reusable seventh perk on death and make its carrier contribute
  three dice to every battle and suppress Black and White for the entire exchange
  when it participates on either side. Reveal its name/effect in live game details
  while keeping the reward secret in How to Play.
- [x] Add the consolidated round-progression handbook chapter, server unit
  coverage, multiplayer synchronization coverage, and full verification. Client
  lint/build, Debug tests (205), Release build, and the focused five-browser
  warning/spawn/combat/death/reward synchronization and visual regression pass.

## September 15: Serpent's Coil passages

- [x] Apply the owner's marked terrain plan to Serpent's Coil: add two-hex-wide
  northern and lower-western passages plus a one-hex-wide passage through the
  center barrier. Preserve v7 terrain for games already in progress and cover
  the exact ten changed hexes and save compatibility with automated tests.

## September 15: geographically balanced random ports

- [x] Replace the unconstrained starting-port shuffle with a server-authoritative
  fair-band draw based on actual sailing distance. Exclude the strongest
  three-port clusters while retaining a broad pool of varied layouts; align the
  rules and lobby wording and cover all three maps with deterministic tests.
  Thirty seeded draws per map retain at least 25 distinct results. Client lint
  and build, Debug tests (196), Release build, and the focused five-browser
  setup/synchronization/persistence regression pass.

## September 15: round-85 action surge

- [x] Starting in round 85, increase server-authoritative action dice from one
  per three ships to one per two ships, rounding up. Keep the earlier rate
  through round 84 and align fleet previews, rules, and handbook wording.
- [x] Show a twelve-round public warning beginning at round 73, with a shared
  countdown plus captain-log entries for the warning and round-85 activation.
  Focused four-browser synchronization, client lint/build, Debug and Release
  solution builds, and all 208 server tests pass.
- [x] Add a Development-only local-crew launcher that starts fresh practice
  matches at round 84 so the old and new action rates can be compared directly.

## September 15: round-50 whirlpool surge

- [x] Increase the server-authoritative whirlpool spawn chance from 10% to 25%
  starting when round 50 completes. Preserve the original rate through round 49,
  existing-pair behavior, and pair lifetime; align the rules and handbook.
- [x] Show a four-round public warning beginning at round 46, with a shared
  countdown plus captain-log entries for the warning and round-50 activation.
  Focused four-browser synchronization and visual checks pass; client lint/build,
  Debug/Release solution builds, and all 190 server tests pass.

## September 15: endgame construction pacing

- [x] Starting in round 66, make new manual, automatic, and timeout-started
  construction take three future owner rounds. Preserve the stored countdown of
  every build already underway.
- [x] Show an eight-round public warning beginning at round 58, log the warning
  and activation, and align the rules and handbook wording. Focused four-browser
  synchronization and visual checks pass; client lint/build, solution build,
  and all 184 server tests pass.
- [x] Add a Development-only local-crew launcher that starts fresh practice
  matches at round 50 for quickly rehearsing the round-58 warning and round-66
  construction slowdown without touching the main local save.

## September 15: Black Pearl balance

- [x] Replace the Black Pearl's 10% recruitment chance with an exact 1-in-6
  check, and keep the server rule, automated coverage, perk card, and handbook
  wording aligned.

## September 14: alternate-map port balance

- [x] Keep Southgate and Fang Harbor out of the middle, but restore both alternate
  maps to 13 evenly distributed ports. Add Dusk Harbor to The Choke's western
  outer ring and Gull's Rest to Serpent's Coil's northwestern outer ring. Keep
  Northgate and Serpent's Heart neutral because they are nearest each map's center.
- [x] Verify v7 map connectivity, automatic fleet and perk setup, client
  lint/build, all 180 server tests, and v2-v6 save compatibility.
- [ ] Rerun the focused five-browser map scenario after publishing.

## September 13: first full playthrough follow-up

- [x] Resolve battles caused by completed construction before starting the next
  captain's turn. Keep dice controls with a combatant, preserve the next turn's
  clock, and resume pending launch battles safely after restart. Timing and
  compatibility decisions are recorded in DECISIONS.md.
  Ten server regressions cover battle ownership, casualty choices, multiple
  encounters, timeouts, forfeits, old saves, and exactly-once construction.
  The five-browser reproduction passes, including restart and forged-roll
  rejection; the battle dialog was also visually checked.
- [x] Confirm early endings when unused action dice, movement, or unassigned
  builds remain. Owner-requested UI decision: list what is left, default to
  keeping the turn, and require a second click to continue. Completed actions
  need no confirmation; existing construction and timeout rules still apply.
  Dismiss an open confirmation when the authoritative game state changes.
  Verified both dialogs visually and in two five-browser regressions, including
  cancellation, same-seat updates, timeouts, and finishing with nothing left.
  Lint, client/solution builds, and all 175 server tests pass.
- [x] Double whirlpool spawn chance to 10% per completed captain turn.
- [x] Replace new-game drafting with three random ports per captain and two
  starting ships per owned port. Fix the neutral central port on each map.
- [x] Award one action die per three ships, rounding up; movement rolls are
  uniformly 4–6 and reveal immediately while combat keeps its animation.
- [x] Fix port assistance to use two-hex distance from its owner's triggering
  ship, including outside harbor water, with no helper chaining.
- [x] Add Cheat Death as the sixth pickup: consume on any losing participating
  exchange, show the rejected result, require a public reroll before
  consequences, and respawn in empty open water.
- [x] Forfeited ports remain neutral, retain usable harbors, reset their defense,
  and can be captured normally. Update rules, handbook, lobby, and forfeit copy.
- [x] Show each uncollected perk's name and effect on hover and keyboard focus.
  Visually verified all six hover explanations and keyboard focus in the
  existing five-browser scenario.
- [x] Server regressions: 175 passing tests; lint, client build, solution build,
  and Release publish pass. Dedicated five-browser regression covers port
  support, Cheat Death consumption/respawn, restart recovery, neutral capture,
  and spectator rejection.
- [x] All 18 browser regressions pass, including early-ending confirmation and
  construction battle handoff, after updating the old setup, forfeit,
  and movement-animation expectations. Reviewed battle and handbook screenshots;
  the focused five-browser flow also passes with the added pickup explanations.

## 1. Reliable reset and connection recovery — before launch

- [x] Existing reset supports password authorization from any browser, including
  spectators; keep-seat rematches or an empty lobby; stale-review rejection;
  and archiving before replacement. Covered by server and browser regressions.
- [x] Production startup rejects a missing reset secret instead of silently
  launching with reset disabled. Store a stable, strong
  `Game__ResetPassword` in provider secrets and the owner's private local file
  outside the repo (or password manager);
  verify it works after restart/redeploy. Never expose its value in build logs.
- [x] Initial state-refresh recovery now retries synchronization without trying
  to restart an already-live SignalR hub; browser fault injection verifies it
  returns Live. Post-reconnect failure coverage remains part of the hosted drill.
- [ ] Production startup now requires an explicit trusted-proxy opt-in and configures
  forwarded request headers for that approved proxy deployment. Verify
  HTTPS, secure cookies, WebSockets, and reset's real-client-IP rate limiting in
  Production; do not blindly trust arbitrary forwarded headers.
- [ ] Hosted reset drill: reset from a fresh spectator browser during a battle,
  confirm all seven viewers update, exercise both seat modes, reject an old reset
  review and incorrect password, restart, and verify the resulting lobby persists.
- [ ] Recovery drill: demonstrate reset failure preserves the game when backup or
  storage fails; document restoring service and a backup from the provider console
  if a corrupt save prevents startup (the in-app reset cannot fix a down server).

## 2. Choose and package the host

- [x] Owner selected Railway and started connecting the repository. Budget and
  usage-limit verification remain the separate gate below.
- [ ] Before any paid deployment, verify and record the correct workspace's hard
  usage limit and alert. Proposed: $10 compute hard limit (documented minimum),
  $5 alert; confirm the owner's amount and all bill components. Account separately
  for tax/domain/add-ons and hosting AI-agent usage. No paid agent usage, replica
  autoscaling, PR previews, or extra services. Never auto-raise the cap.
- [ ] Document spending-limit shutdown/recovery: the game and reset endpoint go
  offline at the limit. Restore through the provider only after owner approval
  or the billing-cycle reset; retain backups and verify how restart is performed.
- [x] Owner confirmed keeping one game with JSON storage and no database, and
  starting the hosted game fresh without local saves. Record this explicit
  exception to the earlier database prerequisite in DECISIONS.md.
- [x] Add Linux .NET 10 + Node 24 Docker build, same-origin UI/API/hub, runtime
  privilege drop, provider port binding and a context allowlist excluding saves,
  keys, secrets, original photos and tools. Release publish checks the client
  bundle and all eight portraits. Local publish passes; Linux container execution
  remains a CI check because Docker is unavailable on this workstation.
- [x] Owner approved the eight optimized character JPEGs as public build assets.
  Include them in Git and the release image; keep original full-size photos out.
- [x] Add DEPLOY.md with Railway variables, volume, health check and service
  settings. Use dashboard settings rather than deprecated railway.json files.
- [ ] Mount persistent writable storage for state, signing keys, and reset archives;
  keep it outside static files. Configure one process/replica, no scale-to-zero,
  and no overlapping writers during deployment. Keep staging data separate.
- [ ] Run remote CI on the exact release commit and retain a known-good artifact.
  Verify Production behind HTTPS; existing gameplay tests run in Development,
  including the old published-client scenario. A new Production HTTPS/proxy
  seven-browser regression now passes locally; remote Linux CI remains pending.

## 3. Release rehearsal and operations

- [ ] Choose a region near the players and a stable hostname. A provider hostname
  is sufficient initially; custom domain purchase is optional. Browser seats are
  hostname/browser-specific—plan any domain change before claiming real seats.
- [ ] Run a full hosted match with four players and three spectators: random setup,
  moves, public battles, timeout, forfeit, victory, reconnect, and controller reset.
  Include separate devices/networks and a long-match CPU/RAM/payload check; the
  local seven-browser smoke is not a capacity benchmark.
- [ ] Set up protected off-host backups of state and signing keys, and restore
  one into isolated staging. Approve retention and disk-space alerts. Reset
  archives on the same disk alone are not disaster recovery.
- [ ] Configure uptime/error/disk alerts in addition to the spending shutdown.
  Health currently proves the
  process responds, not that a new save or reset archive can be written.
- [ ] Verify rollback and planned restart with connected browsers. Deploy between
  games: persistent-disk services briefly stop, and stored turn deadlines do not
  pause during downtime or when everyone closes their browser.
- [ ] Record the owner's go/no-go after desktop/map/perk/timer playtesting and
  any desired contact wording. Public display of the optimized portraits was
  explicitly approved on September 11.

## Current review evidence

- [x] Black and White perk: six-perk layouts on every map, server-side 50/50
  resolution, port and helper behavior, persistence, dedicated public UI, and
  five-browser synchronization are covered by server and browser regressions.
- [x] Combat handbook includes the supplied one-exchange and cumulative encounter
  probability tables, with desktop and narrow-screen browser verification.
- [x] Solution build: zero warnings/errors; all 165 server tests pass.
- [x] Client lint and production build pass; same-origin Release publish succeeds.
- [x] Production HTTPS proxy regression passes: seven browsers, eight portrait
  reads, secure cookies, WebSockets, spectator rejection, reset synchronization,
  reset archive and game/browser-seat persistence across server restart.
- [x] npm audit (including development dependencies) and NuGet transitive package
  audit report no known vulnerabilities in their current feeds.
- [x] Isolated seven-browser smoke: four distinct captains, three spectators,
  all connections Live, all three spectator mutations rejected.
- [x] Fault injection reproduced the initial-resync failure, then regression
  coverage verified the repair returns Live after a retry. Review probe is
  retained under ignored `artifacts/launch-review-probe.mjs`.
- [x] All 16 browser regressions pass, including Cheat Death, Black and White
  synchronization/persistence, Production HTTPS with seven browsers, password
  reset, same-origin publish and initial-refresh fault injection. Current results
  are under ignored `client/test-results/`; the older launch-review evidence
  remains in artifacts.
- [x] Release asset validation rejects missing UI and missing portraits and passes
  with all eight JPEGs. Public JPEGs contain no EXIF metadata. Docker entrypoint
  and container-smoke script pass local syntax checks; Linux execution is pending CI.

## Deferred unless playtesting finds a blocker

- New gameplay features, extra matches, extra playable seats, matchmaking, managed
  visitor accounts, invitations, and a hard spectator cap.
- Large-scale infrastructure: multiple replicas, Redis/SignalR backplane, and
  managed realtime services. Seven viewers alone do not justify these.
- Major GameRules/UI refactors; mobile/touch expansion and wider screen-reader
  testing; old Marauders video installation; further balance/board-photo polish.
  Preserve all original board/character files and legacy map versions.
