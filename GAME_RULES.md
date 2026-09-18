# How to play Marauders

## Summary

Marauders is a turn-based board game about pirate ships capturing ports. Each player takes turns rolling dice to move ships and attack ports. Win as soon as you are the only active captain who owns any ports, whether opponents lose their final ports or forfeit. Neutral and ghost ports do not delay victory.

## The board

The game board features multiple hexagons, each with its own meaning. A JPEG of the original in-person board is saved to this folder: `Original Marauders Board.jpeg`. That layout is named **Classic**. Two additional layouts, **The Choke** and **Serpent’s Coil**, use the same terrain meanings and rules. Each map has 13 ports.

- **Black:** A port, where ships are produced. There are 13 on every map.
- **Dark blue:** Waters surrounding a port. A ship on this color can attack an enemy port or defend its own. Ships cannot attack or defend a port from any other hex.
- **Blue:** Waters that ships traverse.
- **Green and tan:** Game boundaries signifying land. Ships cannot travel here.
- **Gray, yellow, and red:** Ship-building squares. They represented a ship's build progress in the physical game. The website can show this progress in the UI instead.

## Setup

Before joining, each player enters a name and explicitly picks one of eight pictured cosmetic characters and an available crew color. No two captains may choose the same character or color. Taken choices remain reserved across refreshes and disconnections; leaving the lobby releases them. The characters are Alex the Merciless, Alyssa the Sea Witch, Dylan the Salty Dog, Hayven the Merchant, Jacob the Vengeful, Jared the Oil Baron, Josh the Phantom, and Steven the Cruel. Perks are collected at sea during play.

The game is played with four players. Additional players are spectators only and cannot make moves. Players should be reliably identified by their browsers.

The players decide who goes first; the host selects that captain in the lobby (the first seated captain is the default). Each of the four captains must press **Ready**. The fourth ready automatically draws the map, assigns ports, launches ships, and starts play. Captains may undo readiness before then. Changing your map vote clears your readiness; changing the first captain or the seated crew clears everyone's readiness. Ready status survives refresh, reconnection, and server restart; a new game starts with everyone unready. Spectators cannot ready up.

The server deals three geographically balanced random ports to each captain. It measures the shortest sailing routes between ports, excludes the strongest three-port clusters, and randomly draws from a broad band of the fairest remaining layouts so setup remains varied. The port nearest the center of the selected map starts unowned: Blackwater on Classic, Northgate on The Choke, and Serpent's Heart on Serpent's Coil. It can be captured during the game. There is no port draft in new games.

Before play, each seated captain may cast one public map vote in the lobby, change it, or clear it. Spectators do not vote. When all four captains are ready, the server randomly chooses the map with each vote acting as one ticket. For example, three votes for Classic and one for The Choke give them 75% and 25% chances; Serpent’s Coil has 0%. With no votes, the three maps have equal chances. The result and draw are public, and voting closes for that game.

Six perk pickups appear in open water on the selected map as part of setup.

The server automatically places two ships in empty dark-blue hexes at each owned port and starts the first captain's turn. Each captain begins with six ships. There is no separate ship placement or fleet confirmation. The unowned port receives no ships.

## Game rules

### Dice, actions, and ports

The number of ships on the water determines the number of dice, and therefore actions, a player gets. Before round 85, divide ships by three and round up: 1-3 ships get 1 die, 4-6 get 2 dice, 7-9 get 3 dice, and so on. Starting in round 85, divide ships by two and round up instead: 1-2 ships get 1 die, 3-4 get 2 dice, 5-6 get 3 dice, and so on. A twelve-round public warning begins at round 73. Zero ships means zero action dice. Each participating ship still rolls one combat die.

Each die is one action. With an action, a player may choose one of the following:

1. **Move ships:** Roll an equally likely 4, 5, or 6 and distribute its movement value among any number of their ships. The result appears immediately, without a rolling animation. For example, a roll of 5 may move one ship five hexes, or several ships whose total movement is five hexes. Combat triggered by movement does not consume movement. If combat ends, the player may continue using any remaining movement from that roll.
2. **Attack a port:** If eligible, attack an enemy or unowned port. This consumes the die rolled; its numeric value is not used for movement.

