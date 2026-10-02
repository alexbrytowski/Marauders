using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public sealed class CombatWinChanceTests
{
    private static GameState Battle(string? attackerPerk = null, string? defenderPerk = null,
        string kind = "ships", int defenseModifier = 0)
    {
        var state = new GameState { Ships =
        [
            new Ship { Id = "a", OwnerId = "attacker", Perk = attackerPerk, Q = 0, R = 0 },
            new Ship { Id = "b", OwnerId = "defender", Perk = defenderPerk, Q = 3, R = 0 }
        ] };
        state.Combat = new CombatState
        {
            Kind = kind, AttackerId = "attacker", DefenderId = "defender",
            ParticipantShipIds = kind == "ships" ? ["a", "b"] : ["a"],
            DefenseModifier = defenseModifier
        };
        return state;
    }

    [Theory]
    [InlineData(null, null, 0.5)]
    [InlineData("loaded-dice", null, 0.7)]
    [InlineData("glass-cannon", null, 0.5)]
    [InlineData("black-and-white", null, 0.5)]
    [InlineData("mark-of-the-kraken", null, 0.7916666666666666)]
    public void Ship_exchange_uses_actual_die_distributions_and_rerolls_ties(
        string? attackerPerk, string? defenderPerk, double expected)
    {
        var state = Battle(attackerPerk, defenderPerk);
        Assert.Equal(expected, state.CombatAttackerWinChance!.Value, 10);
    }

    [Fact]
    public void Port_support_and_weakness_change_the_chance()
    {
        var state = Battle();
        state.Ports[0].OwnerId = "attacker";
        state.Combat!.SupportingPortIds.Add(state.Ports[0].Id);
        Assert.Equal(0.6944444444444444, state.CombatAttackerWinChance!.Value, 10);

        var portAttack = Battle(kind: "port", defenseModifier: -1);
        Assert.Equal(21.0 / 31, portAttack.CombatAttackerWinChance!.Value, 10);
        var glassAgainstWeakenedDefense = Battle(attackerPerk: "glass-cannon", defenseModifier: -1);
        Assert.Equal(11.0 / 18, glassAgainstWeakenedDefense.CombatAttackerWinChance!.Value, 10);
    }

    [Fact]
    public void Call_penalizes_each_adjacent_enemy_die_and_suppresses_black_and_white()
    {
        var state = Battle("call-of-the-siren", "black-and-white");
        state.Ships[1].Q = 1;
        Assert.Equal(21.0 / 31, state.CombatAttackerWinChance!.Value, 10);
    }

    [Fact]
    public void Cam_and_kraken_use_their_boss_dice()
    {
        var siren = Battle(kind: "siren");
        Assert.Equal(15.0 / 114, siren.CombatAttackerWinChance!.Value, 10);
        siren.Ships[0].Perk = "ear-plugs";
        Assert.Equal(1, siren.CombatAttackerWinChance!.Value, 10);

        var kraken = Battle(kind: "kraken");
        Assert.Equal(0.2083333333333333, kraken.CombatAttackerWinChance!.Value, 10);
        siren.Ships[0].Perk = "black-and-white";
        kraken.Ships[0].Perk = "black-and-white";
        Assert.Equal(15.0 / 114, siren.CombatAttackerWinChance!.Value, 10);
        Assert.Equal(0.2083333333333333, kraken.CombatAttackerWinChance!.Value, 10);
    }

    [Fact]
    public void Chance_is_only_published_before_the_next_roll_and_cheat_death_counts_as_loss()
    {
        var state = Battle("cheat-death");
        Assert.Equal(0.5, state.CombatAttackerWinChance!.Value, 10);
        state.Combat!.Status = "choose-loss";
        Assert.Null(state.CombatAttackerWinChance);
    }
}
