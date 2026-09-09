using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class ControlledDice(int[] rolls, int chance = 999) : IDice
    {
        private int index;
        public List<int> Sides { get; } = [];
        public int ChanceChecks { get; private set; }
        public int Roll(int sides = 6) { Sides.Add(sides); return rolls[index++ % rolls.Length]; }
        public int Next(int exclusiveMax) { ChanceChecks++; Assert.Equal(1000, exclusiveMax); return chance; }
    }
    private sealed class SeededDice(int seed) : IDice
    {
        private readonly Random random = new(seed);
        public int Roll(int sides = 6) => random.Next(1, sides + 1);
        public int Next(int exclusiveMax) => random.Next(exclusiveMax);
    }
    private static (GameState State, Ship Attacker, Ship Defender) Duel(string? attackerPerk, string? defenderPerk = null)
    {
        var s = Playing(); var a = Add(s, 0, Open); var b = Add(s, 1, Offset(Open, 2));
        a.Perk = attackerPerk; b.Perk = defenderPerk; s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: a.Id, Q: Open.Q + 1, R: Open.R));
        return (s, a, b);
    }

    [Fact] public void Perks_are_collected_along_routes_one_per_ship_with_no_fleet_limit()
    {
        var s = Playing(); var a = Add(s, 0, Open); var b = Add(s, 0, Offset(Open, -2)); s.RemainingMovement = 6;
        s.PerkPickups = [new("glass-cannon", Open.Q + 1, Open.R), new("loaded-dice", Open.Q + 2, Open.R), new("architect", Open.Q - 1, Open.R)];
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: a.Id, Q: Open.Q + 3, R: Open.R));
        Assert.Equal("glass-cannon", a.Perk); Assert.Contains(s.PerkPickups, p => p.Kind == "loaded-dice");
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: b.Id, Q: Open.Q - 1, R: Open.R));
        Assert.Equal("architect", b.Perk); Assert.Single(s.PerkPickups);
    }

    [Theory] [InlineData(1, 0)] [InlineData(8, 7)] [InlineData(9, 8)]
    public void Glass_cannon_rolls_zero_through_eight_publicly(int raw, int expected)
    {
        var (s, a, _) = Duel("glass-cannon"); var dice = new ControlledDice([raw, 6]);
        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(expected, Assert.Single(s.Combat.Rolls[a.OwnerId])); Assert.Equal(new[] { 9, 6 }, dice.Sides);
        Assert.Equal(expected, s.Events.Last(e => e.Kind == "roll").Rolls![a.OwnerId][0]);
    }

    [Theory] [InlineData(1, 3)] [InlineData(2, 3)] [InlineData(3, 3)] [InlineData(6, 6)]
    public void Loaded_dice_changes_exactly_one_and_two(int raw, int expected)
    {
        var (s, a, _) = Duel("loaded-dice"); var dice = new ControlledDice([raw, 5]);
        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(expected, Assert.Single(s.Combat.Rolls[a.OwnerId])); Assert.All(dice.Sides, n => Assert.Equal(6, n));
    }

    [Fact] public void Combat_perks_do_not_change_shared_movement_rolls()
    {
        var s = Playing(); Add(s, 0, Open).Perk = "glass-cannon"; Add(s, 0, Offset(Open, 1)).Perk = "loaded-dice";
        var dice = new ControlledDice([1]); new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-movement"));
        Assert.Equal(1, s.RemainingMovement); Assert.Equal(6, Assert.Single(dice.Sides));
    }

    [Theory] [InlineData(0, true)] [InlineData(74, true)] [InlineData(75, false)] [InlineData(999, false)]
    public void Pearl_conversion_has_exact_threshold_retains_position_and_perk_and_adds_no_actions(int chance, bool converts)
    {
        var (s, a, b) = Duel("black-pearl", "architect"); var originalHex = b.Hex; var actions = s.RemainingActions;
        var dice = new ControlledDice([6, 1], chance); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        rules.Act(b.OwnerId, new("remove-ship", CombatId: s.Combat.Id, ShipId: b.Id));
        Assert.Equal(1, dice.ChanceChecks); Assert.Equal(actions, s.RemainingActions);
        Assert.DoesNotContain(b.Id, s.Combat.ParticipantShipIds); Assert.Equal("resolved", s.Combat.Status);
        if (converts)
        {
            Assert.Contains(b, s.Ships); Assert.Equal(a.OwnerId, b.OwnerId); Assert.Equal(originalHex, b.Hex);
            Assert.Equal("architect", b.Perk); Assert.Equal(s.TurnNumber, b.ConvertedTurnNumber); Assert.Empty(s.PerkPickups);
        }
        else
        {
            Assert.DoesNotContain(b, s.Ships); var drop = Assert.Single(s.PerkPickups);
            Assert.Equal("architect", drop.Kind); Assert.Equal(originalHex, new(drop.Q, drop.R));
        }
    }

    [Fact] public void Pearl_helpers_check_once_and_recruited_helper_does_not_join_fixed_battle_participants()
    {
        var s = Playing(); var a = Add(s, 0, Open); var b = Add(s, 1, Offset(Open, 2));
        Add(s, 0, Offset(Open, -1)).Perk = "black-pearl"; Add(s, 0, Offset(Open, 0, -1)).Perk = "black-pearl";
        var helper = Add(s, 1, Offset(Open, 3)); s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: a.Id, Q: Open.Q + 1, R: Open.R));
        if (s.Combat is null) Rules(s).Act(s.ActivePlayerId!, new("choose-combat", ChoiceId: s.CombatChoices.First(c => c.TriggerShipId == a.Id && c.OpponentShipId == b.Id).Id));
        var dice = new ControlledDice([6, 6, 6, 1, 1], 0); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        rules.Act(helper.OwnerId, new("remove-ship", CombatId: s.Combat.Id, ShipId: helper.Id));
        Assert.Equal(1, dice.ChanceChecks); Assert.Equal(a.OwnerId, helper.OwnerId);
        Assert.Equal("awaiting-roll", s.Combat.Status); Assert.DoesNotContain(helper.Id, s.Combat.ParticipantShipIds);
    }

    [Fact] public void Losing_pearl_drops_without_a_conversion_check_and_can_be_collected_again()
    {
        var (s, a, b) = Duel("black-pearl"); var dice = new ControlledDice([1, 6]); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        rules.Act(a.OwnerId, new("remove-ship", CombatId: s.Combat.Id, ShipId: a.Id));
        Assert.Equal(0, dice.ChanceChecks); Assert.Equal("black-pearl", Assert.Single(s.PerkPickups).Kind);
        s.Combat = null; s.ActivePlayerId = b.OwnerId; s.RemainingMovement = 1;
        rules.Act(b.OwnerId, new("move", ShipId: b.Id, Q: a.Q, R: a.R));
        Assert.Equal("black-pearl", b.Perk); Assert.Empty(s.PerkPickups);
    }

    [Fact] public void Port_attacks_apply_ship_perks_to_helpers_but_keep_port_die_normal()
    {
        var s = Playing(); var port = s.Ports[3]; var cells = BoardDefinition.Harbor(port.Id);
        var a = Add(s, 0, cells[0]); a.Perk = "loaded-dice"; Add(s, 0, cells[1]).Perk = "glass-cannon";
        var dice = new ControlledDice([1, 9, 6]); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(a.OwnerId, new("attack-port", ShipId: a.Id, PortId: port.Id));
        rules.Act(a.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(new[] { 3, 8 }, s.Combat.Rolls[a.OwnerId]); Assert.Equal(new[] { 6, 9, 6 }, dice.Sides);
        Assert.Equal(a.OwnerId, port.OwnerId);
    }

    [Fact] public void Architect_advances_only_current_owned_port_without_stacking_or_same_round_launch()
    {
        var s = Playing(); var owner = s.ActivePlayerId!; var port = s.Ports[0]; var otherPort = s.Ports[1];
        foreach (var cell in BoardDefinition.Harbor(port.Id).Take(2)) Add(s, 0, cell).Perk = "architect";
        var fast = new Construction { OwnerId = owner, PortId = port.Id, StartedTurnNumber = 1, RemainingOwnerTurns = 3 };
        var normal = new Construction { OwnerId = owner, PortId = otherPort.Id, StartedTurnNumber = 1 };
        var fresh = new Construction { OwnerId = owner, PortId = port.Id, StartedTurnNumber = s.TurnNumber };
        s.Constructions = [fast, normal, fresh]; s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.Equal(1, fast.RemainingOwnerTurns); Assert.Equal(1, normal.RemainingOwnerTurns); Assert.Equal(2, fresh.RemainingOwnerTurns);
        var snapshot = Assert.Single(s.RoundHistory); Assert.Equal(2, snapshot.Teams.Single(t => t.PlayerId == owner).Ships);
        Assert.Equal(3, snapshot.Teams.Single(t => t.PlayerId == owner).Ports);
    }

    [Fact] public void Architect_cannot_speed_an_enemy_port_and_launch_is_in_round_snapshot()
    {
        var s = Playing(); var owner = s.ActivePlayerId!; var port = s.Ports[0];
        Add(s, 1, BoardDefinition.Harbor(port.Id)[0]).Perk = "architect";
        s.Constructions.Add(new() { OwnerId = owner, PortId = port.Id, StartedTurnNumber = 1 }); s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.Equal(1, Assert.Single(s.Constructions).RemainingOwnerTurns);
        s.ActivePlayerId = owner; s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.Empty(s.Constructions); Assert.Equal(1, s.RoundHistory.Last().Teams.Single(t => t.PlayerId == owner).Ships);
    }

    [Fact] public void Round_history_records_timeouts_and_final_capture_without_mutable_references()
    {
        var s = Playing(); Add(s, 0, Open); s.TurnEndsAt = Now.AddSeconds(-1);
        Assert.True(Rules(s).Expire()); var before = Assert.Single(s.RoundHistory); Assert.False(before.IsFinal);
        s.Ships.Clear(); Assert.Equal(1, before.Teams[0].Ships);
        s = Playing(); var owner = s.ActivePlayerId!; foreach (var p in s.Ports) p.OwnerId = owner;
        var last = s.Ports.Last(); last.OwnerId = null; var attacker = Add(s, 0, BoardDefinition.Harbor(last.Id)[0]);
        Rules(s).Act(owner, new("attack-port", ShipId: attacker.Id, PortId: last.Id));
        Rules(s, 6, 1).Act(owner, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("finished", s.Phase); var final = Assert.Single(s.RoundHistory); Assert.True(final.IsFinal);
        Assert.Equal(13, final.Teams[0].Ports); Assert.Equal(1, final.Teams[0].Ships);
    }

    [Fact] public void Random_layouts_are_open_balanced_spread_out_and_vary_across_games()
    {
        var layouts = new HashSet<string>();
        for (var seed = 0; seed < 40; seed++)
        {
            var s = Lobby();
            var pickups = PerkPlacement.Create(s, new SeededDice(seed));
            Assert.Equal(PerkPlacement.Kinds.Order(), pickups.Select(p => p.Kind).Order());
            var hexes = pickups.Select(p => new Hex(p.Q, p.R)).ToArray();
            foreach (var h in hexes)
            {
                Assert.Equal("water", BoardDefinition.Cell(h)!.Terrain);
                var distances = s.Ports.Select(p => PerkPlacement.Distance(p.Id, h)).Order().ToArray();
                Assert.True(distances[0] >= 3); Assert.InRange(distances[1] - distances[0], 0, 1);
                Assert.All(hexes.Where(other => other != h), other => Assert.True(h.DistanceTo(other) >= 6));
            }
            layouts.Add(string.Join(';', pickups));
        }
        Assert.True(layouts.Count > 30);
    }
}