Once a player is out of actions or ships, their round ends.

Each port supports two ships. A player’s population cap is two ships per owned port, plus one per ship carrying Mouth to Feed. A player may not begin building a ship if doing so would exceed this cap. Existing ships are not removed if the player later loses ports, but they cannot begin further construction until they are below their current cap.

Ports make ships. At the end of their round, a player may choose a port to begin rebuilding each ship they are below their population cap. Starting construction does not cost a die or action. A port can build multiple ships at once, but once a ship has started building at a port, its build cannot be transferred to another port. A ship started before round 66 finishes at the end of its owner's turn two owner turns later. A ship started during round 66 or later needs three future owner turns instead. The timing is locked when construction begins, so construction already underway is not slowed when round 66 starts. An eight-round public warning begins at round 58. A completed ship is placed in an empty hex of its port's dark-blue water and is ready to move on the following turn. If no dark-blue placement hex is available, the ship spills over to the nearest legal empty blue-water hex, so construction never removes a ship from the player's available actions.

### Movement

Ships move over water. They cannot move onto, stack with, or move through another ship, but may enter a port's dark-blue water in order to attack or defend that port.

### Combat

#### Ship vs. ship

Combat is automatically triggered when one of the following happens:

1. A ship from one team is on a hexagon next to a ship from another team.
2. Ships from opposing teams share the dark-blue water of a port.

Other ships automatically assist their team's ship in combat if they are within two hexes of the ship that triggered combat. This does not chain. For example, if ship 1 is two hexes from ship 2 and ship 2 is two hexes from ship 3, ship 3 cannot assist ship 1's combat when ship 1 triggered it, because ship 3 is four hexes away. However, ships 1 and 3 can assist ship 2's combat if ship 2 triggered it.

If a player creates multiple combats with different participating ships or port support, they choose which to resolve first. Trigger pairs involving the same forces and port support are one battle, with no duplicate choice.

Each participating ship rolls one die for its team. The server rolls every die publicly and displays the results to all players. The highest die for each team is compared; the higher result wins. On a tie, reroll.

Examples:

- Team 1: 4, 5; Team 2: 3. Team 1 wins.
- Team 1: 1, 2, 5; Team 2: 6. Team 2 wins.
- Team 1: 6, 6; Team 2: 6. Tie; reroll.

The losing team must choose a participating ship to remove from battle. If only one of its ships participated, the server automatically resolves that casualty, including any perk effects. If a helper is removed, it must be removed before the next dice roll; the battle then continues because the two triggering ships remain adjacent. If a triggering ship is removed and the opposing triggering ship is no longer adjacent to an enemy, the battle ends.

In ship-vs.-ship combat, each port within two hexes of its owner's triggering ship contributes one additional die for that owner. This uses direct hex distance, just like assisting ships, and works outside dark-blue harbor water. It does not chain through helpers. Neutral ports and ports owned by a third team do not assist. The port cannot be removed if its side loses that battle.

#### Port vs. ship

Ports do not automatically trigger battles themselves. However, when a ship is in the dark-blue water of an enemy or unowned port, the player may spend an action to attack the port. If an enemy ship is also in that dark-blue water, ship-vs.-ship combat triggers and must be resolved before a port attack is possible.

A port gets one die, while an attacking party gets one die for each participating ship via the same rule as ship-vs.-ship combat. If the port wins, no ship is destroyed. Instead, the port's future defense-roll value is weakened by 1. Each subsequent defense win adds another -1 modifier, which continues indefinitely until an allied ship enters the port's dark-blue water; then the modifier resets to 0.

Example:

Turn 1: Port rolls 5; ship rolls 4. The port wins.

Turn 2: Port rolls 5 (-1) = 4; ship rolls 5. The attacking ship wins.

When a port is captured, ownership transfers immediately. Any ships it was building are voided; they must be started again at another owned port, with all progress lost. Ships on the board are unaffected unless the captured port was their owner's final port.

