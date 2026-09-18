using System.Text.Json;
using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private static (GameState State, Construction Due, Construction Pending) LaunchBattleSetup()
    {
        var s = Playing();
        s.ActivePlayerId = s.Players[1].Id; s.IsBuildPhase = true;
        s.RemainingActions = 0;
        Add(s, 0, BoardDefinition.Harbor(s.Ports[3].Id)[0]);
        Add(s, 2, Open);
        var due = new Construction { OwnerId = s.ActivePlayerId, PortId = s.Ports[3].Id, StartedTurnNumber = 1, RemainingOwnerTurns = 1 };
        var pending = new Construction { OwnerId = s.ActivePlayerId, PortId = s.Ports[4].Id, StartedTurnNumber = 1 };
        s.Constructions = [due, pending];
        s.Whirlpool = new() { First = Offset(Open, -3), Second = Offset(Open, 4), RemainingTurns = 8 };
        return (s, due, pending);
    }

    [Theory] [InlineData(true)] [InlineData(false)]
    public void Launch_battle_keeps_the_finishing_captain_in_control_and_advances_construction_once(bool builderWins)
    {
        var (s, due, pending) = LaunchBattleSetup();
        var owner = s.ActivePlayerId!; var next = s.Players[2].Id;
        Rules(s).Act(owner, new("end-turn"));
        var battle = s.Combat!;
        Assert.NotNull(battle); Assert.True(s.IsEndingRound); Assert.True(s.IsBuildPhase);
        Assert.Equal(owner, s.ActivePlayerId); Assert.Equal(owner, s.CombatPlayerId); Assert.Equal(owner, battle.AttackerId);
        Assert.Equal(5, s.TurnNumber); Assert.Equal(0, s.RemainingActions); Assert.Equal(0, s.AvailableBuilds);
        Assert.Null(s.TurnEndsAt); Assert.Equal(Now.AddSeconds(45), s.ActionEndsAt);
        Assert.DoesNotContain(due, s.Constructions); Assert.Equal(1, pending.RemainingOwnerTurns);
        Assert.Empty(s.RoundHistory); Assert.Equal(8, s.Whirlpool!.RemainingTurns);
        Assert.False(Rules(s).Expire());
        var builds = s.Constructions.Select(b => (b.Id, b.RemainingOwnerTurns)).ToArray();
        Assert.Throws<RuleException>(() => Rules(s).Act(next, new("roll-combat", CombatId: battle.Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, new("roll-movement")));
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, new("build", PortId: s.Ports[3].Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, new("end-turn")));

        Rules(s, builderWins ? 6 : 1, builderWins ? 1 : 6).Act(owner, new("roll-combat", CombatId: battle.Id));
        Assert.Equal("resolved", battle.Status);
        Assert.Throws<RuleException>(() => Rules(s).Act(next, new("continue-combat", CombatId: battle.Id)));
        // The saved handoff must survive cloning/restart, including the derived controller.
        s = JsonSerializer.Deserialize<GameState>(JsonSerializer.Serialize(s, GameStateStore.JsonOptions), GameStateStore.JsonOptions)!;
        Rules(s).RefreshBuildCapacity();
        Assert.True(s.IsEndingRound); Assert.Equal(0, s.AvailableBuilds); Assert.Equal(owner, s.CombatPlayerId);
        var resumedAt = Now.AddSeconds(20);
        new GameRules(s, new FixedDice(), new(), resumedAt).Act(owner, new("continue-combat", CombatId: battle.Id));
        Assert.False(s.IsEndingRound); Assert.Null(s.Combat); Assert.Empty(s.CombatChoices);
        Assert.Equal(next, s.ActivePlayerId); Assert.Equal(6, s.TurnNumber);
        Assert.Equal(resumedAt.AddSeconds(135), s.TurnEndsAt); Assert.Equal(resumedAt.AddSeconds(45), s.ActionEndsAt);
        Assert.Equal(builds, s.Constructions.Where(b => b.OwnerId == owner).Select(b => (b.Id, b.RemainingOwnerTurns)).ToArray());
        Assert.Single(s.Events, e => e.Message.Contains("launched a ship"));
        var snapshot = Assert.Single(s.RoundHistory);
        Assert.Equal(owner, snapshot.ActivePlayerId); Assert.Equal(5, snapshot.Turn);
        Assert.Equal(builderWins ? 1 : 0, snapshot.Teams.Single(t => t.PlayerId == owner).Ships);
        Assert.Equal(7, s.Whirlpool!.RemainingTurns);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public void Timeout_resolves_launch_battles_before_starting_the_next_clock(bool alreadyLaunched)
    {
        var (s, due, pending) = LaunchBattleSetup();
        var owner = s.ActivePlayerId!;
        if (alreadyLaunched) Rules(s).Act(owner, new("end-turn"));
        s.ActionEndsAt = Now.AddSeconds(-1);
        Assert.True(Rules(s).Expire());
        Assert.Equal(s.Players[2].Id, s.ActivePlayerId); Assert.Equal(6, s.TurnNumber);
        Assert.False(s.IsEndingRound); Assert.Null(s.Combat); Assert.Empty(s.CombatChoices);
        Assert.DoesNotContain(due, s.Constructions); Assert.Equal(1, pending.RemainingOwnerTurns);
        Assert.Single(s.Events, e => e.Message.Contains("launched a ship"));
        Assert.Single(s.RoundHistory); Assert.Equal(7, s.Whirlpool!.RemainingTurns);
        Assert.Equal(Now.AddSeconds(135), s.TurnEndsAt); Assert.Equal(Now.AddSeconds(45), s.ActionEndsAt);
        Assert.False(Rules(s).Expire());
    }

    [Fact]
    public void Multiple_launch_encounters_stay_with_the_builder_until_all_are_resolved()
    {
        var (s, _, pending) = LaunchBattleSetup(); var owner = s.ActivePlayerId!;
        Add(s, 3, BoardDefinition.Harbor(s.Ports[5].Id)[0]);
        s.Constructions.Add(new() { OwnerId = owner, PortId = s.Ports[5].Id, StartedTurnNumber = 1, RemainingOwnerTurns = 1 });
        Rules(s).Act(owner, new("end-turn"));
        Assert.Null(s.Combat); Assert.Equal(2, s.CombatChoices.Count); Assert.Equal(owner, s.CombatPlayerId);
        var choice = s.CombatChoices.Last();
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[2].Id, new("choose-combat", ChoiceId: choice.Id)));
        Rules(s).Act(owner, new("choose-combat", ChoiceId: choice.Id));
        for (var i = 0; i < 2; i++)
        {
            Assert.Equal(owner, s.ActivePlayerId); Assert.Equal(owner, s.CombatPlayerId);
            var battle = s.Combat!;
            Rules(s, 6, 1).Act(owner, new("roll-combat", CombatId: battle.Id));
            Assert.Equal("resolved", battle.Status);
            Rules(s).Act(owner, new("continue-combat", CombatId: battle.Id));
        }
        Assert.Equal(s.Players[2].Id, s.ActivePlayerId); Assert.False(s.IsEndingRound);
        Assert.Equal(1, pending.RemainingOwnerTurns); Assert.Single(s.RoundHistory);
        Assert.Equal(7, s.Whirlpool!.RemainingTurns);
    }

    [Theory] [InlineData(0)] [InlineData(1)]
    public void Forfeit_during_launch_battles_finishes_the_handoff_once(int leaving)
    {
        var (s, _, _) = LaunchBattleSetup(); var owner = s.ActivePlayerId!;
        Rules(s).Act(owner, new("end-turn"));
        Rules(s).Act(s.Players[leaving].Id, new("forfeit"));
        Assert.True(s.IsEndingRound); Assert.NotNull(s.Combat); Assert.Empty(s.CombatChoices);
        var controller = s.CombatPlayerId!; var battle = s.Combat!;
        Rules(s, leaving == 0 ? 1 : 6, leaving == 0 ? 6 : 1).Act(controller, new("roll-combat", CombatId: battle.Id));
        Assert.Equal("resolved", battle.Status);
        Rules(s).Act(controller, new("continue-combat", CombatId: battle.Id));
        Assert.False(s.IsEndingRound); Assert.Null(s.Combat); Assert.Empty(s.CombatChoices);
        Assert.Equal(s.Players[2].Id, s.ActivePlayerId); Assert.Equal(6, s.TurnNumber);
        Assert.Single(s.RoundHistory); Assert.Equal(7, s.Whirlpool!.RemainingTurns);
    }

    [Fact]
    public void Launch_battle_casualties_are_chosen_only_by_the_losing_captain()
    {
        var (s, _, pending) = LaunchBattleSetup(); var owner = s.ActivePlayerId!;
        Add(s, 0, BoardDefinition.Harbor(s.Ports[3].Id)[1]);
        Rules(s).Act(owner, new("end-turn"));
        var battle = s.Combat!;
        Rules(s, 6, 1, 1, 6).Act(owner, new("roll-combat", CombatId: battle.Id));
        Assert.Equal("choose-loss", battle.Status); Assert.Equal(s.Players[0].Id, battle.LosingPlayerId);
        var loss = new GameCommand("remove-ship", CombatId: battle.Id, ShipId: battle.OpponentShipId);
        Assert.Throws<RuleException>(() => Rules(s).Act(owner, loss));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[2].Id, loss));
        Rules(s).Act(s.Players[0].Id, loss);
        Rules(s).Act(owner, new("continue-combat", CombatId: battle.Id));
        Assert.True(s.IsEndingRound); Assert.Equal(owner, s.ActivePlayerId);
        battle = s.Combat!;
        Rules(s, 6, 1).Act(owner, new("roll-combat", CombatId: battle.Id));
        Rules(s).Act(owner, new("continue-combat", CombatId: battle.Id));
        Assert.False(s.IsEndingRound); Assert.Equal(s.Players[2].Id, s.ActivePlayerId);
        Assert.Equal(1, pending.RemainingOwnerTurns); Assert.Single(s.RoundHistory);
    }

    [Fact]
    public void Older_encounter_choices_use_a_triggering_captain_when_the_active_captain_is_unrelated()
    {
        var s = Playing(); var a = Add(s, 0, Open); var b = Add(s, 1, Offset(Open, 1));
        s.ActivePlayerId = s.Players[2].Id;
        s.CombatChoices = [new("legacy-choice", a.Id, b.Id, null)];
        Assert.Equal(a.OwnerId, s.CombatPlayerId);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId, new("choose-combat", ChoiceId: "legacy-choice")));
        Rules(s).Act(a.OwnerId, new("choose-combat", ChoiceId: "legacy-choice"));
        Assert.Equal(a.OwnerId, s.CombatPlayerId); Assert.NotNull(s.Combat);
    }

    [Fact]
    public void Older_battle_between_other_captains_cannot_be_rolled_or_continued_by_the_active_outsider()
    {
        var (s, a, _) = Duel(null);
        s.ActivePlayerId = s.Players[2].Id;
        Add(s, 2, Offset(Open, 4));
        var battle = s.Combat!;
        Assert.Equal(a.OwnerId, s.CombatPlayerId);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId, new("roll-combat", CombatId: battle.Id)));
        Rules(s, 6, 1).Act(a.OwnerId, new("roll-combat", CombatId: battle.Id));
        Assert.Equal("resolved", battle.Status);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId, new("continue-combat", CombatId: battle.Id)));
        Rules(s).Act(a.OwnerId, new("continue-combat", CombatId: battle.Id));
        Assert.Null(s.Combat); Assert.Equal(s.Players[2].Id, s.ActivePlayerId);
    }
}
