# Launch review — 2026-09-10

Scope: the current dirty working tree, React/TypeScript/Vite + ASP.NET Core 10 +
SignalR, one match, four captains and about three spectators. Joining is open by
the owner's explicit choice; an invitation gate is not a finding or requirement.
This is a launch-focused review, not a full security audit or hosted load test.
No live resets, deployments, or purchases were made. On 2026-09-10, the initial
resync, reset-secret startup validation, and explicit proxy opt-in were repaired
locally; hosted verification remains required.

## Findings, in priority order

### P1 — A transient initial state-read failure can strand a healthy connection

In `client/src/useGame.ts:69`, `hub.start()` succeeds before `resync()`. If that
HTTP read fails, the catch schedules the entire connect routine again without
stopping the connected hub. Each retry then fails at `hub.start()` and never
reaches another state read. The page stays unusable until refresh or another
connection lifecycle event. This matters during deploys and brief network errors.

Reproduced against the published app with one aborted `/api/game` request:
after three connect attempts there was still only one state request, the page
reported an already-connected-hub error, and the API health endpoint returned
200. Separately, the reconnect handler at line 48 marks Live before resync and
only displays errors on resync failure; it needs retry coverage too.

Fix connection establishment and state synchronization as separate retryable
steps. Verify initial and reconnect read failures recover without refresh or a
new game mutation. Do not label an unsynchronized client Live.

### P1 — Hosting can start successfully with the reset controller disabled

`server/Program.cs:11` accepts a null reset password; `GameStateStore.cs:73`
then returns 503 for reset. `/api/session` advertises `canReset: false`. This is
intentional local behavior but incompatible with the owner's hosted reset
requirement. The Windows launcher supplies a generated password; the published
server does not. A successful build/health check does not establish reset access.

Use one stable random token in `Game__ResetPassword`, with the owner's matching
copy stored locally or in a password manager. No admin accounts are needed.
The existing endpoint accepts 12–1024 characters; a randomly generated 32-byte
token encoded as hex is ample and within that limit. Do not commit, log, or
embed the token in client code. Make missing configuration fail hosted release
validation, then test password reset from a new spectator browser after redeploy.

Reset already checks the secret with a constant-time digest comparison, checks
game/revision, serializes writes, archives before replacing state, and broadcasts
the result. Both seat modes and failure cases have existing tests. Reset is not
disaster recovery: a corrupt save can stop server startup, and a full/unwritable
disk deliberately prevents reset. Provider-console recovery and backups remain
necessary; never make a failed reset silently discard the current game.

### P1 — Production reverse-proxy behavior has not been configured or tested

`server/Program.cs:47` enables forwarded headers but configures no provider proxy
addresses/networks. .NET defaults trust loopback; a non-loopback host proxy needs
explicit handling. Ignoring forwarded scheme/client IP can break HTTPS handling
and pool reset attempts under the proxy's IP. Do not fix this by accepting arbitrary
forwarded headers from the public internet. See Microsoft's
[proxy configuration guidance](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0).

`client/e2e/multiplayer.spec.ts:493` runs even the published-app scenario in
Development. Add a Production HTTPS/proxy smoke test for cookies, WebSocket
negotiation, redirects, correct client IP, and reset throttling once a host is chosen.

### P2 — A green clean-checkout build does not guarantee the actual portraits

`.gitignore` excludes both the original images and optimized web copies.
`server/Marauders.Server.csproj` publishes installed portraits, but CI has no step
that supplies them. The browser tests intentionally accept named fallbacks when
private files are absent (`client/e2e/multiplayer.spec.ts:589` and `:1778`). Thus a
green Git-based deployment can ship without all eight pictures. The client bundle
is also included conditionally, so bare `dotnet publish` is not a release pipeline.

Use a private asset input or private prebuilt container/artifact, keep originals
out of source, and fail release validation unless the client and eight expected
JPEGs exist and load. Review the build context so saves/secrets/local tools cannot
accidentally enter an uploaded image.

## Storage, scale, and intentional tradeoffs

- `GameStateStore` is a singleton with a process-local semaphore and one in-memory
  match. Do not run replicas or overlapping deployments: a shared disk/database
  alone does not synchronize separate process caches, timers, or hub audiences.
- Set `Game__DataDirectory` to persistent storage and preserve signing keys as
  well as state. Losing keys strands existing browser seats; reset archives on
  the same disk are not an off-host backup. Do not expose this directory as static
  content. A domain change also changes which browser cookies are sent.