### End of a player's round

For each ship they are below their population cap, including ships already under construction, the player may choose an owned port at which to begin construction. When the round ends, including on timeout, the server automatically starts every unchosen build at a randomly selected owned port. Each ship's port is chosen independently with equal chances. Manual choices and existing builds stay in place; automatic builds use the same two-owner-round timing before round 66 and three-owner-round timing from round 66 onward.

If completed ships launch into combat, resolve those battles before the next
captain's turn begins. The finishing captain chooses battle order and rolls;
each losing captain chooses their own casualty. Construction has already
finished, so those losses can be rebuilt on a later turn. The normal action
clock applies to each battle decision; the next captain keeps their full turn
time. On timeout, the server resolves these battles automatically before
advancing. An unrelated captain never controls another team's battle rolls.

### Miscellaneous

If a player is over their population cap, they do not lose active ships, but cannot build more until they are below it.

If someone captures a player's final remaining port, all of that player's remaining ships immediately become the capturer's ships, retaining their positions.

An unowned port can be captured by anyone, but it fights back like a player-owned port. Its defense weakness is not reset when ships enter its dark-blue water, because it has no allied ships.

There is a countdown for each turn and action so the game cannot take too long. If either runs out, that player's round ends. The current playtest defaults are 45 seconds per action and a minimum of 135 seconds per turn. At turn start, the turn budget is the greater of that minimum or (starting action dice + 1) times the action interval: two dice get 2:15, five dice get 4:30. The extra interval allows planning and construction. Gaining ships during a turn does not extend its budget. Port drafting is untimed.

### How the voyage changes over time

A round is one captain's displayed turn. Several lasting rule changes arrive as
that counter advances:

- **Round 29:** A four-round public warning begins. The server chooses the
  Kraken's future ordinary-water hex, reserves that center against movement and
  other spawns, and marks its future two-hex reach red so fleets can move clear.
- **Round 33:** The Kraken appears at a server-randomized ordinary-water hex, so
  its location can differ in every game. It rises at the location marked since
  round 29. Its pink hex has a tentacle marker and
  its two-hex reach is colored red until it is slain. Its spawn is far enough
  from every port that no ship inside its reach can receive port support. Every
  ship still in the marked reach when it rises is removed immediately without a
  battle, roll, casualty choice, or perk intervention. Carried perks drop at the
  removed ships' hexes normally.
- **Round 46:** A four-round public warning announces the whirlpool surge.
- **Round 50:** The whirlpool spawn chance after a completed turn rises from 10%
  to 25% whenever no pair exists.
- **Round 58:** An eight-round public warning announces slower shipbuilding.
- **Round 66:** Newly started construction needs three future owner rounds
  instead of two. Existing builds keep the timing stored when they began.
- **Round 73:** A twelve-round public warning announces the action surge.
- **Round 85:** Captains receive one action die per two ships instead of per
  three ships, rounding up.

The Kraken never moves. Any fleet whose triggering ship enters its two-hex reach
fights it through the normal public ship-combat flow. Friendly ships within two
hexes of that triggering ship help without chaining. The Kraken rolls three dice
per exchange and has three persistent lives. A fleet win removes one Kraken life;
a Kraken win removes one participating ship; ties reroll. The encounter continues
while the triggering ship remains in reach, and lost Kraken lives never return.
When its final life is lost, the red reach disappears and a unique seventh perk
is revealed at its hex. Any eligible ship can collect and later drop that perk
under the normal pickup rules. Its identity and effect are intentionally omitted
from this guide so the reward remains a surprise.

### Perks

Updated from the owner's September 13 playthrough notes and clarifications. Perks appear as pickups in open water, spread apart with fair access from nearby ports. Sailing through a pickup gives it to that ship. Each ship may hold one perk; a fleet may hold multiple perks. A ship already holding one sails past other pickups. When a ship is destroyed, any unconsumed perk drops at its hex and can be collected again, including on arrival at a whirlpool exit.

