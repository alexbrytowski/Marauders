# Deploy Marauders on Railway

One service runs the React UI, API and SignalR hub together. The game stays in
memory and is saved to JSON after mutations. The owner chose this single-game
setup; no database service or import of local saves is needed. The eight optimized
character JPEGs are public build assets; original full-size photos remain local.

## Railway settings

1. Connect this repository's `main` branch. Leave **Root Directory** blank.
   Railway detects the root `Dockerfile`. Remove any old custom build/start
   commands. In service Settings set **Healthcheck Path** to `/api/health`,
   timeout to 120 seconds, restart policy **On Failure** with 3 retries, and one
   replica. Use deployment overlap 0 seconds and draining 10 seconds.
2. Attach one persistent volume to Marauders with mount path **`/data`**.
   Keep one replica, serverless/sleep disabled, and preview environments disabled.
   Deployments with a volume briefly stop the old server before starting the new
   one. Do not run another server against that volume.
3. Set these service variables. Keep the reset password in Railway secrets and
   your password manager; do not paste it into source control.

   | Variable | Value |
   | --- | --- |
   | `Game__ResetPassword` | Your stable unique password, at least 12 characters |
   | `Game__TrustForwardedHeaders` | `true` |
   | `ASPNETCORE_ENVIRONMENT` | `Production` |
   | `Game__DataDirectory` | `/data` |
   | `PORT` | `8080` |

   The container already defaults to Production and `/data`. `PORT` may instead
   be supplied by Railway; the app binds to its value on all interfaces.
   `ASPNETCORE_URLS=http://0.0.0.0:8080` is optional and is superseded by `PORT`
   when present. These are internal listening addresses, not your public URL.
   Timer overrides are optional: `Game__TurnSeconds=135`, `Game__ActionSeconds=45`.

4. Verify the workspace spending shutdown limit and alert match your budget.
   Do not add paid services or raise the limit as part of troubleshooting.
5. Deploy the commit containing the Dockerfile and portraits. Generate a Railway
   public domain targeting **8080** (or your chosen `PORT`) after it is healthy.
   Use that HTTPS hostname for every player's browser.

Railway mounts its volume as root. The container entrypoint prepares `/data`,
then drops to the .NET image's `app` user before running the server. Leave the
runtime user override unset. All HTTP traffic must reach the container through
Railway's HTTPS proxy because forwarded-header trust is explicitly enabled.
The provider's internal `/api/health` HTTP probe is exempt from HTTPS redirects.

## Check the deployment

- `/api/health` returns 200; the main page loads all eight portraits.
- Four separate browser profiles can join; spectators cannot act. All show Live.
- Reset from a spectator's Game controller using your saved password. The prior
  game is archived and all browsers update.
- Redeploy between games and verify the game and browser seats survive. Timers
  continue across downtime; deployments do not pause a match.

A fresh empty volume starts a fresh lobby. Subsequent deploys retain
`game-state-v2.json`, `keys/` and `backups/` in `/data`. A reset archives the prior
save before replacing it. Do not delete or recreate the volume during an update.
For backup/restore and a corrupt-save recovery, see [OPERATIONS.md](OPERATIONS.md).

## Local and CI verification

Build the client, then publish with `-p:RequireReleaseAssets=true`. This fails if
the UI or any required portrait is absent. The Docker build runs both builds and
uses an allowlist that excludes local saves, keys, secrets, originals and tools.

The browser suite includes a published **Production** server behind a loopback
HTTPS proxy with seven isolated browsers, portrait reads, secure cookies,
WebSockets, reset and restart persistence. Its temporary test certificate is
generated with OpenSSL (Git for Windows supplies it on Windows).

CI also builds the Linux container and runs `node tools/verify-container.mjs` to
verify its non-root server, volume permissions, portraits and persistent browser
seat across restart. Docker is required for that check. A local .NET publish is
not a substitute for the Linux container check or a live Railway rehearsal.

Provider references: [Docker builds](https://docs.railway.com/builds/dockerfiles),
[variables](https://docs.railway.com/variables),
[volumes](https://docs.railway.com/volumes), and
[health checks](https://docs.railway.com/deployments/healthchecks).

The service settings above are explicit because Railway has
[deprecated legacy configuration](https://docs.railway.com/infrastructure-as-code)
for new services. The Dockerfile is still detected automatically; this setup does
not depend on legacy `railway.json` files.
