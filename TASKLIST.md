# Marauders launch checklist

Updated 2026-09-10. Target: one game, four captains plus approximately three
spectators, desktop-first. Joining is open; the owner explicitly declined an
invitation gate. Reset stays password-protected. No hard spectator cap is
implemented or required by this planning assumption.

Completed feature history is in [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md).
See [LAUNCH_REVIEW.md](LAUNCH_REVIEW.md) for findings and hosting options,
[DECISIONS.md](DECISIONS.md) for scope, and [OPERATIONS.md](OPERATIONS.md) for recovery.

Legend: `[x]` verified locally; `[ ]` still required. A passing local check does
not certify the hosted environment. No hosting resources have been created.

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

- [ ] Owner selects provider/budget. Updated recommendation: Railway Hobby with
  its provider-enforced spending shutdown; Render is secondary because its fixed
  compute price still permits bandwidth overages. See the dated comparison.
- [ ] Before any paid deployment, verify and record the correct workspace's hard
  usage limit and alert. Proposed: $10 compute hard limit (documented minimum),
  $5 alert; confirm the owner's amount and all bill components. Account separately
  for tax/domain/add-ons and hosting AI-agent usage. No paid agent usage, replica
  autoscaling, PR previews, or extra services. Never auto-raise the cap.
- [ ] Document spending-limit shutdown/recovery: the game and reset endpoint go
  offline at the limit. Restore through the provider only after owner approval
  or the billing-cycle reset; retain backups and verify how restart is performed.
- [ ] Resolve storage scope before implementation: AGENTS.md requires a database
  for public release, while earlier private-game notes retain JSON. Proposed:
  single-instance SQLite on the same persistent disk; do not silently waive the
  requirement or migrate an existing save. Approve backup/migration/rollback first.
- [ ] Add a reproducible Linux .NET 10 + Node 24 build/container, same-origin UI/API/
  hub, non-root runtime, provider port binding, and a build-context allowlist that
  excludes saves, keys, secrets, original photos, and local tooling. Fail a release
  package if the client bundle or required portraits are missing.
- [ ] Arrange a private, repeatable way to supply all eight optimized portraits
  to release builds. They are Git-ignored; plain checkout-based CI only has named
  fallbacks. Never solve packaging by committing the original personal photos.
- [ ] Mount persistent writable storage for state, signing keys, and reset archives;
  keep it outside static files. Configure one process/replica, no scale-to-zero,
  and no overlapping writers during deployment. Keep staging data separate.
- [ ] Run remote CI on the exact release commit and retain a known-good artifact.
  Verify Production behind HTTPS; current browser tests run in Development,
  including the published-client scenario.

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
  confirm public display of supplied portraits plus any desired contact wording.

## Current review evidence

- [x] Release solution build: zero warnings/errors; all 133 server tests pass.
- [x] Client lint and production build pass; same-origin Release publish succeeds.
- [x] npm audit (including development dependencies) and NuGet transitive package
  audit report no known vulnerabilities in their current feeds.
- [x] Isolated seven-browser smoke: four distinct captains, three spectators,
  all connections Live, all three spectator mutations rejected.
- [x] Fault injection reproduced the initial-resync failure, then regression
  coverage verified the repair returns Live after a retry. Review probe is
  retained under ignored `artifacts/launch-review-probe.mjs`.
- [x] All 13 browser regression scenarios pass in Release (4.6 minutes), including
  password reset and same-origin publish. Evidence is under ignored
  `artifacts/launch-review-e2e/`. These do not cover the new fault-injection finding.

## Deferred unless playtesting finds a blocker

- New gameplay features, extra matches, extra playable seats, matchmaking, managed
  visitor accounts, invitations, and a hard spectator cap.
- Large-scale infrastructure: multiple replicas, Redis/SignalR backplane, and
  managed realtime services. Seven viewers alone do not justify these.
- Major GameRules/UI refactors; mobile/touch expansion and wider screen-reader
  testing; old Marauders video installation; further balance/board-photo polish.
  Preserve all original board/character files and legacy map versions.
