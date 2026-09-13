using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class PlaythroughDice(int[] rolls, int choice = 0) : IDice
    {
        private readonly Queue<int> values = new(rolls);
        public List<int> DrawSizes { get; } = [];
        public int Roll(int sides = 6)
        {
            var value = values.Dequeue(); Assert.InRange(value, 1, sides); return value;
        }
        public int Next(int exclusiveMax)
        {
            DrawSizes.Add(exclusiveMax); Assert.InRange(choice, 0, exclusiveMax - 1); return choice;
        }
    }

    [Theory] [InlineData(0, 4)] [InlineData(1, 5)] [InlineData(2, 6)]
    public void Movement_uses_three_equal_outcomes_and_spends_one_action(int choice, int expected)
    {
        var s = Playing(); Add(s, 0, Open).Perk = "cheat-death";
        var random = new PlaythroughDice([], choice);
        new GameRules(s, random, new(), Now).Act(s.ActivePlayerId!, new("roll-movement"));
        Assert.Equal(new[] { 3 }, random.DrawSizes);
        Assert.Equal(expected, s.LastRoll); Assert.Equal(expected, s.RemainingMovement);
        Assert.Equal(1, s.RemainingActions); Assert.Equal("cheat-death", s.Ships[0].Perk);
        Assert.Equal(expected, s.Events.Last().Rolls![s.ActivePlayerId!][0]);
    }

    [Theory] [InlineData("classic", "port-7")] [InlineData("narrows", "port-12")] [InlineData("shattered-isles", "port-13")]
    public void Random_deals_preserve_central_neutral_port_equal_fleets_and_vary_ownership(string mapId, string neutral)
    {
        var deals = new HashSet<string>();
        for (var seed = 0; seed < 12; seed++)
        {
            var s = Lobby(); Rules(s).Act(s.HostPlayerId!, new("vote-map", MapId: mapId));
            ReadyCrew(s, s.Players[2].Id, new(s, new SeededDice(seed), new(), Now));
            Assert.Equal("playing", s.Phase); Assert.Equal(s.Players[2].Id, s.ActivePlayerId);
            Assert.Equal(neutral, Assert.Single(s.Ports, p => p.OwnerId is null).Id);
            Assert.All(s.Players, p => { Assert.Equal(3, s.Ports.Count(port => port.OwnerId == p.Id)); Assert.Equal(6, s.Ships.Count(ship => ship.OwnerId == p.Id)); });
            Assert.All(s.Ports.Where(p => p.OwnerId is not null), p => Assert.Equal(2, s.Ships.Count(ship => ship.PortId == p.Id && ship.OwnerId == p.OwnerId)));
            Assert.DoesNotContain(s.Ships, ship => ship.PortId == neutral);
            Assert.Equal(6, s.PerkPickups.Select(p => p.Kind).Distinct().Count());
            Assert.Null(s.Combat); Assert.Empty(s.CombatChoices);
            deals.Add(string.Join(',', s.Ports.Select(p => s.Players.FindIndex(player => player.Id == p.OwnerId))));
        }
        Assert.True(deals.Count > 1);
    }

    private static void StartEncounter(GameState state, Ship a, Ship b)
    {
        var choice = new CombatChoice("range-check", a.Id, b.Id, null);
        state.CombatChoices = [choice];
        Rules(state).Act(state.ActivePlayerId!, new("choose-combat", ChoiceId: choice.Id));
    }

    [Theory] [InlineData(0, true)] [InlineData(1, false)] [InlineData(2, false)] [InlineData(-1, false)]
    public void Port_supports_its_own_trigger_at_two_hexes_even_when_opponent_is_outside_range(int owner, bool supports)
    {
        var s = Playing(); var port = s.Ports[0];
        port.OwnerId = owner < 0 ? null : s.Players[owner].Id;
        var portHex = BoardDefinition.PortHex(port.Id);
        var aHex = BoardDefinition.Cells.First(c => c.Terrain == "water" && c.Hex.DistanceTo(portHex) == 2 &&
            BoardDefinition.Neighbors(c.Hex).Any(h => h.DistanceTo(portHex) == 3)).Hex;
        var bHex = BoardDefinition.Neighbors(aHex).First(h => h.DistanceTo(portHex) == 3);
        var a = Add(s, 0, aHex); var b = Add(s, 1, bHex);
        StartEncounter(s, a, b);
        Assert.Equal(supports, s.Combat!.SupportingPortIds.Contains(port.Id));
        Rules(s, supports ? [1, 5, 6] : [1, 5]).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal(supports ? 2 : 1, s.Combat.Rolls[a.OwnerId].Count);
        Assert.Equal(supports ? a.OwnerId : b.OwnerId, s.Combat.WinnerId);
        Assert.Contains(port, s.Ports);
    }

    [Fact] public void Port_support_does_not_chain_through_helpers_at_three_hexes()
    {
        var s = Playing(); var port = s.Ports[0]; var portHex = BoardDefinition.PortHex(port.Id);
        var aHex = BoardDefinition.Cells.First(c => c.Terrain == "water" && c.Hex.DistanceTo(portHex) == 3 &&
            BoardDefinition.Neighbors(c.Hex).Any(h => h.DistanceTo(portHex) == 4) &&
            BoardDefinition.Neighbors(c.Hex).Any(h => h.DistanceTo(portHex) == 2)).Hex;
        var a = Add(s, 0, aHex);
        var b = Add(s, 1, BoardDefinition.Neighbors(aHex).First(h => h.DistanceTo(portHex) == 4));
        var helper = Add(s, 0, BoardDefinition.Neighbors(aHex).First(h => h.DistanceTo(portHex) == 2));
        StartEncounter(s, a, b);
        Assert.Contains(helper.Id, s.Combat!.ParticipantShipIds);
        Assert.DoesNotContain(port.Id, s.Combat.SupportingPortIds);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public void Cheat_death_rerolls_before_any_casualty_for_attacker_or_defender(bool defending)
    {
        var (s, a, b) = Duel(defending ? null : "cheat-death", defending ? "cheat-death" : null);
        var holder = defending ? b : a; var opponent = defending ? a : b;
        var random = new PlaythroughDice(defending ? [6, 1, 1, 6] : [1, 6, 6, 1]);
        new GameRules(s, random, new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(2, s.Combat.Round); Assert.Equal(holder.OwnerId, s.Combat.WinnerId);
        Assert.Contains(holder, s.Ships); Assert.DoesNotContain(opponent, s.Ships); Assert.Null(holder.Perk);
        Assert.Null(s.Combat.Ships.Single(ship => ship.Id == holder.Id).Perk);
        var pickup = Assert.Single(s.PerkPickups); Assert.Equal("cheat-death", pickup.Kind);
        Assert.Equal("water", BoardDefinition.Cell(new(pickup.Q, pickup.R))!.Terrain);
        Assert.DoesNotContain(s.Ships, ship => ship.Hex == new Hex(pickup.Q, pickup.R));
        Assert.Equal(2, s.Events.Count(e => e.Kind == "roll"));
        Assert.Single(s.Events, e => e.Kind == "casualty" && e.Message.Contains("lost ship"));
        Assert.Contains("Cheat Death", s.Combat.Message);
    }

    [Fact] public void Cheat_death_is_spent_once_and_second_loss_applies_normally()
    {
        var (s, a, b) = Duel("cheat-death");
        new GameRules(s, new PlaythroughDice([1, 6, 1, 6]), new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.DoesNotContain(a, s.Ships); Assert.Contains(b, s.Ships);
        Assert.Equal(2, s.Combat.Round); Assert.Single(s.PerkPickups); Assert.Null(a.Perk);
    }

    [Theory] [InlineData(4, 4)] [InlineData(6, 1)]
    public void Cheat_death_is_not_consumed_on_a_tie_or_win(int aRoll, int bRoll)
    {
        var (s, a, _) = Duel("cheat-death");
        new GameRules(s, new PlaythroughDice([aRoll, bRoll]), new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("cheat-death", a.Perk); Assert.Empty(s.PerkPickups); Assert.Equal(1, s.Combat.Round);
    }

    [Fact] public void Cheat_death_helper_rerolls_the_whole_team_before_casualty_selection()
    {
        var s = Playing(); var a = Add(s, 0, Open); var helper = Add(s, 0, Offset(Open, -2));
        helper.Perk = "cheat-death"; var b = Add(s, 1, Offset(Open, 1));
        StartEncounter(s, a, b);
        new GameRules(s, new PlaythroughDice([1, 1, 6, 6, 1, 2]), new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Null(helper.Perk); Assert.Contains(a, s.Ships); Assert.Contains(helper, s.Ships);
        Assert.DoesNotContain(b, s.Ships); Assert.Equal(2, s.Combat.Round);
        Assert.Equal(new[] { 6, 1 }, s.Combat.Rolls[a.OwnerId]);
    }

    [Theory] [InlineData(true)] [InlineData(false)]
    public void Cheat_death_port_attack_applies_only_the_rerolled_capture_or_weakness(bool captures)
    {
        var s = Playing(); var port = s.Ports[3]; var originalOwner = port.OwnerId;
        var a = Add(s, 0, BoardDefinition.Harbor(port.Id)[0]); a.Perk = "cheat-death";
        Rules(s).Act(a.OwnerId, new("attack-port", ShipId: a.Id, PortId: port.Id));
        new GameRules(s, new PlaythroughDice(captures ? [1, 6, 6, 1] : [1, 6, 1, 6]), new(), Now)
            .Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(captures ? a.OwnerId : originalOwner, port.OwnerId);
        Assert.Equal(captures ? 0 : 1, port.DefenseWeakness);
        Assert.Contains(a, s.Ships); Assert.Null(a.Perk); Assert.Equal(1, s.RemainingActions);
    }

    [Fact] public void Cheat_death_rerolls_black_and_white_and_prevents_the_original_loss()
    {
        var (s, a, b) = Duel("black-and-white", "cheat-death");
        new GameRules(s, new PlaythroughDice([1, 2]), new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Contains(b, s.Ships); Assert.DoesNotContain(a, s.Ships); Assert.Null(b.Perk);
        Assert.Equal("white", s.Combat.BlackWhiteResult); Assert.Equal(2, s.Combat.Round);
        Assert.Equal(new[] { "black", "white" }, s.Events.Where(e => e.Kind == "roll").Select(e => e.BlackWhiteResult));
        Assert.All(s.Combat.Rolls.Values, Assert.Empty);
    }

    [Fact] public void Cheat_death_can_return_a_tie_without_consuming_another_perk_or_recruiting()
    {
        var (s, a, b) = Duel("black-pearl", "cheat-death");
        var random = new PlaythroughDice([6, 1, 3, 3]);
        new GameRules(s, random, new(), Now).Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Contains(a, s.Ships); Assert.Contains(b, s.Ships);
        Assert.Equal("awaiting-roll", s.Combat.Status); Assert.Null(s.Combat.WinnerId); Assert.Null(s.Combat.LosingPlayerId);
        Assert.DoesNotContain(1000, random.DrawSizes); Assert.Single(s.PerkPickups);
    }

    [Fact] public void Respawn_avoids_ships_pickups_and_whirlpool_endpoints()
    {
        var s = Playing(); var cells = BoardDefinition.Cells.Where(c => c.Terrain == "water").Take(5).ToArray();
        Add(s, 0, cells[0].Hex); s.PerkPickups = [new("loaded-dice", cells[1].Q, cells[1].R)];
        s.Whirlpool = new() { First = cells[2].Hex, Second = cells[3].Hex, RemainingTurns = 8 };
        var pickup = PerkPlacement.Respawn("cheat-death", s, new PlaythroughDice([]));
        Assert.Equal(cells[4].Hex, new(pickup.Q, pickup.R));
    }

    [Fact] public void Forfeited_ports_reset_defense_and_can_be_captured_normally()
    {
        var s = Playing(); var port = s.Ports[3]; port.DefenseWeakness = 7;
        var ship = Add(s, 0, BoardDefinition.Harbor(port.Id)[0]);
        Rules(s).Act(s.Players[1].Id, new("forfeit"));
        Assert.Contains(port, s.Ports); Assert.Null(port.OwnerId); Assert.Equal(0, port.DefenseWeakness);
        Rules(s).Act(ship.OwnerId, new("attack-port", ShipId: ship.Id, PortId: port.Id));
        Rules(s, 6, 1).Act(ship.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(ship.OwnerId, port.OwnerId); Assert.Equal(13, s.Ports.Count);
    }
}
