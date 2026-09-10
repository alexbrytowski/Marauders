# Implementation decisions

## 2026-09-10: guided rules and captain readiness

- The owner requested a short, paged rules guide with game visuals and practice
  examples. Teach board/goal, setup, movement, ship battles, port attacks,
  construction, perks, then whirlpools and other advanced rules. Examples are
  local teaching scenarios and never send game commands.
- Replace the host's start button with four explicit captain ready states. The
  fourth ready atomically draws the map and starts the untimed port draft. The
  host still selects the first captain, defaulting to the first seated captain;
  this selection is public and persisted. Spectators cannot ready or select.
- Captains may unready in the lobby. Changing a map vote clears that captain's
  ready state. Changing the first captain or the seated crew clears all ready
  states so everyone can review the new setup. A rematch clears readiness.
  Disconnecting does not release a seat or readiness; browser refresh and server
  restart restore them. Existing saves default to unready and the host first.
- Ready commands set an explicit boolean, never toggle. They use a persisted
  lobby setup version, rather than the whole game revision, so simultaneous ready
  clicks succeed but clicks from a previous setup or match are rejected. The old
  start-draft command cannot bypass readiness.

## 2026-09-10: map review refinements

- The owner approved The Choke's two bays and central crossing, and requested
  ports distributed around each bay. Arrange the five western and six eastern
  bay ports along an oval around their basin, including the inner shore and
  northern/southern ends. Keep both gate ports and the three-hex crossing.
- The owner found Serpent's Heart too sheltered. Add a two-hex-wide northern
  cut through the inner coil, opening a second approach close to the center.
  Keep the eastern outer breach and the longer winding route. This is ordinary
  sailable water, with normal movement, harbor, and combat rules.
- Save these layouts as v4, preserving v3 alongside v2 for existing matches.
  New drafts use the revised layouts. Four-player balance still needs playtesting.

## 2026-09-10: overnight playtest changes

- The owner's overnight notes supersede Architect and the 7.5% Pearl threshold.
  Mouth to Feed adds one population capacity per ship carrying it, anywhere at
  sea. Bonuses stack across holders and follow recruitment/ownership; losing one
  never deletes existing ships or cancels builds. Normal two-owner-round building
  applies everywhere. Saved Architect pickups/holders become Mouth to Feed.
  Black Pearl now recruits on exactly 100 of 1,000 outcomes (10%).
- Forfeit requires an explicit confirmation and a revision-checked authenticated
  command. During play/drafting, remove that captain's ships, held perks, builds,
  and owned ports; keep their identity in history but release their browser seat.
  Former port hexes remain impassable land; their surrounding water loses harbor
  bonuses. Skip the captain's remaining draft picks/turns. The last remaining
  captain wins even if a neutral port remains; otherwise victory requires all
  remaining ports. Lobby leave releases the seat/vote and transfers hosting.
  Leaving a finished match only releases the seat, preserving the result.
- Whirlpools: after each completed captain turn (including timeout/active forfeit),
  make one 5% server draw if no pair exists. Place two empty ordinary-water hexes
  at least ten hexes apart by hex distance, avoiding pickups as well as ships and
  harbors. One pair at most. A pair lasts two full cycles of the living captains:
  snapshot twice their count as remaining turns at spawn; never age it on its
  spawn boundary, and do not respawn on its expiry boundary. This supplies four
  independent opportunities per normal four-captain cycle, not a combined 20% roll.
  Entering costs one movement, teleports instantly, stops route charting, and
  retains unused movement. Resolve combat at the exit. An occupied exit blocks
  entry; teleport arrival does not bounce back. Ships can sail out normally.
  Construction never launches onto an active endpoint. Pair/timer persist.
- Replace The Narrows, renamed **The Choke** by the owner, with two broad basins and one central passage exactly
  three hexes wide, with a gate port on each bank. Replace the third layout with
  Serpent's Coil: a spiral peninsula dividing an outer ring from a winding inner
  approach and prize port. Preserve old alternate geometries for saved matches;
  new drafts receive the new versions. Classic and the source JPEG stay intact.
- The owner clarified the new PNG: landing ship 10 produced multiple choices for
  the same fight against ships 21/22. Collapse encounter options with identical
  teams, participating ships, and supporting ports. Distinct assistance remains
  a meaningful choice. Keep nonchaining assistance for the chosen trigger pair.
- Show construction badges and detailed port/ship hover inspection. The owner
  will handle both the old video and personal photos. The owner confirmed the
  forfeit, population, and two-full-cycle whirlpool interpretations above.

## 2026-09-09: Classic playtest follow-up

- The owner's Thoughts.txt supersedes the 60/20-second playtest clocks: use
  90 seconds per round and 30 per action (1.5 times longer). Explicit environment
  overrides and deadlines already saved in an ongoing round retain their values.
