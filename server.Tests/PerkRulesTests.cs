using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class ControlledDice(int[] rolls, int draw = 5) : IDice
    {
        private int index;
        public List<int> Sides { get; } = [];
        public int ChanceChecks { get; private set; }
        public int Roll(int sides = 6) { Sides.Add(sides); return rolls[index++ % rolls.Length]; }
        public int Next(int exclusiveMax) { ChanceChecks++; Assert.Equal(6, exclusiveMax); return draw; }
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
        s.PerkPickups = [new("glass-cannon", Open.Q + 1, Open.R), new("loaded-dice", Open.Q + 2, Open.R), new("mouth-to-feed", Open.Q - 1, Open.R)];
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: a.Id, Q: Open.Q + 3, R: Open.R));
        Assert.Equal("glass-cannon", a.Perk); Assert.Contains(s.PerkPickups, p => p.Kind == "loaded-dice");
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: b.Id, Q: Open.Q - 1, R: Open.R));
        Assert.Equal("mouth-to-feed", b.Perk); Assert.Single(s.PerkPickups);
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
        Rules(s).Act(s.ActivePlayerId!, new("roll-movement"));
        Assert.Equal(4, s.RemainingMovement);
    }

    [Theory] [InlineData(1, "black", true)] [InlineData(2, "white", false)]
    public void Black_and_white_replaces_all_dice_with_one_even_public_draw(int draw, string result, bool holderWins)
    {
        var (s, holder, opponent) = Duel("black-and-white"); var dice = new ControlledDice([draw]);
        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(new[] { 2 }, dice.Sides); Assert.All(s.Combat.Rolls.Values, Assert.Empty);
        Assert.Equal(result, s.Combat.BlackWhiteResult); Assert.Equal(holder.OwnerId, s.Combat.BlackWhiteOwnerId);
        Assert.Equal(holderWins ? holder.OwnerId : opponent.OwnerId, s.Combat.WinnerId);
        var publicDraw = s.Events.Last(e => e.Kind == "roll");
        Assert.Null(publicDraw.Rolls); Assert.Equal(result, publicDraw.BlackWhiteResult);
        Assert.Equal(holder.OwnerId, publicDraw.BlackWhiteOwnerId); Assert.Contains(result, publicDraw.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Theory] [InlineData(true)] [InlineData(false)]
    public void Mark_of_the_Kraken_suppresses_opposing_Black_and_White(bool markAttacks)
    {
        var (s, attacker, defender) = Duel(
            markAttacks ? "mark-of-the-kraken" : "black-and-white",
            markAttacks ? "black-and-white" : "mark-of-the-kraken");
        var dice = new ControlledDice([6, 1, 2, 3]);

        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));

        Assert.Null(s.Combat.BlackWhiteResult); Assert.Null(s.Combat.BlackWhiteOwnerId);
        Assert.All(dice.Sides, sides => Assert.Equal(6, sides)); Assert.Equal(4, dice.Sides.Count);
        Assert.Equal(markAttacks ? 3 : 1, s.Combat.Rolls[attacker.OwnerId].Count);
        Assert.Equal(markAttacks ? 1 : 3, s.Combat.Rolls[defender.OwnerId].Count);
    }

    [Fact]
    public void Mark_helper_suppresses_Black_and_White_on_its_own_fleet()
    {
        var s = Playing(); var trigger = Add(s, 0, Open); Add(s, 1, Offset(Open, 2));
        trigger.Perk = "black-and-white";
        var markedHelper = Add(s, 0, Offset(Open, -1)); markedHelper.Perk = "mark-of-the-kraken";
        s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        var dice = new ControlledDice([1, 2, 3, 4, 5]);

        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));

        Assert.Null(s.Combat.BlackWhiteResult); Assert.Null(s.Combat.BlackWhiteOwnerId);
        Assert.All(dice.Sides, sides => Assert.Equal(6, sides)); Assert.Equal(5, dice.Sides.Count);
        Assert.Equal(4, s.Combat.Rolls[trigger.OwnerId].Count);
    }

    [Fact] public void Removing_the_black_and_white_helper_restores_normal_dice_for_the_next_exchange()
    {
        var s = Playing(); var trigger = Add(s, 0, Open); var opponent = Add(s, 1, Offset(Open, 2));
        var holder = Add(s, 0, Offset(Open, -1)); holder.Perk = "black-and-white"; s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        if (s.Combat is null) Rules(s).Act(s.ActivePlayerId!, new("choose-combat", ChoiceId: s.CombatChoices.First().Id));
        var dice = new ControlledDice([2, 6, 1]); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("white", s.Combat.BlackWhiteResult); Assert.Equal(trigger.OwnerId, s.Combat.LosingPlayerId);
        rules.Act(holder.OwnerId, new("remove-ship", CombatId: s.Combat.Id, ShipId: holder.Id));
        Assert.Equal("awaiting-roll", s.Combat.Status);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Null(s.Combat.BlackWhiteResult); Assert.Null(s.Combat.BlackWhiteOwnerId);
        Assert.Equal(new[] { 6 }, s.Combat.Rolls[trigger.OwnerId]); Assert.Equal(new[] { 1 }, s.Combat.Rolls[opponent.OwnerId]);
        Assert.Equal(new[] { 2, 6, 6 }, dice.Sides);
    }

    [Theory] [InlineData(1, true)] [InlineData(2, false)]
    public void Black_and_white_overrides_port_dice_and_defense_modifiers(int draw, bool captures)
    {
        var s = Playing(); var port = s.Ports[3]; var attacker = Add(s, 0, BoardDefinition.Harbor(port.Id)[0]);
        attacker.Perk = "black-and-white"; port.DefenseWeakness = 10;
        var originalOwner = port.OwnerId; var dice = new ControlledDice([draw]); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(attacker.OwnerId, new("attack-port", ShipId: attacker.Id, PortId: port.Id));
        rules.Act(attacker.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(new[] { 2 }, dice.Sides); Assert.All(s.Combat.Rolls.Values, Assert.Empty);
        Assert.Equal(captures ? attacker.OwnerId : originalOwner, port.OwnerId);
        Assert.Equal(captures ? 0 : 11, port.DefenseWeakness);
    }

    [Theory] [InlineData(0, true)] [InlineData(1, false)] [InlineData(5, false)]
    public void Pearl_conversion_uses_exact_one_in_six_draw_and_retains_ship_details(int draw, bool converts)
    {
        var (s, a, b) = Duel("black-pearl", "mouth-to-feed"); var originalHex = b.Hex; var actions = s.RemainingActions;
        var dice = new ControlledDice([6, 1], draw); var rules = new GameRules(s, dice, new(), Now);
        rules.Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(1, dice.ChanceChecks); Assert.Equal(actions, s.RemainingActions);
        Assert.Contains(s.Events, e => e.Kind == "perk" && e.Message.Contains($"{draw + 1}/6"));
        Assert.Contains("automatically", s.Combat!.Message);
        var snapshot = Assert.Single(s.Combat.Ships, ship => ship.Id == b.Id);
        Assert.Equal("mouth-to-feed", snapshot.Perk); Assert.Equal(originalHex, new(snapshot.Q, snapshot.R));
        Assert.NotEqual(a.OwnerId, snapshot.OwnerId);
        Assert.DoesNotContain(b.Id, s.Combat.ParticipantShipIds); Assert.Equal("resolved", s.Combat.Status);
        if (converts)
        {
            Assert.Contains(b, s.Ships); Assert.Equal(a.OwnerId, b.OwnerId); Assert.Equal(originalHex, b.Hex);
            Assert.Equal("mouth-to-feed", b.Perk); Assert.Equal(s.TurnNumber, b.ConvertedTurnNumber); Assert.Empty(s.PerkPickups);
        }
        else
        {
            Assert.DoesNotContain(b, s.Ships); var drop = Assert.Single(s.PerkPickups);
            Assert.Equal("mouth-to-feed", drop.Kind); Assert.Equal(originalHex, new(drop.Q, drop.R));
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

    [Fact] public void Mouth_to_feed_does_not_speed_construction_or_launch_fresh_builds()
    {
        var s = Playing(); var owner = s.ActivePlayerId!; var port = s.Ports[0]; var otherPort = s.Ports[1];
        foreach (var cell in BoardDefinition.Harbor(port.Id).Take(2)) Add(s, 0, cell).Perk = "mouth-to-feed";
        var fast = new Construction { OwnerId = owner, PortId = port.Id, StartedTurnNumber = 1, RemainingOwnerTurns = 3 };
        var normal = new Construction { OwnerId = owner, PortId = otherPort.Id, StartedTurnNumber = 1 };
        var fresh = new Construction { OwnerId = owner, PortId = port.Id, StartedTurnNumber = s.TurnNumber };
        s.Constructions = [fast, normal, fresh]; s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.Equal(2, fast.RemainingOwnerTurns); Assert.Equal(1, normal.RemainingOwnerTurns); Assert.Equal(2, fresh.RemainingOwnerTurns);
        var snapshot = Assert.Single(s.RoundHistory); Assert.Equal(2, snapshot.Teams.Single(t => t.PlayerId == owner).Ships);
        Assert.Equal(3, snapshot.Teams.Single(t => t.PlayerId == owner).Ports);
    }

    [Fact] public void Mouth_to_feed_at_an_enemy_port_does_not_change_construction_timing()
    {
        var s = Playing(); var owner = s.ActivePlayerId!; var port = s.Ports[0];
        Add(s, 1, BoardDefinition.Harbor(port.Id)[0]).Perk = "mouth-to-feed";
        var build = new Construction { OwnerId = owner, PortId = port.Id, StartedTurnNumber = 1 };
        s.Constructions.Add(build); s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.Equal(1, build.RemainingOwnerTurns);
        s.ActivePlayerId = owner; s.IsBuildPhase = true;
        Rules(s).Act(owner, new("end-turn"));
        Assert.DoesNotContain(build, s.Constructions);
        Assert.True(s.IsEndingRound); Assert.NotNull(s.Combat);
        Rules(s, 6, 1).Act(owner, new("roll-combat", CombatId: s.Combat.Id));
        Rules(s).Act(owner, new("continue-combat", CombatId: s.Combat.Id));
        Assert.Equal(1, s.RoundHistory.Last().Teams.Single(t => t.PlayerId == owner).Ships);
    }

    [Fact] public void Round_history_records_timeouts_and_final_capture_without_mutable_references()
    {
        var s = Playing(); Add(s, 0, Open); s.TurnEndsAt = Now.AddSeconds(-1);
        Assert.True(Rules(s).Expire()); var before = Assert.Single(s.RoundHistory); Assert.False(before.IsFinal);
        s.Ships.Clear(); Assert.Equal(1, before.Teams[0].Ships);
        s = Playing(); var owner = s.ActivePlayerId!; foreach (var p in s.Ports) p.OwnerId = owner;
        var last = s.Ports.Last(); last.OwnerId = s.Players[1].Id; var attacker = Add(s, 0, BoardDefinition.Harbor(last.Id)[0]);
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
