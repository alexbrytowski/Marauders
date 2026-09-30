using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    [Theory]
    [InlineData("classic")]
    [InlineData("narrows")]
    [InlineData("shattered-isles")]
    public void Cam_and_remote_Ear_Plugs_spawn_on_each_map_without_overlaps(string mapId)
    {
        var state = Lobby();
        Rules(state).Act(state.HostPlayerId!, new("vote-map", MapId: mapId));
        ReadyCrew(state);
        var board = MapCatalog.Get(mapId).Board;
        var siren = Assert.IsType<SirenState>(state.Siren);
        Assert.True(siren.Alive);
        Assert.Equal("water", board.Cell(siren.Hex)!.Terrain);
        Assert.All(board.Ports, port => Assert.True(siren.Hex.DistanceTo(board.PortHex(port.Id)) > 3));
        Assert.All(state.PerkPickups, perk => Assert.True(siren.Hex.DistanceTo(new(perk.Q, perk.R)) > 3));
        var plugs = Assert.Single(state.PerkPickups, perk => perk.Kind == "ear-plugs");
        var plugHex = new Hex(plugs.Q, plugs.R);
        Assert.True(siren.Hex.DistanceTo(plugHex) >= 10);
        Assert.All(BoardMap.Adjacent(plugHex), neighbor => Assert.Equal("water", board.Cell(neighbor)?.Terrain));
        var farthestTen = board.Cells.Where(cell => cell.Terrain == "water" &&
            cell.Hex.DistanceTo(siren.Hex) >= 10 &&
            BoardMap.Adjacent(cell.Hex).All(neighbor => board.Cell(neighbor)?.Terrain == "water") &&
            !state.Ships.Any(ship => ship.Hex == cell.Hex))
            .OrderByDescending(cell => cell.Hex.DistanceTo(siren.Hex))
            .ThenBy(cell => cell.R).ThenBy(cell => cell.Q).Take(10).Select(cell => cell.Hex).ToArray();
        Assert.Contains(plugHex, farthestTen);
        Assert.DoesNotContain(state.Ships, ship => ship.Hex == siren.Hex);
        var kraken = KrakenPlacement.Spawn(state, new FixedDice());
        Assert.True(kraken.Hex.DistanceTo(siren.Hex) > KrakenPlacement.Reach + SirenPlacement.Reach);
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
}