- When exactly one participating ship belongs to the losing side, the server
  immediately applies the normal casualty rule, including Black Pearl recruitment
  and perk drops. Multiple eligible ships still require the losing captain's choice.
  Keep the result visible until the active captain continues.
  A previously saved sole-casualty choice resumes on the next server timer tick;
  an already expired round still follows the existing timeout policy.
- Animate new public movement and combat rolls for 1.3 seconds locally, then
  reveal the authoritative state. Cosmetic values never become game rolls; inputs
  are disabled during the reveal and newer server updates are retained. Opening or
  refreshing a browser shows current results immediately; reduced-motion users skip the animation.
  Server clocks continue normally during this short presentation.
- Show a public close-up of each battle with numbered ships in their actual hexes,
  trigger/helper labels, and selectable casualties for the losing captain. Preserve
  the original participant positions in the battle state so losses remain identifiable.
- List available port attacks without first selecting a ship. Each eligible trigger
  is labeled with its ship number and helper count; the captain chooses the trigger
  because its position determines assistance. Existing server validation applies.
- Retain the corner captain cards and fitted whole-board default. Make zoom relative
  to that fitted size, preserve the viewed center, use smaller increments, and reserve
  room for controls. Enlarge port labels in nearby land with a line to the actual port;
  keep an enlarged token number as a fallback. Map lottery details remain in the draft
  and public log, but leave the playing screen.

## 2026-09-09: alternate-map geography revision

- The owner requested another pass on The Narrows and Shattered Isles because
  their symmetry and repeated islands lacked Classic's nuance. Preserve Classic
  and the source photo; replace the alternate layouts with authored, asymmetric
  coastlines, uneven port spacing, and different harbor exposures. This changes
  terrain only, with thirteen ports and all existing rules retained.
- The Narrows keeps two crossings, but a tight northern cut and a broader,
  offset southern passage create different sailing and blocking costs. Shattered
  Isles uses unequal island groups, coastal bays, and off-center hubs, with
  sheltered ports trading quick access for longer journeys around headlands.
- Publish both geometries as v2. Existing v1 matches must not silently acquire new
  terrain: the existing version check still rejects incompatible saves. No live
  match is reset or migrated as part of this design pass. Four-player balance
  remains a playtest question, not a guarantee from geographic asymmetry.

## 2026-09-08: setup playtest follow-up

- The follow-up report of a blank right half exposed a separate launcher problem: its browser contexts emulated an 1100×850 viewport regardless of the native window size. Remove that emulation (`viewport: null`) and open normal crew windows maximized. Verify native-window resizing through the actual crew launcher; synthetic `page.setViewportSize` tests alone missed this problem.
- The owner also requested a match reset. Add an explicit `--reset` launcher flag that uses the normal authenticated, password-protected reset endpoint after starting the server, retains captain seats, and archives the prior match. It refuses to reset an already-running instance; the existing launcher must first be closed. Normal launcher starts never reset the game.

- Final owner clarification: restore the original UI, with corner captain cards, visible personal tabs, and controls beneath the board. The whole map fits the monitor by default; zoom is optional. Keep the launcher viewport fix, remove the page's 1800px width cap, and allow the fitted map to grow with monitor height beyond the old 840px cap. The owner rejected the intervening full-width scrolling board and collapsed crew layout. Native browser F11 remains available. Desktop monitors are the target; mobile-specific refinement is no longer a release goal.
- Reveal all four perk pickups immediately after the map draw, before the first port pick. Keep their types and locations fixed throughout the draft and into play. This supersedes post-placement spawning and draft-owner-based balancing: use terrain distances from all 13 ports to favor even geographic access, retaining the existing open-water, nearby-harbor fairness, and six-hex spacing constraints. Port choice now determines each captain's access.
- The twelfth port pick automatically launches two ships at every owned port and begins the first captain's turn. There is no placement turn or fleet confirmation. The server chooses empty dark-blue cells in stable row/column order; no ships spawn at the unowned port. This supersedes owner-selected starting positions in the original setup rules.
- On the next server timer tick, old draft saves without pickups receive them; old placement saves automatically fill only missing starting ships, preserving ships already placed, and begin play. Existing playing games retain their pickups and current deadlines; subsequent clocks use the configured durations.
- The owner accepted 60 seconds per round and 20 seconds per action for the next playtest. Remove the four-window launcher's 30-minute/15-minute overrides so it uses the same defaults and explicit environment settings as the normal launcher. Setup remains untimed; timeout resolution policy is unchanged.

## 2026-09-08: owner notes and private game scope

