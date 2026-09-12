# Marauders launch checklist

Updated 2026-09-12. Target: one game, four captains plus approximately three
spectators, desktop-first. Joining is open; the owner explicitly declined an
invitation gate. Reset stays password-protected. No hard spectator cap is
implemented or required by this planning assumption.

Completed feature history is in [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md).
See [LAUNCH_REVIEW.md](LAUNCH_REVIEW.md) for findings and hosting options,
[DECISIONS.md](DECISIONS.md) for scope, and [OPERATIONS.md](OPERATIONS.md) for recovery.

Legend: `[x]` verified locally; `[ ]` still required. A passing local check does
not certify the hosted environment. The owner has started Railway setup;
provider settings and a live deployment have not been verified by the agent.

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
- [ ] Run a full hosted match with four players and three spectators: draft,
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

- [x] Black and White perk: five-perk layouts on every map, server-side 50/50
  resolution, port and helper behavior, persistence, dedicated public UI, and
  five-browser synchronization are covered by server and browser regressions.
- [x] Combat handbook includes the supplied one-exchange and cumulative encounter
  probability tables, with desktop and narrow-screen browser verification.
- [x] Solution build: zero warnings/errors; all 138 server tests pass.
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
- [x] All 15 browser regressions pass (5.4 minutes), including Black and White
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
