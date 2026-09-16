using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    [Fact]
    public void Every_map_has_many_port_safe_Kraken_spawns_and_random_draws_vary()
    {
        foreach (var map in MapCatalog.All)
        {
            var safe = KrakenPlacement.SafeCells(map.Board);
            Assert.True(safe.Count > 100);
            Assert.All(safe, hex =>
            {
                Assert.Equal("water", map.Board.Cell(hex)!.Terrain);
                Assert.All(map.Board.Ports, port =>
                    Assert.True(hex.DistanceTo(map.Board.PortHex(port.Id)) > KrakenPlacement.Reach + 2));
            });

            var locations = new HashSet<Hex>();
            for (var seed = 0; seed < 20; seed++)
            {
                var state = new GameState { MapId = map.Id, BoardVersion = map.Version };
                locations.Add(KrakenPlacement.Spawn(state, new SeededDice(seed)).Hex);
            }
            Assert.True(locations.Count > 10);
        }
    }

    [Fact]
    public void Kraken_warns_once_at_32_and_spawns_randomly_at_33()
    {
        var state = Lobby();
        var rules = new GameRules(state, new FixedDice(), new GameOptions { StartingRound = 32 }, Now);
        ReadyCrew(state, rules: rules);
        Assert.Null(state.Kraken);
        Assert.Single(state.Events, e => e.Kind == "kraken" && e.Message.Contains("next round"));

        rules.Act(state.ActivePlayerId!, new("end-turn"));
        Assert.Equal(33, state.TurnNumber);
        var kraken = Assert.IsType<KrakenState>(state.Kraken);
        Assert.Equal(3, kraken.Lives);
        Assert.Equal("water", MapCatalog.Resolve(state.MapId, state.BoardVersion).Cell(kraken.Hex)!.Terrain);
        Assert.Single(state.Events, e => e.Kind == "kraken" && e.Message.Contains("rose at"));
        Assert.Single(state.Events, e => e.Kind == "kraken" && e.Message.Contains("next round"));
    }

    [Fact]
    public void Fleet_wins_remove_persistent_Kraken_lives_and_final_win_drops_the_seventh_perk()
    {
        var state = Playing();
        state.Kraken = new() { Q = Open.Q + 3, R = Open.R };
        var trigger = Add(state, 0, Open);
        state.RemainingMovement = 1;
        Rules(state).Act(trigger.OwnerId, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));

        Assert.Equal("kraken", state.Combat!.Kind);
        Assert.Empty(state.Combat.SupportingPortIds);
        for (var lives = 2; lives >= 0; lives--)
        {
            Rules(state, 6, 1, 2, 3).Act(trigger.OwnerId, new("roll-combat", CombatId: state.Combat.Id));
            Assert.Equal(lives, state.Kraken.Lives);
            Assert.Equal(3, state.Combat.Rolls[GameRules.KrakenId].Count);
        }

        Assert.Equal("resolved", state.Combat.Status);
        var reward = Assert.Single(state.PerkPickups, p => p.Kind == "mark-of-the-kraken");
        Assert.Equal(state.Kraken.Hex, new Hex(reward.Q, reward.R));
    }

    [Fact]
    public void Kraken_wins_remove_a_chosen_ship_and_continue_only_with_the_trigger()
    {
        var state = Playing();
        state.Kraken = new() { Q = Open.Q + 3, R = Open.R };
        var trigger = Add(state, 0, Open);
        var helper = Add(state, 0, Offset(Open, -1));
        state.RemainingMovement = 1;
        Rules(state).Act(trigger.OwnerId, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));

        Rules(state, 1, 2, 6, 5, 4).Act(trigger.OwnerId, new("roll-combat", CombatId: state.Combat!.Id));
        Assert.Equal("choose-loss", state.Combat.Status);
        Assert.Equal(3, state.Kraken.Lives);
        Rules(state).Act(trigger.OwnerId, new("remove-ship", CombatId: state.Combat.Id, ShipId: helper.Id));
        Assert.Equal("awaiting-roll", state.Combat.Status);

        Rules(state, 1, 6, 5, 4).Act(trigger.OwnerId, new("roll-combat", CombatId: state.Combat.Id));
        Assert.DoesNotContain(trigger, state.Ships);
        Assert.Equal("resolved", state.Combat.Status);
        Assert.Equal(3, state.Kraken.Lives);
    }

    [Fact]
    public void Marked_ships_contribute_three_dice_in_ship_and_port_battles()
    {
        var (duel, marked, defender) = Duel("mark-of-the-kraken");
        Rules(duel, 1, 3, 6, 5).Act(marked.OwnerId, new("roll-combat", CombatId: duel.Combat!.Id));
        Assert.Equal(new[] { 1, 3, 6 }, duel.Combat.Rolls[marked.OwnerId]);
        Assert.Equal(new[] { 5 }, duel.Combat.Rolls[defender.OwnerId]);

        var siege = Playing();
        var port = siege.Ports[3];
        var attacker = Add(siege, 0, BoardDefinition.Harbor(port.Id)[0]);
        attacker.Perk = "mark-of-the-kraken";
        Rules(siege).Act(attacker.OwnerId, new("attack-port", ShipId: attacker.Id, PortId: port.Id));
        Rules(siege, 1, 2, 6, 5).Act(attacker.OwnerId, new("roll-combat", CombatId: siege.Combat!.Id));
        Assert.Equal(new[] { 1, 2, 6 }, siege.Combat.Rolls[attacker.OwnerId]);
        Assert.Single(siege.Combat.Rolls[siege.Combat.DefenderId]);
    }

    [Fact]
    public void Black_and_white_and_Cheat_Death_apply_to_Kraken_exchanges()
    {
        var blackWhite = Playing();
        blackWhite.Kraken = new() { Q = Open.Q + 3, R = Open.R };
        var holder = Add(blackWhite, 0, Open);
        holder.Perk = "black-and-white";
        blackWhite.RemainingMovement = 1;
        Rules(blackWhite).Act(holder.OwnerId, new("move", ShipId: holder.Id, Q: Open.Q + 1, R: Open.R));
        Rules(blackWhite, 1).Act(holder.OwnerId, new("roll-combat", CombatId: blackWhite.Combat!.Id));
        Assert.Equal(2, blackWhite.Kraken.Lives);
        Assert.Equal("black", blackWhite.Combat.BlackWhiteResult);
        Assert.All(blackWhite.Combat.Rolls.Values, Assert.Empty);

        var cheatDeath = Playing();
        cheatDeath.Kraken = new() { Q = Open.Q + 3, R = Open.R };
        var survivor = Add(cheatDeath, 0, Open);
        survivor.Perk = "cheat-death";
        cheatDeath.RemainingMovement = 1;
        Rules(cheatDeath).Act(survivor.OwnerId, new("move", ShipId: survivor.Id, Q: Open.Q + 1, R: Open.R));
        Rules(cheatDeath, 1, 6, 5, 4).Act(survivor.OwnerId, new("roll-combat", CombatId: cheatDeath.Combat!.Id));
        Assert.Contains(survivor, cheatDeath.Ships);
        Assert.Null(survivor.Perk);
        Assert.Equal(3, cheatDeath.Kraken.Lives);
        Assert.Equal("awaiting-roll", cheatDeath.Combat.Status);
        Assert.Contains(cheatDeath.PerkPickups, pickup => pickup.Kind == "cheat-death");
    }

    [Fact]
    public void Kraken_combat_timeout_rolls_publicly_and_resolves_the_only_casualty()
    {
        var state = Playing();
        state.Kraken = new() { Q = Open.Q + 3, R = Open.R };
        var trigger = Add(state, 0, Open);
        state.RemainingMovement = 1;
        Rules(state).Act(trigger.OwnerId, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        state.ActionEndsAt = Now.AddSeconds(-1);

        Assert.True(new GameRules(state, new FixedDice(1, 6, 5, 4), new(), Now).Expire());
        Assert.DoesNotContain(trigger, state.Ships);
        Assert.Contains(state.Events, e => e.Kind == "roll" && e.Rolls![GameRules.KrakenId].Count == 3);
        Assert.Equal(3, state.Kraken.Lives);
    }
}