- `9-8-26.md` supersedes the earlier character-selected perk proposal and database/multiple-match launch plan. The game is for one group of friends, with one active match, server-authoritative rules, browser seats, and atomic JSON persistence. Database, lobby codes, and managed accounts are outside the current scope.
- Perks are carried by ships and collected by sailing through their hex. Destroyed ships drop their perks at that hex. The owner confirmed one perk per ship, with no fleet limit. An occupied ship passes other pickups without collecting or swapping. Start with one of each perk; they persist through drops, with no timed respawns. Pickup quantity is a provisional playtest setting.
- The owner revised Glass Cannon to nine equally likely combat results, 0 through 8. Loaded Dice changes exactly 1 or 2 to 3 (not 0). Movement is a shared action roll and remains d6. These perks affect the holder's combat roll in ship battles and port attacks, including when helping.
- Black Pearl makes one server-side 7.5% conversion check per enemy casualty when its holder participates on the winning side. Conversion replaces destruction, preserves position and the recruited ship's perk, and never adds actions to the current round. The recruit leaves the current battle's fixed participant list; new encounters are checked afterward. The chance does not multiply if multiple Pearl holders participate. Public events report the chance roll and result.
- The owner confirmed The Architect affects only the friendly port whose dark-blue harbor holds the ship. At the end of an owner round, eligible builds there advance two steps instead of one while the Architect is present. New builds never launch immediately; multiple Architects do not stack. "Day" means an owner round.
- The owner requested fair randomized open-water pickups, spread apart and approximately equidistant from nearby ports. Candidate cells must be at least three sailing steps from any harbor, with the two nearest harbor distances differing by at most one. Layouts keep at least six hexes between pickups. Sample valid layouts and favor the smallest disparity between captains' nearest pickup distances, then shorter access distances. Randomize which perk appears at each location. Distances ignore ships, which move; terrain and drafted port ownership determine placement. Existing in-progress saves keep playing without retroactive pickups; start a new game to use the full perk layout.
- Round statistics mean each captain's completed round, matching the existing round counter. Record every team's active fleet and port count after construction completes, including timeout rounds. Also record the final capture immediately, so a victory during a round appears in the end screen. Old saves have history only from the upgrade onward.
- Password-authorized reset works from any browser, including a spectator, so losing the host's browser never locks the match. It offers a rematch with the same seats or an empty lobby that releases all seats. Require the current game ID/revision to prevent a delayed reset from erasing a newer game. Archive the previous private save before replacing it; never expose the password or private seat bindings to clients.
- Eight character slots keep stable IDs and configurable display names/JPEG paths. Existing four IDs stay valid for saved games. Until the owner supplies names/photos, show numbered placeholders. Profiles are cosmetic and may be shared by players.
- HTTP controllers handle requests and responses; the store handles atomic persistence and identities; GameRules remains the authoritative rule engine. Keep this separation without introducing a database or additional projects.
- The owner requested two additional maps and vote-weighted random selection on the home/lobby screen, then authorized designing playable alternatives. The original is named Classic. The Narrows has two basins connected by two contested passages; Shattered Isles offers island clusters and multiple routes. All maps retain 13 ports and the same rules. Each seated captain has one public vote, which can be changed or cleared before the draft. Spectators cannot vote. Starting the draft freezes the ballot and makes one server-generated draw: each vote is one ticket, unvoted maps have no tickets, and no votes means an equal draw among all three maps. The selected map, ticket, and counts are retained publicly and in the save; resetting clears the ballot and result. Board data, rules, harbors, and perk placement must all use the selected map. Old saves default to Classic.

## 2026-09-07: playable board and multiplayer foundation

- The original JPEG is a mapping reference. The game renders SVG hexes from server-owned terrain and harbor data. Preserve the source image; keep a derived mapping preview for review. Any uncertain photo classifications remain documented rather than claiming an exact map prematurely.
- Normal play assigns one captain per browser profile using a server-signed, HttpOnly session cookie. Tabs share that captain. Additional browsers can watch. Local hot-seat controls are not part of normal multiplayer.
- The first captain hosts the lobby and selects the first player on the group's behalf. The remaining order follows seats, rotated to that first player, then uses the rules' snake draft.
- Initial ship placement is a separate setup phase, in draft order. Each owner places two ships in each owned port's harbor before play begins.
- Provisional timers are configurable: 120 seconds per round and 45 seconds per action. They still need playtesting. A timeout uses normal construction completion; unchosen optional builds are declined. If a battle needs a casualty at timeout, the server removes the first eligible ship in stable ID order and resolves mandatory battles before advancing. Public events explain automatic decisions.
- Combat assistance is measured from each team's triggering ship, never from its helpers. Opposing ships in the same harbor trigger combat even when nonadjacent. A harbor contributes a die to its owner when both triggering ships occupy that harbor. Third-party ports do not introduce a third combat team.
- Every movement route is checked hex by hex and stops at its first combat trigger, preserving unused movement. After a battle, any remaining mandatory encounters must be resolved before movement resumes.
- A completed port attack remains visible in the shared battle dialog until the active captain continues; rolls are retained in the public event log. A tie requires another public roll.
- Players with ports but no ships go directly to construction selection. Eliminated players are skipped. Finishing construction never gives movement on the turn of completion.
- Characters initially use named, code-drawn emblems. Perks remain disabled as required by GAME_RULES.md until their mechanics are specified and balanced.
- The incompatible original prototype save is preserved. The new board/session schema uses a separate local-development save file. Database-backed matches and managed authentication remain release requirements.
