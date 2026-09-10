using Marauders.Server;
using System.Text.Json;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    [Theory] [InlineData(6, 1)] [InlineData(1, 6)]
    public void Only_casualty_is_resolved_in_the_roll_and_its_public_position_survives_serialization(int attackerRoll, int defenderRoll)
    {
        var (s, a, b) = Duel(null);
        var lost = attackerRoll < defenderRoll ? a : b;
        var position = lost.Hex;
        var movement = s.RemainingMovement;
        Rules(s, attackerRoll, defenderRoll).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("resolved", s.Combat.Status);
        Assert.DoesNotContain(lost, s.Ships);
        Assert.Equal(movement, s.RemainingMovement);
        Assert.Contains(s.Events, e => e.Message.Contains("only eligible casualty"));
        Assert.Throws<RuleException>(() => Rules(s).Act(lost.OwnerId, new("remove-ship", CombatId: s.Combat.Id, ShipId: lost.Id)));
        var restored = JsonSerializer.Deserialize<GameState>(JsonSerializer.Serialize(s, GameStateStore.JsonOptions), GameStateStore.JsonOptions)!;
        var snapshot = Assert.Single(restored.Combat!.Ships, ship => ship.Id == lost.Id);
        Assert.Equal(position, new(snapshot.Q, snapshot.R));
        Assert.Equal(lost.Number, snapshot.Number); Assert.Equal(lost.OwnerId, snapshot.OwnerId);
        Assert.Equal(s.Combat.Rolls[lost.OwnerId], restored.Combat.Rolls[lost.OwnerId]);
    }

    [Fact] public void A_tied_duel_waits_for_another_roll_without_automatic_losses()
    {
        var (s, a, b) = Duel(null);
        Rules(s, 4, 4).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("awaiting-roll", s.Combat.Status);
        Assert.Contains(a, s.Ships); Assert.Contains(b, s.Ships);
        Assert.DoesNotContain(s.Events, e => e.Kind == "casualty");
        Rules(s, 6, 1).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal("resolved", s.Combat.Status); Assert.Single(s.Ships);
    }

    [Fact] public void Older_pending_single_casualty_resumes_once_without_losing_its_position()
    {
        var (s, a, b) = Duel(null);
        s.Combat!.Status = "choose-loss"; s.Combat.WinnerId = a.OwnerId; s.Combat.LosingPlayerId = b.OwnerId;
        s.Combat.Ships.Clear();
        Assert.True(Rules(s).Expire());
        Assert.Equal("resolved", s.Combat.Status); Assert.DoesNotContain(b, s.Ships);
        Assert.Contains(s.Combat.Ships, ship => ship.Id == b.Id && ship.Q == b.Q && ship.R == b.R);
        Assert.False(Rules(s).Expire());
    }
}
