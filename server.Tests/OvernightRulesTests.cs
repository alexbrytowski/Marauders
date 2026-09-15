using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class WhirlpoolDice(int chance) : IDice
    {
        public int ChanceChecks { get; private set; }
        public int Roll(int sides = 6) => sides;
        public int Next(int exclusiveMax)
        {
            if (exclusiveMax == 1000) { ChanceChecks++; return chance; }
            return 0;
        }
    }

    [Fact] public void Saved_duplicate_encounters_resume_as_one_battle_once()
    {
        var s = Playing(); var a = Add(s, 0, Open); var b = Add(s, 1, Offset(Open, 1)); var c = Add(s, 1, Offset(Open, 1, -1));
        s.CombatChoices = [new($"{a.Id}:{b.Id}", a.Id, b.Id, null), new($"{a.Id}:{c.Id}", a.Id, c.Id, null)];
        Assert.True(Rules(s).Expire()); Assert.NotNull(s.Combat); Assert.Empty(s.CombatChoices);
        var id = s.Combat.Id; Assert.False(Rules(s).Expire()); Assert.Equal(id, s.Combat.Id);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public void Same_forces_form_one_battle_but_different_helpers_remain_a_choice(bool differentHelpers)
    {
        var s = Playing(); var a = Add(s, 0, Open);
        Add(s, 0, Offset(Open, -1)); Add(s, 1, Offset(Open, 2)); Add(s, 1, Offset(Open, 2, -1));
        if (differentHelpers) Add(s, 1, Offset(Open, 4));
        s.RemainingMovement = 2;
        Rules(s).Act(a.OwnerId, new("move", ShipId: a.Id, Q: Open.Q + 1, R: Open.R));
        if (differentHelpers) { Assert.Null(s.Combat); Assert.Equal(2, s.CombatChoices.Count); }
        else { Assert.NotNull(s.Combat); Assert.Empty(s.CombatChoices); Assert.Equal(4, s.Combat.ParticipantShipIds.Count); }
    }

    [Fact] public void Mouth_to_feed_capacity_stacks_in_open_water_and_losses_do_not_cancel_builds()
    {
        var s = Playing(); var owner = s.ActivePlayerId!;
        var a = Add(s, 0, Open); a.Perk = "mouth-to-feed";
        Add(s, 0, Offset(Open, 1)).Perk = "mouth-to-feed";
        s.IsBuildPhase = true;
        for (var i = 0; i < 6; i++) Rules(s).Act(owner, new("build", PortId: s.Ports[0].Id));
        Assert.Equal(0, s.AvailableBuilds); Assert.Equal(6, s.Constructions.Count);
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, new("build", PortId: s.Ports[0].Id)));
        a.Perk = null;
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, new("build", PortId: s.Ports[0].Id)));
        Assert.Equal(2, s.Ships.Count); Assert.Equal(6, s.Constructions.Count);
    }

    [Theory] [InlineData(0, true)] [InlineData(99, true)] [InlineData(100, false)] [InlineData(999, false)]
    public void Whirlpool_draw_is_exactly_ten_percent_before_round_fifty_and_spawn_respects_terrain_distance_and_occupancy(int chance, bool spawns)
    {
        var s = Playing(); Add(s, 0, Open); s.PerkPickups.Add(new("loaded-dice", Open.Q + 1, Open.R));
        var dice = new WhirlpoolDice(chance); s.IsBuildPhase = true;
        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("end-turn"));
        Assert.Equal(1, dice.ChanceChecks);
        if (!spawns) { Assert.Null(s.Whirlpool); return; }
        var pair = s.Whirlpool!; Assert.NotNull(pair); Assert.Equal(8, pair.RemainingTurns);
        Assert.True(pair.First.DistanceTo(pair.Second) >= 10);
        foreach (var hex in new[] { pair.First, pair.Second })
        {
            Assert.Equal("water", BoardDefinition.Cell(hex)!.Terrain);
            Assert.DoesNotContain(s.Ships, ship => ship.Hex == hex);
            Assert.DoesNotContain(s.PerkPickups, perk => new Hex(perk.Q, perk.R) == hex);
        }
    }

    [Theory]
    [InlineData(49, 249, false)]
    [InlineData(50, 249, true)]
    [InlineData(50, 250, false)]
    [InlineData(51, 249, true)]
    public void Whirlpool_draw_is_exactly_twenty_five_percent_starting_round_fifty(int turn, int chance, bool spawns)
    {
        var s = Playing(); s.TurnNumber = turn; s.IsBuildPhase = true;
        var dice = new WhirlpoolDice(chance);
        new GameRules(s, dice, new(), Now).Act(s.ActivePlayerId!, new("end-turn"));
        Assert.Equal(1, dice.ChanceChecks);
        Assert.Equal(spawns, s.Whirlpool is not null);
    }

    [Fact] public void Whirlpool_lasts_eight_subsequent_turns_with_no_overlapping_draw_or_expiry_respawn()
    {
        var s = Playing(); var dice = new WhirlpoolDice(0); var rules = new GameRules(s, dice, new(), Now);
        for (var i = 0; i < 4; i++) Add(s, i, BoardDefinition.Harbor(s.Ports[i * 3].Id)[0]);
        s.IsBuildPhase = true; rules.Act(s.ActivePlayerId!, new("end-turn"));
        var pair = s.Whirlpool!;
        for (var i = 1; i <= 8; i++)
        {
            s.IsBuildPhase = true; rules.Act(s.ActivePlayerId!, new("end-turn"));
            Assert.Equal(1, dice.ChanceChecks);
            if (i < 8) { Assert.Same(pair, s.Whirlpool); Assert.Equal(8 - i, pair.RemainingTurns); }
        }
        Assert.Null(s.Whirlpool);
        s.IsBuildPhase = true; rules.Act(s.ActivePlayerId!, new("end-turn"));
        Assert.NotNull(s.Whirlpool); Assert.Equal(2, dice.ChanceChecks);
    }

    [Fact] public void Whirlpool_teleports_for_one_step_retains_movement_and_can_be_exited_without_bouncing()
    {
        var s = Playing(); var ship = Add(s, 0, Open); var entry = Offset(Open, 1); var exit = Offset(Open, -3);
        s.Whirlpool = new() { First = entry, Second = exit, RemainingTurns = 8 }; s.RemainingMovement = 6;
        Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: entry.Q, R: entry.R));
        Assert.Equal(exit, ship.Hex); Assert.Equal(5, s.RemainingMovement);
        Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: exit.Q - 1, R: exit.R));
        Assert.Equal(Offset(exit, -1), ship.Hex); Assert.Equal(4, s.RemainingMovement);
        Assert.Contains(s.Events, e => e.Kind == "whirlpool" && e.Message.Contains("remaining movement"));
    }

    [Fact] public void Whirlpool_entry_is_blocked_by_occupied_exit_and_routes_never_pass_through_endpoints()
    {
        var s = Playing(); var ship = Add(s, 0, Open); var entry = Offset(Open, 1); var exit = Offset(Open, -3);
        var blocker = Add(s, 0, exit); s.Whirlpool = new() { First = entry, Second = exit, RemainingTurns = 8 }; s.RemainingMovement = 2;
        Assert.Throws<RuleException>(() => Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: entry.Q, R: entry.R)));
        s.Ships.Remove(blocker);
        Assert.Throws<RuleException>(() => Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: Open.Q + 2, R: Open.R)));
        Assert.Equal(Open, ship.Hex); Assert.Equal(2, s.RemainingMovement);
    }

    [Fact] public void Whirlpool_arrival_collects_a_perk_dropped_at_the_exit()
    {
        var s = Playing(); var ship = Add(s, 0, Open); var entry = Offset(Open, 1); var exit = Offset(Open, -3);
        s.Whirlpool = new() { First = entry, Second = exit, RemainingTurns = 8 }; s.RemainingMovement = 2;
        s.PerkPickups.Add(new("mouth-to-feed", exit.Q, exit.R));
        Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: entry.Q, R: entry.R));
        Assert.Equal(exit, ship.Hex); Assert.Equal("mouth-to-feed", ship.Perk); Assert.Empty(s.PerkPickups);
    }

    [Fact] public void Whirlpool_checks_combat_at_exit_and_timeout_ages_pair()
    {
        var s = Playing(); var ship = Add(s, 0, Open); var entry = Offset(Open, 1); var exit = Offset(Open, -3);
        Add(s, 1, Offset(exit, -1)); s.Whirlpool = new() { First = entry, Second = exit, RemainingTurns = 8 }; s.RemainingMovement = 6;
        Rules(s).Act(ship.OwnerId, new("move", ShipId: ship.Id, Q: entry.Q, R: entry.R));
        Assert.NotNull(s.Combat); Assert.Equal(exit, ship.Hex); Assert.Equal(5, s.RemainingMovement);
        s.ActionEndsAt = Now.AddSeconds(-1); Assert.True(Rules(s, 6, 1).Expire());
        Assert.Equal(7, s.Whirlpool.RemainingTurns); Assert.NotEqual(ship.OwnerId, s.ActivePlayerId);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public void Forfeit_removes_fleet_neutralizes_ports_clears_involved_combat_and_skips_active_captain(bool active)
    {
        var (s, a, b) = Duel("mouth-to-feed", "black-pearl"); var actor = active ? a.OwnerId : b.OwnerId;
        var turn = s.TurnNumber; var deadline = s.TurnEndsAt;
        s.Constructions.Add(new() { OwnerId = actor, PortId = s.Ports.First(p => p.OwnerId == actor).Id });
        Rules(s).Act(actor, new("forfeit"));
        Assert.DoesNotContain(s.Ships, ship => ship.OwnerId == actor);
        Assert.DoesNotContain(s.Ports, port => port.OwnerId == actor); Assert.Equal(13, s.Ports.Count);
        Assert.Equal(4, s.Ports.Count(p => p.OwnerId is null));
        Assert.Empty(s.Constructions); Assert.Empty(s.PerkPickups); Assert.Null(s.Combat);
        Assert.True(s.Players.Single(p => p.Id == actor).HasForfeited);
        Assert.Equal(active ? turn + 1 : turn, s.TurnNumber);
        if (!active) Assert.Equal(deadline, s.TurnEndsAt);
        Assert.Throws<RuleException>(() => Rules(s).Act(actor, new("roll-movement")));
    }

    [Fact] public void Forfeit_leaves_final_captain_victorious_with_neutral_port_and_lobby_host_can_leave()
    {
        var s = Playing();
        foreach (var player in s.Players.Skip(1)) Rules(s).Act(player.Id, new("forfeit"));
        Assert.Equal("finished", s.Phase); Assert.Equal(s.Players[0].Id, s.WinnerId);
        Assert.Contains(s.Ports, p => p.OwnerId is null); Assert.Null(s.TurnEndsAt); Assert.True(s.RoundHistory.Last().IsFinal);
        s = Lobby(); var host = s.HostPlayerId!; Rules(s).Act(host, new("vote-map", MapId: "narrows"));
        Rules(s).Act(host, new("forfeit")); Assert.Equal(3, s.Players.Count); Assert.Empty(s.MapVotes);
        Assert.Equal(s.Players[0].Id, s.HostPlayerId);
        Rules(s).Join(new("Replacement", GameRules.Colors[0], "navigator")); Assert.Equal(4, s.Players.Count);
    }

    [Fact] public void Draft_forfeit_skips_remaining_picks_and_launches_surviving_fleets()
    {
        var s = LegacyDraft();
        var left = s.ActivePlayerId!; Rules(s).Act(left, new("draft", PortId: s.Ports[0].Id));
        Rules(s).Act(left, new("forfeit"));
        while (s.Phase == "draft") Rules(s).Act(s.ActivePlayerId!, new("draft", PortId: s.Ports.First(p => p.OwnerId is null).Id));
        Assert.Equal("playing", s.Phase); Assert.Equal(18, s.Ships.Count); Assert.Equal(13, s.Ports.Count);
        Assert.DoesNotContain(s.Ships, ship => ship.OwnerId == left); Assert.NotEqual(left, s.ActivePlayerId);
    }

    [Fact] public void Forfeited_port_keeps_harbor_combat_but_has_no_allied_support()
    {
        var s = Playing(); var port = s.Ports[3]; var harbor = BoardDefinition.Harbor(port.Id);
        var aHex = harbor.First(a => harbor.Any(b => a.DistanceTo(b) > 1)); var bHex = harbor.First(b => aHex.DistanceTo(b) > 1);
        var a = Add(s, 0, aHex); var b = Add(s, 2, bHex);
        Assert.True(GameRules.Triggers(a, b, BoardDefinition.Classic, s.Ports));
        Rules(s).Act(s.Players[1].Id, new("forfeit"));
        Assert.True(GameRules.Triggers(a, b, BoardDefinition.Classic, s.Ports));
        Assert.NotNull(s.Combat); Assert.Empty(s.CombatChoices); Assert.Empty(s.Combat.SupportingPortIds);
    }
}