- AGENTS.md requires database storage before public release, whereas the earlier
  private-game decision retained JSON. Resolve this explicitly before hosting.
  My low-cost proposal is single-instance SQLite on the persistent disk, retaining
  the store's atomic rule boundary, with tested import/backup/restore. SQLite is
  suitable for application-server-local storage; it need not add a separate paid
  database server. This is a recommendation, not an approved migration.
  [SQLite usage guidance](https://www.sqlite.org/whentouse.html).
- Signed browser sessions enforce whose turn/ships can be controlled, not who may
  visit. Anyone can obtain a session, watch the game/photos, or claim an open seat.
  This is now intended. Four seats are enforced; spectators are not capped at three.
- Timers continue when viewers leave; saved deadlines are not paused by server
  downtime. Deploy between matches and test what players see after an interruption.
- History/events grow throughout a match; the timer clones the whole save every
  second and mutations broadcast the whole public state. This is a sizing risk to
  measure in a long-match soak, not evidence that seven viewers require a rewrite.

## Hosting options

Prices checked 2026-09-10, USD/month before taxes, domain registration, optional
backup services, and excess usage. Estimates assume one small service. They are
not measured workload costs or availability guarantees.

| Option | Starting cost | Fit for this game |
| --- | --- | --- |
| **Railway Hobby — recommended for the owner's cost ceiling** | **$5 minimum**, including $5 of resource usage; budget roughly **$5–10 initially**, then measure | Docker deployment, persistent volume, WebSockets, and a configurable usage shutdown limit. The $5 plan price itself is not a cap. [Pricing](https://railway.com/pricing), [network support](https://docs.railway.com/networking/public-networking/specs-and-limits), [volumes](https://docs.railway.com/volumes/reference). |
| **Render paid web service — secondary** | $7 compute + $0.25 for 1 GB disk = **$7.25 baseline**, not a ceiling, on the free Hobby workspace plan | Docker runs .NET and built React together. Fixed compute, but bandwidth overages remain billable. Validate 512 MB with a long match. [Pricing](https://render.com/pricing), [Docker](https://render.com/docs/docker), [egress billing](https://render.com/docs/outbound-bandwidth). |
| **Vercel** | Frontend hosting alone does not price the complete game | Good static React hosting, but splitting the UI/backend adds a service and cookie/proxy configuration. Current Functions have WebSocket beta support, yet connections expire and durable state must be external. This is not a drop-in home for our singleton store/timer. [WebSocket lifecycle/state](https://vercel.com/docs/functions/websockets), [runtime filesystem](https://vercel.com/docs/functions/runtimes). |

Recommendation is based on stack fit and simplicity, not a claim that one provider
has demonstrated better uptime for this app. Use a nearby region, one always-on
instance, same-origin HTTPS, a persistent disk, and an off-host backup. A provider
hostname is enough to start; a custom domain is optional.

### Avoiding surprise bills

The owner's follow-up makes cost enforcement decisive. Railway documents a
compute hard limit that stops workloads, covering CPU, memory, storage, and
egress; its hosting AI-agent usage has a separate limit. Propose $10 compute
shutdown and a $5 alert, with no paid agent use. Verify the configured workspace
before deployment. [Railway cost controls](https://docs.railway.com/pricing/cost-control).
The documented minimum hard limit is $10.
[Minimum and resource limits](https://docs.railway.com/guides/right-size-cpu-memory).

This is a usage safeguard, not a promise that every invoice line including taxes,
domains, subscriptions, or optional third-party services is capped at exactly $10.
Confirm included-usage accounting and current terms in the actual account; do not
claim cent-exact enforcement latency without evidence. No host or cap is configured.
The game, including in-app reset, is unavailable after a budget shutdown. Never
increase the limit automatically; use provider-console recovery and backups.

Render documents a build-pipeline spending limit, but that is not an all-services
budget cap. Its paid accounts are billed for excess outbound traffic. That makes
it less suitable for this owner's main concern, despite its predictable compute
price. [Pipeline limit](https://render.com/docs/build-pipeline),
[bandwidth charges](https://render.com/docs/outbound-bandwidth).

Keep one replica, disable automatic preview deployments, set measured CPU/RAM
limits, and add no paid services without approval. These supplement the hard
usage stop; they do not replace it.

Render supports long-lived WebSockets, but a service with a persistent disk has
brief downtime during deployment. Railway volumes also impose redeploy downtime.
Neither option is highly available with one instance. Our reconnect/recovery
checks are consequently release work, not optional polish.
[Render WebSockets](https://render.com/docs/websocket),
[Render disk constraints](https://render.com/docs/disks),
[Railway volume constraints](https://docs.railway.com/volumes/reference).

Do not use Render's free web-service tier for this stateful release: it sleeps
after idle periods and cannot attach a persistent disk.
[Free-service limits](https://render.com/docs/free).

## Verification and limits

- Release build: zero warnings/errors; all 133 server tests pass.
- Client lint/build and same-origin Release publish pass.
- npm audit including development dependencies and NuGet transitive audit report
  no known vulnerabilities from their current feeds, not a security guarantee.
- A separate isolated seven-browser smoke passed: four distinct captains, three
  spectators, seven Live connections, and all three spectator mutations rejected.
  It also confirmed anonymous state/portrait reads return 200, as intended.
- Fault injection reproduced the initial-resync bug above against published code.
  Probe retained under ignored `artifacts/launch-review-probe.mjs`; it uses a fresh
  temporary save and isolated port 5138, never the user's game data.
- All 13 browser regression scenarios pass in Release (4.6 minutes), including
  password-controller/reset synchronization and published same-origin serving.
  Evidence is under ignored `artifacts/launch-review-e2e/`. The reproduced
  fault-injection bug is outside the current regression coverage.
- Remote CI, Linux container execution, Production HTTPS/proxy behavior, hosted
  resource usage, and recovery on the chosen provider are not yet verified.

## Cleanup completed

Replaced the feature-history task list with release gates, preserved its contents
in IMPLEMENTATION_HISTORY.md, and corrected misleading practice-launcher resume
wording. No gameplay refactor was performed. Existing uncommitted code, original
assets, and saves were preserved. Follow-up implementation is tracked in TASKLIST.md.
