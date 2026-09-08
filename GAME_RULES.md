# How to play Marauders

## Summary

Marauders is a turn-based board game about pirate ships capturing ports. Each player takes turns rolling dice to move ships and attack ports. The game is won when one player owns every port.

## The board

The game board features multiple hexagons, each with its own meaning. A JPEG of the original in-person board is saved to this folder: `Original Marauders Board.jpeg`.

- **Black:** A port, where ships are produced. There are 13 on the board.
- **Dark blue:** Waters surrounding a port. A ship on this color can attack an enemy port or defend its own. Ships cannot attack or defend a port from any other hex.
- **Blue:** Waters that ships traverse.
- **Green and tan:** Game boundaries signifying land. Ships cannot travel here.
- **Gray, yellow, and red:** Ship-building squares. They represented a ship's build progress in the physical game. The website can show this progress in the UI instead.

## Setup

Before the game is set up, each player enters a name, picks a character, a perk, and a color. Character names and images will be provided later; generic pirate names may be used initially.

The game is played with four players. Additional players are spectators only and cannot make moves. Players should be reliably identified by their browsers.

The players decide who goes first. They then pick ports using a snake draft. With four players and 13 ports, each player picks three ports and one port remains unowned. The unowned port can be captured during the game.

For each port someone owns, they receive two ships immediately. At the start of the game, each owned port gets two ships in empty hexes in its dark-blue water. The owner chooses their placement.

## Game rules

### Dice, actions, and ports

The number of ships on the water determines the number of dice, and therefore actions, a player gets. If a player has 1-3 ships, they get 1 die; 4-7 ships gets 2 dice; 8-11 gets 3 dice; and each additional four ships grants one more die.

Each die is one action. With an action, a player may choose one of the following:

1. **Move ships:** Roll the die and distribute its movement value among any number of their ships. For example, a roll of 5 may move one ship five hexes, or several ships whose total movement is five hexes. Combat triggered by movement does not consume movement. If combat ends, the player may continue using any remaining movement from that roll.
2. **Attack a port:** If eligible, attack an enemy or unowned port. This consumes the die rolled; its numeric value is not used for movement.

Once a player is out of actions or ships, their round ends.

Each port supports two ships, so a player's population cap is two ships per port they own. A player may not begin building a ship if doing so would exceed this cap. Existing ships are not removed if the player later loses ports, but they cannot begin further construction until they are below their current cap.

Ports make ships. At the end of their round, a player may choose a port to begin rebuilding each ship they are below their population cap. Starting construction does not cost a die or action. A port can build multiple ships at once, but once a ship has started building at a port, its build cannot be transferred to another port. A ship finishes at the end of the turn two turns later, is placed in an empty hex of its port's dark-blue water, and is ready to move on the following turn. If no dark-blue placement hex is available, the ship spills over to the nearest legal empty blue-water hex, so construction never removes a ship from the player's available actions.

### Movement

Ships move over water. They cannot move onto, stack with, or move through another ship, but may enter a port's dark-blue water in order to attack or defend that port.

### Combat

#### Ship vs. ship

Combat is automatically triggered when one of the following happens:

1. A ship from one team is on a hexagon next to a ship from another team.
2. Ships from opposing teams share the dark-blue water of a port.

Other ships automatically assist their team's ship in combat if they are within two hexes of the ship that triggered combat. This does not chain. For example, if ship 1 is two hexes from ship 2 and ship 2 is two hexes from ship 3, ship 3 cannot assist ship 1's combat when ship 1 triggered it, because ship 3 is four hexes away. However, ships 1 and 3 can assist ship 2's combat if ship 2 triggered it.

If a player creates more than one possible combat, they choose through the UI which combat to resolve first.

Each participating ship rolls one die for its team. The server rolls every die publicly and displays the results to all players. The highest die for each team is compared; the higher result wins. On a tie, reroll.

Examples:

- Team 1: 4, 5; Team 2: 3. Team 1 wins.
- Team 1: 1, 2, 5; Team 2: 6. Team 2 wins.
- Team 1: 6, 6; Team 2: 6. Tie; reroll.

The losing team must choose a participating ship to remove from battle. If a helper is removed, it must be removed before the next dice roll; the battle then continues because the two triggering ships remain adjacent. If a triggering ship is removed and the opposing triggering ship is no longer adjacent to an enemy, the battle ends.

When ship-vs.-ship combat occurs in a port's dark-blue water, that port may contribute one additional die for its owner. The port cannot be removed if its side loses that battle.

#### Port vs. ship

Ports do not automatically trigger battles themselves. However, when a ship is in the dark-blue water of an enemy or unowned port, the player may spend an action to attack the port. If an enemy ship is also in that dark-blue water, ship-vs.-ship combat triggers and must be resolved before a port attack is possible.

A port gets one die, while an attacking party gets one die for each participating ship via the same rule as ship-vs.-ship combat. If the port wins, no ship is destroyed. Instead, the port's future defense-roll value is weakened by 1. Each subsequent defense win adds another -1 modifier, which continues indefinitely until an allied ship enters the port's dark-blue water; then the modifier resets to 0.

Example:

Turn 1: Port rolls 5; ship rolls 4. The port wins.

Turn 2: Port rolls 5 (-1) = 4; ship rolls 5. The attacking ship wins.

When a port is captured, ownership transfers immediately. Any ships it was building are voided; they must be started again at another owned port, with all progress lost. Ships on the board are unaffected unless the captured port was their owner's final port.

### End of a player's round

For each ship they are below their population cap, the player may choose a port at which to begin construction.

### Miscellaneous

If a player is over their population cap, they do not lose active ships, but cannot build more until they are below it.

If someone captures a player's final remaining port, all of that player's remaining ships immediately become the capturer's ships, retaining their positions.

The unowned port can be captured by anyone, but it fights back like a player-owned port. Its defense weakness is not reset when ships enter its dark-blue water, because it has no allied ships.

There will be a countdown for each turn and action so the game cannot take too long. If it runs out, that player's round ends. The exact durations will be decided through playtesting.

### Perks

Perks are new in the online version. Any player can choose any perk, and two people can have the same one. They are not part of the initial build, because their effects still need balancing.

- **Silver Tongue:** When an enemy ship is defeated and would be removed, it has a 2% chance to instead join your team.
- **Loaded Dice:** A seven-sided die instead of a six-sided die is used at some point.
- **Divine Intervention:** After a combat loss of any type, reset and try again.