- **The Black Pearl:** When an enemy casualty would be destroyed in a ship battle involving this ship on the winning side, roll one six-sided die. On a 1, recruit that casualty instead. It stays at its hex and retains its perk. If it is within two hexes of its new side's surviving triggering ship, it immediately contributes to later exchanges in that same battle. Recruitment never increases the current round's action dice. One check per casualty, regardless of how many Pearl holders participated.
- **Glass Cannon:** This ship's combat roll is uniformly distributed from -1 through 8, including both endpoints. This replaces its normal d6 combat roll.
- **Loaded Dice:** This ship's combat results of 1, 2, or 3 become 4.
- **Mouth to Feed:** Adds one population slot to the captain of the ship carrying it, anywhere at sea. Each holder adds one slot. The bonus follows the ship’s owner; losing the perk never removes existing ships or cancels construction.
- **Black and White:** When this ship participates in a combat exchange, all numbered ship and port dice and defense modifiers are replaced by one server-generated black-or-white result. Black wins for this ship's team; white wins for the opposing side. This applies in ship battles and port attacks, including when the holder helps. If the holder is removed and the ship battle continues, later exchanges return to normal dice.
- **Cheat Death:** The first time this ship participates on the losing side of a combat exchange, consume the perk before any casualty, recruitment, capture, or defense weakening. This includes helpers, port attackers, and Black and White results. The losing result remains visible to every player, then the battle controller must publicly reroll the entire exchange as they would after a tie. Ties do not consume it. The perk immediately respawns in a random empty ordinary-water hex, avoiding other pickups and whirlpools. The new result applies normally; another losing participant carrying Cheat Death can then use its own perk.

Combat perks work for participating helpers and port attackers. Shared movement rolls are always 4-6 and unaffected by perks. Port defense rolls remain normal d6s unless Black and White replaces the entire exchange. Games start with one pickup of each of the six types. Only consumed Cheat Death respawns; there are no timed respawns. Exact spawn and timing interpretations are recorded in [DECISIONS.md](DECISIONS.md).

### Forfeit and leave

A captain may forfeit during play (or a legacy draft) after confirming. Ships
already on the water and owned ports remain as a white ghost fleet. Ghost ships
do not move, keep their carried perks, fight normally when an active captain
encounters them, and receive support from their owner's ghost ports within two
hexes. Ghost ports retain their current defense and can be attacked and captured
normally. The server selects casualties for a losing ghost fleet. Ghost fleets
do not fight other ghost fleets or the Kraken. Capturing a ghost fleet's final
port does not recruit its remaining ships; those ships must still be sunk or
recruited through the Black Pearl. All pending construction is canceled, and
ghost ports never build replacement ships. The forfeited captain's turns and any
remaining legacy draft picks are skipped; they watch as a spectator and cannot
rejoin that match. During play, the only active captain still owning ports wins
immediately, even if ghost ships, ghost ports, neutral ports, and previously eliminated
captains remain. During drafting, the last nonforfeited captain wins; captains
who have not picked yet still count. Leaving the lobby releases the seat and vote; leaving a finished game
preserves its result.

### Whirlpools

After each completed captain turn, including a timeout, there is a 10% chance
to spawn one pair of whirlpools if none exists through round 49. Starting with
the completion of round 50, the chance is 25% (2.5 times the original rate).
Every viewer receives a four-round public warning beginning at round 46. That
is four independent chances per full four-player cycle. They appear in two
empty ordinary-blue water hexes at least ten hexes apart, never in a port’s
dark-blue water or on ships/pickups.
Only one pair exists at a time. It lasts two full cycles: eight subsequent
captain turns with four living captains, or twice the living captain count at
spawn. It fades after that many turns without moving any ship resting there.

Entering costs one movement and immediately teleports the ship to the other
hex. Charting stops there; unused movement is retained for a new route.
Combat triggers at the exit normally. An occupied exit prevents entry. Arrival
does not teleport back; the ship can sail away normally. The pair is public,
with its remaining lifetime shown on the map, and survives a server restart.
