using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    [Theory]
    [InlineData("classic")]
    [InlineData("narrows")]
    [InlineData("delta")]
    public void Cam_and_remote_Ear_Plugs_spawn_on_each_map_without_overlaps(string mapId)
    {
        var state = Lobby();
        Rules(state).Act(state.HostPlayerId!, new("vote-map", MapId: mapId));
        var rules = new GameRules(state, new FixedDice(), new GameOptions { StartingRound = 12 }, Now);
        ReadyCrew(state, rules: rules);
        var board = MapCatalog.Get(mapId).Board;
        var siren = Assert.IsType<SirenState>(state.Siren);
        Assert.True(siren.Alive);
        Assert.Equal("water", board.Cell(siren.Hex)!.Terrain);
        Assert.Equal(19, board.Cells.Count(cell => cell.Terrain == "water" && cell.Hex.DistanceTo(siren.Hex) <= 2));
        Assert.All(board.Ports, port => Assert.True(siren.Hex.DistanceTo(board.PortHex(port.Id)) > 2));
        var preferredSitesExist = board.Cells.Any(cell => cell.Terrain == "water" &&
            board.Cells.Count(water => water.Terrain == "water" && water.Hex.DistanceTo(cell.Hex) <= 2) == 19 &&
            board.Ports.All(port => cell.Hex.DistanceTo(board.PortHex(port.Id)) > 3) &&
            state.PerkPickups.All(perk => cell.Hex.DistanceTo(new(perk.Q, perk.R)) > 2));
        if (preferredSitesExist)
            Assert.All(board.Ports, port => Assert.True(siren.Hex.DistanceTo(board.PortHex(port.Id)) > 3));
        Assert.All(state.PerkPickups, perk => Assert.True(siren.Hex.DistanceTo(new(perk.Q, perk.R)) > 2));
        var plugs = Assert.Single(state.PerkPickups, perk => perk.Kind == "ear-plugs");
        var plugHex = new Hex(plugs.Q, plugs.R);
        Assert.True(siren.Hex.DistanceTo(plugHex) >= 10);
        Assert.All(BoardMap.Adjacent(plugHex), neighbor => Assert.Equal("water", board.Cell(neighbor)?.Terrain));
        var farthestTen = board.Cells.Where(cell => cell.Terrain == "water" &&
            cell.Hex.DistanceTo(siren.Hex) >= 10 &&
            BoardMap.Adjacent(cell.Hex).All(neighbor => board.Cell(neighbor)?.Terrain == "water") &&
            state.PerkPickups.Where(perk => perk.Kind != "ear-plugs")
                .All(perk => cell.Hex.DistanceTo(new(perk.Q, perk.R)) >= 6) &&
            !state.Ships.Any(ship => ship.Hex == cell.Hex))
            .OrderByDescending(cell => cell.Hex.DistanceTo(siren.Hex))
            .ThenBy(cell => cell.R).ThenBy(cell => cell.Q).Take(10).Select(cell => cell.Hex).ToArray();
        Assert.Contains(plugHex, farthestTen);
        Assert.DoesNotContain(state.Ships, ship => ship.Hex == siren.Hex);
        var kraken = KrakenPlacement.Spawn(state, new FixedDice());
        Assert.True(kraken.Hex.DistanceTo(siren.Hex) > KrakenPlacement.Reach + SirenPlacement.Reach);
    }

    [Fact]
    public void Cam_is_warned_at_round_8_and_activates_with_Wax_at_round_12()
    {
        var state = Lobby();
        var rules = new GameRules(state, new FixedDice(), new GameOptions { StartingRound = 8 }, Now);
        ReadyCrew(state, rules: rules);
        var siren = Assert.IsType<SirenState>(state.Siren);
        Assert.Equal(12, siren.AwakensOnRound);
        Assert.False(SirenPlacement.IsActive(siren, state.TurnNumber));
        Assert.Equal(6, state.PerkPickups.Count);
        Assert.Single(state.Events, e => e.Kind == "siren" && e.Message.Contains("warning"));
        var initialPickups = state.PerkPickups.ToArray();

        var ship = state.Ships.First(s => s.OwnerId == state.ActivePlayerId);
        ship.Q = siren.Q; ship.R = siren.R; ship.Perk = "loaded-dice";
        state.IsBuildPhase = true;
        rules.Act(state.ActivePlayerId!, new("end-turn"));
        Assert.Equal(9, state.TurnNumber);
        Assert.Contains(ship, state.Ships);
        Assert.Null(state.Combat);
        while (state.TurnNumber < 12) rules.Act(state.ActivePlayerId!, new("end-turn"));

        Assert.Same(siren, state.Siren);
        Assert.True(SirenPlacement.IsActive(siren, state.TurnNumber));
        Assert.Single(state.PerkPickups, perk => perk.Kind == "ear-plugs");
        Assert.Single(state.Events, e => e.Kind == "siren" && e.Message.Contains("appeared"));
        Assert.DoesNotContain(ship, state.Ships);
        var dropped = Assert.Single(state.PerkPickups, perk => perk.Kind == "loaded-dice" && !initialPickups.Contains(perk));
        Assert.Equal("water", MapCatalog.Resolve(state.MapId, state.BoardVersion).Cell(new(dropped.Q, dropped.R))?.Terrain);
        Assert.NotEqual(siren.Hex, new Hex(dropped.Q, dropped.R));
        Assert.Contains(state.Events, e => e.Kind == "casualty" && e.Message.Contains("island rose"));
        Assert.True(SirenPlacement.IsActive(new SirenState(), 1)); // Older saves stay active.
    }

    [Fact]
    public void Siren_warning_location_does_not_avoid_ships_already_there()
    {
        var state = Lobby();
        ReadyCrew(state);
        var chosen = SirenPlacement.Spawn(state, new FixedDice());
        var ship = state.Ships[0]; ship.Q = chosen.Q; ship.R = chosen.R;
        Assert.Equal(chosen.Hex, SirenPlacement.Spawn(state, new FixedDice()).Hex);
    }

    [Fact]
    public void Cam_cannot_pull_a_ship_from_port_harbor_water_inside_her_reach()
    {
        var state = Playing();
        var board = BoardDefinition.Classic;
        var pair = (from harbor in board.Cells
                    where harbor.Terrain == "harbor"
                    from island in board.Cells
                    where island.Terrain == "water" && harbor.Hex.DistanceTo(island.Hex) is >= 2 and <= 3
                    where board.Neighbors(harbor.Hex).Any(next => next.DistanceTo(island.Hex) < harbor.Hex.DistanceTo(island.Hex))
                    select (harbor, island)).First();
        state.Siren = new() { Q = pair.island.Q, R = pair.island.R };
        var ship = Add(state, 1, pair.harbor.Hex);
        state.IsBuildPhase = true;

        Rules(state).Act(state.ActivePlayerId!, new("end-turn"));

        Assert.Equal(pair.harbor.Hex, ship.Hex);
        Assert.DoesNotContain(state.Events, e => e.Kind == "siren" && e.Message.Contains($"ship {ship.Number} from"));
    }

    [Fact]
    public void Contact_starts_Cam_battle_and_one_fleet_win_transforms_unclaimed_Wax_in_place()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 3, R = Open.R };
        var waxHex = Offset(Open, -3);
        state.PerkPickups.Add(new("ear-plugs", waxHex.Q, waxHex.R));
        var ship = Add(state, 0, Open);
        state.RemainingMovement = 2;
        Rules(state).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: Open.Q + 2, R: Open.R));
        Assert.Equal("siren", state.Combat!.Kind);
        Assert.Equal(1, ship.Hex.DistanceTo(state.Siren.Hex));
        Assert.Throws<RuleException>(() => Rules(state).Act(ship.OwnerId,
            new("move", ShipId: ship.Id, Q: state.Siren.Q, R: state.Siren.R)));

        Rules(state, 6, 1).Act(ship.OwnerId, new("roll-combat", CombatId: state.Combat.Id));
        Assert.False(state.Siren.Alive);
        Assert.Equal("resolved", state.Combat.Status);
        var reward = Assert.Single(state.PerkPickups, perk => perk.Kind == "call-of-the-siren");
        Assert.Equal(waxHex, new Hex(reward.Q, reward.R));
        Assert.DoesNotContain(state.PerkPickups, perk => perk.Kind == "ear-plugs");
        Assert.DoesNotContain("dropped", state.Combat.Message);
    }

    [Fact]
    public void Black_and_white_is_ignored_against_Cam()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 2, R = Open.R };
        var holder = Add(state, 0, Open);
        holder.Perk = "black-and-white";
        state.RemainingMovement = 1;
        Rules(state).Act(holder.OwnerId, new("move", ShipId: holder.Id, Q: Open.Q + 1, R: Open.R));

        var dice = new ControlledDice([6, 1]);
        new GameRules(state, dice, new(), Now)
            .Act(holder.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));

        Assert.Null(state.Combat.BlackWhiteResult);
        Assert.Null(state.Combat.BlackWhiteOwnerId);
        Assert.Equal(new[] { 6 }, state.Combat.Rolls[holder.OwnerId]);
        Assert.Equal(new[] { 1 }, state.Combat.Rolls[GameRules.SirenId]);
        Assert.Equal(new[] { 6, 20 }, dice.Sides);
        Assert.False(state.Siren.Alive);
    }

    [Fact]
    public void Slaying_Cam_replaces_Wax_on_its_remote_carrier_even_if_another_fleet_wins()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 2, R = Open.R };
        var attacker = Add(state, 0, Open);
        var waxCarrier = Add(state, 1, Offset(Open, -3));
        waxCarrier.Perk = "ear-plugs";
        state.RemainingMovement = 1;
        Rules(state).Act(attacker.OwnerId, new("move", ShipId: attacker.Id, Q: Open.Q + 1, R: Open.R));

        Rules(state, 6, 1).Act(attacker.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));

        Assert.False(state.Siren.Alive);
        Assert.Equal("call-of-the-siren", waxCarrier.Perk);
        Assert.DoesNotContain(state.PerkPickups, perk => perk.Kind == "call-of-the-siren");
        Assert.DoesNotContain(state.Ships, ship => ship.Perk == "ear-plugs");
    }

    [Fact]
    public void Cam_pulls_another_captains_ship_at_turn_end_and_that_captain_controls_the_battle()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 2, R = Open.R };
        var ship = Add(state, 2, Open);
        var owner = state.ActivePlayerId!;
        state.IsBuildPhase = true;
        Rules(state).Act(owner, new("end-turn"));
        Assert.Equal(new Hex(Open.Q + 1, Open.R), ship.Hex);
        Assert.Equal("siren", state.Combat!.Kind);
        Assert.Equal(owner, state.ActivePlayerId);
        Assert.Equal(ship.OwnerId, state.CombatPlayerId);
        Assert.Throws<RuleException>(() => Rules(state).Act(owner, new("roll-combat", CombatId: state.Combat.Id)));
        Rules(state, 6, 1).Act(ship.OwnerId, new("roll-combat", CombatId: state.Combat.Id));
        Rules(state).Act(ship.OwnerId, new("continue-combat", CombatId: state.Combat.Id));
        Assert.NotEqual(owner, state.ActivePlayerId);
    }

    [Fact]
    public void Ear_Plugs_prevent_pulling_and_a_helping_holder_limits_Cam_to_one()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 2, R = Open.R };
        var protectedShip = Add(state, 1, Open);
        protectedShip.Perk = "ear-plugs";
        state.IsBuildPhase = true;
        Rules(state).Act(state.ActivePlayerId!, new("end-turn"));
        Assert.Equal(Open, protectedShip.Hex);

        var battle = Playing();
        battle.Siren = new() { Q = Open.Q + 2, R = Open.R };
        var trigger = Add(battle, 0, Open);
        var helper = Add(battle, 0, Offset(Open, 0, -1));
        helper.Perk = "ear-plugs";
        battle.RemainingMovement = 1;
        Rules(battle).Act(trigger.OwnerId, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        Assert.Equal("siren", battle.Combat!.Kind);
        Rules(battle, 6, 6, 20).Act(trigger.OwnerId, new("roll-combat", CombatId: battle.Combat.Id));
        Assert.Equal(new[] { 1 }, battle.Combat.Rolls[GameRules.SirenId]);
        Assert.False(battle.Siren.Alive);
        Assert.Equal("call-of-the-siren", helper.Perk);
    }

    [Fact]
    public void Call_of_the_Siren_draws_only_enemies_after_Cam_is_dead()
    {
        var state = Playing();
        state.Siren = new() { Q = Open.Q + 4, R = Open.R, Alive = false };
        var holder = Add(state, 0, Offset(Open, 3));
        holder.Perk = "call-of-the-siren";
        var enemy = Add(state, 1, Open);
        var friend = Add(state, 0, Offset(Open, 2, -1));
        var friendStart = friend.Hex;
        state.IsBuildPhase = true;
        Rules(state).Act(state.ActivePlayerId!, new("end-turn"));
        Assert.Equal(2, enemy.Hex.DistanceTo(holder.Hex));
        Assert.Equal(friendStart, friend.Hex);
    }

    [Fact]
    public void Call_weakens_only_adjacent_enemies_during_an_ordinary_ship_battle()
    {
        var state = Playing();
        var carrier = Add(state, 0, Open); carrier.Perk = "call-of-the-siren";
        var enemy = Add(state, 1, Offset(Open, 2));
        var ally = Add(state, 0, Offset(Open, 1, -1));
        state.RemainingMovement = 1;
        Rules(state).Act(carrier.OwnerId, new("move", ShipId: carrier.Id, Q: Open.Q + 1, R: Open.R));

        new GameRules(state, new ControlledDice([4, 6, 6]), new(), Now)
            .Act(carrier.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));

        Assert.Equal(new[] { 4, 6 }, state.Combat.Rolls[carrier.OwnerId]);
        Assert.Equal(new[] { 5 }, state.Combat.Rolls[enemy.OwnerId]);
        Assert.Equal(carrier.OwnerId, state.Combat.WinnerId);
        Assert.Equal(1, carrier.Hex.DistanceTo(ally.Hex));
    }

    [Fact]
    public void Call_subtracts_one_from_each_adjacent_Mark_die()
    {
        var (state, carrier, markedEnemy) = Duel("call-of-the-siren", "mark-of-the-kraken");
        new GameRules(state, new ControlledDice([6, 6, 5, 4]), new(), Now)
            .Act(carrier.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));

        Assert.Equal(new[] { 6 }, state.Combat.Rolls[carrier.OwnerId]);
        Assert.Equal(new[] { 5, 4, 3 }, state.Combat.Rolls[markedEnemy.OwnerId]);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Participating_Call_suppresses_Black_and_White_on_either_side(bool callAttacks)
    {
        var (state, attacker, defender) = Duel(
            callAttacks ? "call-of-the-siren" : "black-and-white",
            callAttacks ? "black-and-white" : "call-of-the-siren");
        var dice = new ControlledDice([6, 6]);
        new GameRules(state, dice, new(), Now)
            .Act(attacker.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));

        Assert.Null(state.Combat.BlackWhiteResult);
        Assert.Null(state.Combat.BlackWhiteOwnerId);
        Assert.Equal(new[] { 6, 6 }, dice.Sides);
        Assert.Equal(callAttacks ? 6 : 5, Assert.Single(state.Combat.Rolls[attacker.OwnerId]));
        Assert.Equal(callAttacks ? 5 : 6, Assert.Single(state.Combat.Rolls[defender.OwnerId]));
    }
}
