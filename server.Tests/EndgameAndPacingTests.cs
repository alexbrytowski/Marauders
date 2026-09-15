using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class BuildDice : IDice
    {
        public List<int> PortDraws { get; } = [];
        public int Roll(int sides = 6) => sides;
        public int Next(int exclusiveMax)
        {
            if (exclusiveMax == 1000) return 999; // No whirlpool in these scenarios.
            var result = PortDraws.Count % exclusiveMax;
            PortDraws.Add(result);
            return result;
        }
    }

    [Fact] public void Final_opponent_forfeit_wins_with_neutral_ports_and_eliminated_captains_still_seated()
    {
        var s = Playing(); var winner = s.Players[0].Id;
        foreach (var port in s.Ports) port.OwnerId = null;
        s.Ports[0].OwnerId = winner; s.Ports[3].OwnerId = s.Players[1].Id;
        Add(s, 0, Open); Add(s, 1, Offset(Open, 1));
        s.CombatChoices = [new("pending", s.Ships[0].Id, s.Ships[1].Id, null)];
        s.ActivePlayerId = s.Players[1].Id;
        Rules(s).Act(s.Players[1].Id, new("forfeit"));
        Assert.Equal("finished", s.Phase); Assert.Equal(winner, s.WinnerId);
        Assert.Equal(3, s.Players.Count(p => !p.HasForfeited));
        Assert.Equal(12, s.Ports.Count(p => p.OwnerId is null));
        Assert.Empty(s.Constructions); Assert.Empty(s.CombatChoices); Assert.Null(s.Combat);
        Assert.Null(s.TurnEndsAt); Assert.Null(s.ActionEndsAt);
        Assert.True(Assert.Single(s.RoundHistory).IsFinal); Assert.False(Rules(s).Expire());
    }

    [Fact] public void Eliminating_one_opponent_does_not_win_while_another_owns_ports()
    {
        var s = Playing(); var target = s.Ports[3];
        s.Ports[4].OwnerId = s.Ports[5].OwnerId = s.Players[0].Id;
        var ship = Add(s, 0, BoardDefinition.Harbor(target.Id)[0]);
        Rules(s).Act(ship.OwnerId, new("attack-port", PortId: target.Id, ShipId: ship.Id));
        Rules(s, 6, 1).Act(ship.OwnerId, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("playing", s.Phase); Assert.Null(s.WinnerId); Assert.Empty(s.RoundHistory);
    }

    [Fact] public void Draft_does_not_eliminate_captains_who_have_not_picked_yet()
    {
        var s = LegacyDraft();
        Rules(s).Act(s.ActivePlayerId!, new("draft", PortId: s.Ports[0].Id));
        Rules(s).Act(s.Players[3].Id, new("forfeit"));
        Assert.Equal("draft", s.Phase); Assert.Null(s.WinnerId); Assert.False(Rules(s).Expire());
        Rules(s).Act(s.Players[2].Id, new("forfeit"));
        Rules(s).Act(s.Players[0].Id, new("forfeit"));
        Assert.Equal("finished", s.Phase); Assert.Equal(s.Players[1].Id, s.WinnerId);
    }

    [Fact] public void Finishing_fills_only_unused_slots_preserving_manual_builds_and_normal_launch_timing()
    {
        var s = Playing(); var owner = s.ActivePlayerId!;
        Add(s, 0, Open).Perk = "mouth-to-feed";
        var due = new Construction { OwnerId = owner, PortId = s.Ports[0].Id, StartedTurnNumber = 1, RemainingOwnerTurns = 1 };
        s.Constructions.Add(due); s.IsBuildPhase = true;
        Rules(s).Act(owner, new("build", PortId: s.Ports[2].Id));
        var manual = s.Constructions.Last();
        var random = new BuildDice();
        new GameRules(s, random, new(), Now).Act(owner, new("end-turn"));
        Assert.Equal(new[] { 0, 1, 2, 0 }, random.PortDraws);
        Assert.Contains(manual, s.Constructions); Assert.Equal(s.Ports[2].Id, manual.PortId);
        Assert.DoesNotContain(due, s.Constructions);
        Assert.Equal(2, s.Ships.Count(sh => sh.OwnerId == owner));
        Assert.Equal(5, s.Constructions.Count(b => b.OwnerId == owner));
        Assert.All(s.Constructions.Where(b => b.OwnerId == owner), b =>
        {
            Assert.Equal(5, b.StartedTurnNumber); Assert.Equal(2, b.RemainingOwnerTurns);
            Assert.Equal(owner, s.Ports.Single(p => p.Id == b.PortId).OwnerId);
        });
        Assert.Equal(4, s.Events.Count(e => e.Kind == "construction" && e.Message.Contains("automatically")));
    }

    [Theory] [InlineData(65, 2)] [InlineData(66, 3)]
    public void New_construction_slows_at_round_66_without_retiming_existing_builds(int turn, int expectedOwnerTurns)
    {
        var s = Playing(); var owner = s.ActivePlayerId!; s.TurnNumber = turn; s.IsBuildPhase = true;
        var existing = new Construction
        {
            OwnerId = owner, PortId = s.Ports[0].Id, StartedTurnNumber = 1, RemainingOwnerTurns = 2
        };
        s.Constructions.Add(existing);

        Rules(s).Act(owner, new("build", PortId: s.Ports[1].Id));
        var manual = s.Constructions.Last();
        Rules(s).Act(owner, new("end-turn"));

        Assert.Equal(1, existing.RemainingOwnerTurns);
        Assert.Equal(expectedOwnerTurns, manual.RemainingOwnerTurns);
        Assert.All(s.Constructions.Where(b => b.StartedTurnNumber == turn),
            b => Assert.Equal(expectedOwnerTurns, b.RemainingOwnerTurns));
        Assert.Contains(s.Events, e => e.Kind == "construction" &&
            e.Message.Contains($"ready in {expectedOwnerTurns} owner rounds"));
    }

    [Theory] [InlineData(57, 58, "starting in eight rounds")] [InlineData(65, 66, "now active")]
    public void Shipyard_pacing_change_is_announced_in_the_captains_log(int endingTurn, int announcedTurn, string message)
    {
        var s = Playing(); s.TurnNumber = endingTurn; s.IsBuildPhase = true;
        foreach (var hex in BoardDefinition.Cells.Where(c => c.Terrain == "water").Take(6)) Add(s, 0, hex.Hex);

        Rules(s).Act(s.ActivePlayerId!, new("end-turn"));

        Assert.Equal(announcedTurn, s.TurnNumber);
        Assert.Contains(s.Events, e => e.Turn == announcedTurn && e.Kind == "construction" && e.Message.Contains(message));
    }

    [Theory] [InlineData(45, 46, "starting in four rounds")] [InlineData(49, 50, "now active")]
    public void Whirlpool_surge_is_announced_in_the_captains_log(int endingTurn, int announcedTurn, string message)
    {
        var s = Playing(); s.TurnNumber = endingTurn; s.IsBuildPhase = true;

        Rules(s).Act(s.ActivePlayerId!, new("end-turn"));

        Assert.Equal(announcedTurn, s.TurnNumber);
        Assert.Contains(s.Events, e => e.Turn == announcedTurn && e.Kind == "whirlpool" && e.Message.Contains(message));
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public void Either_timeout_automatically_rebuilds_even_before_construction_selection(bool turnExpired)
    {
        var s = Playing(); var owner = s.ActivePlayerId!; Add(s, 0, Open);
        s.RemainingMovement = 4;
        if (turnExpired) s.TurnEndsAt = Now; else s.ActionEndsAt = Now;
        Assert.True(Rules(s).Expire());
        var builds = s.Constructions.Where(b => b.OwnerId == owner).ToArray();
        Assert.Equal(5, builds.Length); Assert.All(builds, b => Assert.Equal(2, b.RemainingOwnerTurns));
        Assert.Single(s.Ships); Assert.Equal(s.Players[1].Id, s.ActivePlayerId);
        Assert.False(Rules(s).Expire()); Assert.Equal(builds, s.Constructions.Where(b => b.OwnerId == owner));
    }

    [Theory] [InlineData(6)] [InlineData(8)]
    public void Full_or_over_capacity_fleets_never_get_automatic_builds(int fleet)
    {
        var s = Playing(); var owner = s.ActivePlayerId!;
        foreach (var hex in BoardDefinition.Cells.Where(c => c.Terrain == "water").Take(fleet)) Add(s, 0, hex.Hex);
        s.IsBuildPhase = true; var random = new BuildDice();
        new GameRules(s, random, new(), Now).Act(owner, new("end-turn"));
        Assert.Empty(random.PortDraws); Assert.Empty(s.Constructions); Assert.Equal(fleet, s.Ships.Count);
    }

    [Theory] [InlineData(0, 135)] [InlineData(1, 135)] [InlineData(6, 135)]
    [InlineData(7, 180)] [InlineData(8, 180)] [InlineData(15, 270)] [InlineData(16, 315)] [InlineData(24, 405)]
    public void Turn_budget_scales_with_starting_dice_and_includes_one_planning_interval(int ships, int seconds)
    {
        var s = Playing(); s.IsBuildPhase = true;
        foreach (var hex in BoardDefinition.Cells.Where(c => c.Terrain == "water").Take(ships)) Add(s, 1, hex.Hex);
        Rules(s).Act(s.ActivePlayerId!, new("end-turn"));
        Assert.Equal(s.Players[1].Id, s.ActivePlayerId);
        Assert.Equal(Now.AddSeconds(seconds), s.TurnEndsAt); Assert.Equal(Now.AddSeconds(45), s.ActionEndsAt);
        var deadline = s.TurnEndsAt;
        Add(s, 1, Open);
        Assert.False(Rules(s).Expire()); Assert.Equal(deadline, s.TurnEndsAt);
    }
}
