# Single-game operations

This private friends-and-family game uses one server process and one JSON save.
Do not run two servers against the same data directory. Keep a persistent writable
directory across updates; no database or account provider is required for this scope.

## Passwords and reset

The reset secret is `Game__ResetPassword` in the server process environment, with
12–1024 characters. Never put its value in source, `appsettings.json`, a command
checked into Git, screenshots, or issue reports. `.env` and `.env.*` are ignored,
but are not automatically loaded. The checked-in `.env.example` contains no secret.
For a hosted instance, configure it in the hosting provider's secret settings.

The Windows launcher generates a fresh random password for the run when no
environment value is configured. It shows that generated password only in the
local launcher terminal. It never prints an environment-supplied password, writes
the secret to the game save, or sends it to spectators. Keep the launcher terminal
private. Restarting without a configured password generates a new one.

Open **Game controller**, enter the password, choose whether to release seats,
review the operation, and confirm. The controller is reachable from a battle dialog
as well as the main navigation. It works for spectators, so a lost host browser
cannot lock the game. A changing game invalidates an old review: review and confirm
again against the latest state. Reset attempts are limited to five per IP per minute.

Every successful reset archives the previous private save under `data/backups/`
before atomically replacing it. If archiving fails, reset fails and preserves the
current game. Browser signing keys stay in place. Releasing seats removes their
private seat bindings from the current game, allowing everyone to join again.

## Backup and retention

Back up the entire configured data directory: `game-state-v2.json`, `keys/`, and
any reset archives. The save contains private browser-seat bindings; the keys keep
existing browser cookies usable after a restore. Protect backups like the live
directory. Personal profiles/photos are separate and need their own backup.

For a consistent manual backup, stop the launcher/server, copy the directory to a
dated folder outside the deployment directory, then restart. Verify that the copy
contains a parseable schema-version-2 save and the signing-key directory. Store at
least one copy on a different disk or protected backup service.

Suggested retention for the private game: keep the last seven play-session backups
and the last three pre-reset archives. This is a proposed policy for owner review;
nothing deletes backups automatically. Review growth and remove only deliberately
chosen older copies after confirming a newer backup can be restored.

## Restore and rollback

1. Stop the server. Preserve the current data directory as a separate dated backup.
2. Restore the chosen `game-state-v2.json` and its matching `keys/` together into
   the configured data directory. When restoring a pre-reset archive on the same
   installation, copy it as `game-state-v2.json` and retain that installation's keys.
3. Use the application version matching the saved board/schema. Do not overwrite
   the original `game-state.json`; it belongs to the older prototype.
4. Start one server, confirm `/api/health` returns 200, and refresh every player's
   browser. Check captain names, seats, ports, ships, perks, and history. Refreshing
   is required after a restore because clients reject older revision updates.
5. If verification fails, stop the server and restore the preserved pre-restore
   directory and previous application build. Keep the failed restore for diagnosis.

New history and perk fields are additive. Old saves start with empty history and
no pickups. Existing games can finish; a fresh game generates the new perk layout.

## Health and incident response

Use `/api/health` for process readiness and `/api/game` for a readable current state.
Check the process logs for failed disk writes, invalid saves, repeated disconnects,
or unexpected shutdowns. Do not enable request-body logging on the reset endpoint.
If persistence fails, check free disk space and directory permissions before retrying.
Do not delete a save to hide a load error; preserve it and restore a verified backup.

For frozen play, first let clocks resolve an overdue round. Reconnect a browser to
rule out a stale connection. If the state is unusable, use the password controller
to archive it and start a fresh voyage. Record the captain-log events and application
version needed to reproduce the issue, without publishing private saves or passwords.

Once a host is chosen, configure managed HTTPS, persistent storage, WebSocket
support, a single application instance, uptime/error alerts, and provider-managed
secrets. Keep deployment URLs/secrets out of Git. Provider-specific deployment and
alert setup remain pending; no external resources have been created.
