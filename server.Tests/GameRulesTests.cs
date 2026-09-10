using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public sealed class FixedDice(params int[] values) : IDice
{
    private int index;
    public int Roll(int sides = 6) => values.Length == 0 ? (index++ % 2 == 0 ? 6 : 1) : values[index++ % values.Length];
    public int Next(int exclusiveMax) => exclusiveMax == 1000 ? 999 : 0;
}

public partial class GameRulesTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-07T12:00:00Z");
    private static GameRules Rules(GameState state, params int[] values) => new(state, new FixedDice(values), new GameOptions(), Now);
    private static GameState Lobby()
    {
        var state = new GameState();
        for (var i = 0; i < 4; i++) Rules(state).Join(new($"Captain {i}", GameRules.Colors[i], GameRules.Characters[i]));
        return state;
    }
    private static GameState Playing()
    {
        var s = Lobby(); s.Phase = "playing"; s.TurnOrder = s.Players.Select(p => p.Id).ToList();
        s.ActivePlayerId = s.Players[0].Id; s.TurnNumber = 5; s.RemainingActions = 2;
        s.TurnEndsAt = Now.AddMinutes(2); s.ActionEndsAt = Now.AddSeconds(45);
        for (var i = 0; i < 12; i++) s.Ports[i].OwnerId = s.Players[i / 3].Id;
        return s;
    }
    private static void ReadyCrew(GameState state, string? first = null, GameRules? rules = null)
    {
        rules ??= Rules(state);
        rules.Act(state.HostPlayerId!, new("set-first-player", FirstPlayerId: first ?? state.HostPlayerId));
        foreach (var player in state.Players)
            rules.Act(player.Id, new("set-ready", IsReady: true, LobbyVersion: state.LobbyVersion));
    }
    private static Hex Offset(Hex h, int q, int r = 0) => new(h.Q + q, h.R + r);
    private static readonly Hex Open = BoardDefinition.Cells.First(c => c.Terrain == "water" &&
        Enumerable.Range(-4, 9).All(q => Enumerable.Range(-1, 3).All(r => BoardDefinition.Cell(new(c.Q + q, c.R + r))?.Terrain == "water"))).Hex;
    private static Ship Add(GameState s, int owner, Hex hex)
    {
        var ship = new Ship { OwnerId = s.Players[owner].Id, Q = hex.Q, R = hex.R, PortId = s.Ports[owner * 3].Id, Number = s.Ships.Count + 1 };
        s.Ships.Add(ship); return ship;
    }

    [Fact] public void Map_has_thirteen_distinct_ports_and_connected_harbors()
    {
        Assert.Equal(13, BoardDefinition.Ports.Count);
        Assert.Equal(13, BoardDefinition.Cells.Count(c => c.Terrain == "port"));
        Assert.True(BoardDefinition.Cells.Count(c => c.Terrain == "land") > 250);
        var first = BoardDefinition.Harbor("port-1")[0];
        foreach (var port in BoardDefinition.Ports)
        {
            Assert.False(BoardDefinition.IsSailable(BoardDefinition.PortHex(port.Id)));
            Assert.InRange(BoardDefinition.Harbor(port.Id).Count, 2, 6);
            foreach (var h in BoardDefinition.Harbor(port.Id))
            {
                Assert.Equal(1, h.DistanceTo(BoardDefinition.PortHex(port.Id)));
                Assert.NotNull(BoardDefinition.FindPath(first, h, new HashSet<Hex>()));
            }
        }
    }
    [Theory]
    [InlineData(0, 0)] [InlineData(1, 1)] [InlineData(3, 1)] [InlineData(4, 2)] [InlineData(7, 2)] [InlineData(8, 3)] [InlineData(11, 3)] [InlineData(12, 4)]
    public void Dice_follow_population_bands(int ships, int expected) => Assert.Equal(expected, GameRules.ActionCount(ships));

    [Fact] public void Host_selects_first_and_snake_draft_reveals_perks_then_launches_fleets_automatically()
    {
        var s = Lobby(); var first = s.Players[2].Id;
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("start-draft", FirstPlayerId: first)));
        ReadyCrew(s, first);
        Assert.Equal(4, s.PerkPickups.Count); Assert.Empty(s.Ships); Assert.Null(s.TurnEndsAt); Assert.Null(s.ActionEndsAt);
        var pickups = s.PerkPickups.ToArray();
        var picks = new List<string>();
        for (var i = 0; i < 12; i++)
        {
            Assert.Throws<RuleException>(() => Rules(s).Act(s.Players.First(p => p.Id != s.ActivePlayerId).Id, new("draft", PortId: s.Ports[i].Id)));
            picks.Add(s.ActivePlayerId!); Rules(s).Act(s.ActivePlayerId!, new("draft", PortId: s.Ports[i].Id));
            Assert.Equal(pickups, s.PerkPickups);
            if (i < 11) { Assert.Equal("draft", s.Phase); Assert.Empty(s.Ships); Assert.Null(s.TurnEndsAt); }
        }
        var order = s.TurnOrder;
        Assert.Equal(new[] { order[0], order[1], order[2], order[3], order[3], order[2], order[1], order[0], order[0], order[1], order[2], order[3] }, picks);
        var unowned = Assert.Single(s.Ports, p => p.OwnerId is null);
        Assert.DoesNotContain(s.Ships, ship => ship.PortId == unowned.Id);
        foreach (var port in s.Ports.Where(p => p.OwnerId is not null))
        {
            var ships = s.Ships.Where(ship => ship.PortId == port.Id).ToArray();
            Assert.Equal(2, ships.Length);
            Assert.All(ships, ship => { Assert.Equal(port.OwnerId, ship.OwnerId); Assert.True(BoardDefinition.InHarbor(ship.Hex, port.Id)); });
        }
        Assert.Equal("playing", s.Phase); Assert.Equal(24, s.Ships.Count); Assert.Equal(first, s.ActivePlayerId); Assert.Equal(2, s.RemainingActions);
        Assert.Equal(24, s.Ships.Select(ship => ship.Hex).Distinct().Count());
        Assert.Equal(Now.AddSeconds(90), s.TurnEndsAt); Assert.Equal(Now.AddSeconds(30), s.ActionEndsAt);
        Assert.Throws<RuleException>(() => Rules(s).Act(first, new("place", PortId: s.Ports[0].Id, Q: 0, R: 0)));
        Assert.Throws<RuleException>(() => Rules(s).Act(first, new("finish-placement")));
        Assert.False(Rules(s).Expire()); Assert.Equal(24, s.Ships.Count);
    }

    [Fact] public void Default_action_deadline_ends_the_round_and_custom_timers_are_respected()
    {
        var s = Lobby(); ReadyCrew(s);
        for (var i = 0; i < 12; i++) Rules(s).Act(s.ActivePlayerId!, new("draft", PortId: s.Ports[i].Id));
        Assert.False(new GameRules(s, new FixedDice(), new(), Now.AddSeconds(29)).Expire());
        Assert.Throws<RuleException>(() => new GameRules(s, new FixedDice(), new(), Now.AddSeconds(30)).Act(s.ActivePlayerId!, new("roll-movement")));
        var configured = new GameOptions { TurnSeconds = 150, ActionSeconds = 45 };
        Assert.True(new GameRules(s, new FixedDice(), configured, Now.AddSeconds(30)).Expire());
        Assert.Equal(s.TurnOrder[1], s.ActivePlayerId); Assert.Equal(2, s.TurnNumber);
        Assert.Equal(Now.AddSeconds(180), s.TurnEndsAt); Assert.Equal(Now.AddSeconds(75), s.ActionEndsAt);
    }
    [Fact] public void Illegal_moves_and_wrong_actor_are_rejected()
    {
        var s = Playing(); var ship = Add(s, 0, Open); Add(s, 1, Offset(Open, 3)); s.RemainingMovement = 6;
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("move", ShipId: ship.Id, Q: Open.Q + 1, R: Open.R)));
        var land = BoardDefinition.Cells.First(c => c.Terrain == "land");
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: land.Q, R: land.R)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: Open.Q + 3, R: Open.R)));
    }
    [Fact] public void Movement_stops_at_first_encounter_and_retains_unspent_roll()
    {
        var s = Playing(); var ship = Add(s, 0, Open); Add(s, 1, Offset(Open, 3, -1)); s.RemainingMovement = 6;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: Open.Q + 4, R: Open.R));
        Assert.Equal(Offset(Open, 2), ship.Hex); Assert.Equal(4, s.RemainingMovement); Assert.NotNull(s.Combat);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("end-turn")));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("roll-movement")));
    }
    [Fact] public void Remote_ships_do_not_prevent_automatic_single_participant_casualty()
    {
        var s = Playing(); var trigger = Add(s, 0, Open); var helper = Add(s, 0, Offset(Open, -2)); var remote = Add(s, 0, Offset(Open, -4));
        Add(s, 1, Offset(Open, 2)); s.RemainingMovement = 2;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        // helper is now 3 away; a second helper is added within two of the new trigger.
        Assert.DoesNotContain(remote.Id, s.Combat!.ParticipantShipIds); Assert.DoesNotContain(helper.Id, s.Combat.ParticipantShipIds);
        Rules(s, 1, 6).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal("resolved", s.Combat.Status);
        Assert.DoesNotContain(trigger, s.Ships); Assert.Contains(helper, s.Ships); Assert.Contains(remote, s.Ships);
        Assert.Contains("automatically", s.Combat.Message);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("remove-ship", CombatId: s.Combat.Id, ShipId: trigger.Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("remove-ship", CombatId: s.Combat.Id, ShipId: trigger.Id)));
        Assert.Equal("resolved", s.Combat.Status);
    }
    [Fact] public void Same_harbor_triggers_nonadjacent_combat_with_owner_port_die()
    {
        var s = Playing(); var p = s.Ports.First(p => BoardDefinition.Harbor(p.Id).Any(a => BoardDefinition.Harbor(p.Id).Any(b => a.DistanceTo(b) > 1)));
        p.OwnerId = s.Players[1].Id;
        var harbor = BoardDefinition.Harbor(p.Id); var a = harbor.First(a => harbor.Any(b => a.DistanceTo(b) > 1)); var b = harbor.First(b => a.DistanceTo(b) > 1);
        var start = BoardDefinition.Neighbors(a).First(h => !BoardDefinition.InHarbor(h, p.Id) && h.DistanceTo(b) > 1);
        var ship = Add(s, 0, start); Add(s, 1, b); s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: a.Q, R: a.R));
        Assert.NotNull(s.Combat); Assert.Contains(p.Id, s.Combat.SupportingPortIds);
        Rules(s, 6, 1, 2).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal(2, s.Combat.Rolls[s.Players[1].Id].Count);
        Assert.Equal("resolved", s.Combat.Status); // A supporting port is never a casualty option.
        Assert.Single(s.Ships); Assert.Equal(s.Players[1].Id, p.OwnerId);
    }
    [Fact] public void Removing_a_helper_keeps_triggering_ships_fighting_without_chained_assistance()
    {
        var s = Playing(); var trigger = Add(s, 0, Open); var helper = Add(s, 0, Offset(Open, -1)); var chain = Add(s, 0, Offset(Open, -3));
        Add(s, 1, Offset(Open, 2)); s.RemainingMovement = 4;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: trigger.Id, Q: Open.Q + 1, R: Open.R));
        Assert.Contains(helper.Id, s.Combat!.ParticipantShipIds); Assert.DoesNotContain(chain.Id, s.Combat.ParticipantShipIds);
        Rules(s, 1, 1, 6).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal("choose-loss", s.Combat.Status);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("remove-ship", CombatId: s.Combat.Id, ShipId: helper.Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("remove-ship", CombatId: s.Combat.Id, ShipId: chain.Id)));
        Rules(s).Act(s.ActivePlayerId!, new("remove-ship", CombatId: s.Combat.Id, ShipId: helper.Id));
        Assert.Equal("awaiting-roll", s.Combat.Status); Assert.DoesNotContain(helper, s.Ships); Assert.Contains(trigger, s.Ships);
        Assert.Equal(3, s.RemainingMovement);
    }
    [Fact] public void Expired_clocks_reject_commands_before_background_timer_advances()
    {
        var s = Playing(); Add(s, 0, Open); s.ActionEndsAt = Now.AddSeconds(-1);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("roll-movement")));
        Assert.True(Rules(s).Expire()); Assert.NotEqual(s.Players[0].Id, s.ActivePlayerId);
    }
    [Fact] public void Allied_entry_restores_port_defense_but_unclaimed_harbor_does_not()
    {
        foreach (var owned in new[] { true, false })
        {
            var s = Playing(); var port = s.Ports[0]; port.DefenseWeakness = 5; port.OwnerId = owned ? s.ActivePlayerId : null;
            var target = BoardDefinition.Harbor(port.Id).First(h => BoardDefinition.Neighbors(h).Any(n => !BoardDefinition.InHarbor(n, port.Id)));
            var start = BoardDefinition.Neighbors(target).First(h => !BoardDefinition.InHarbor(h, port.Id));
            var ship = Add(s, 0, start); s.RemainingMovement = 1;
            Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: target.Q, R: target.R));
            Assert.Equal(owned ? 0 : 5, port.DefenseWeakness);
        }
    }
    [Fact] public void Simultaneous_encounters_are_chosen_by_active_captain()
    {
        var s = Playing(); var ship = Add(s, 0, Open); Add(s, 1, Offset(Open, 2)); Add(s, 2, Offset(Open, 2, -1)); s.RemainingMovement = 3;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: Open.Q + 1, R: Open.R));
        Assert.Null(s.Combat); Assert.True(s.CombatChoices.Count >= 2);
        var chosen = s.CombatChoices.Last(); Rules(s).Act(s.ActivePlayerId!, new("choose-combat", ChoiceId: chosen.Id));
        Assert.Equal(chosen.OpponentShipId, s.Combat!.OpponentShipId);
    }
    [Fact] public void Public_port_ties_reroll_and_defense_wins_weaken_without_casualties()
    {
        var s = Playing(); var p = s.Ports[3]; var ship = Add(s, 0, BoardDefinition.Harbor(p.Id)[0]);
        Rules(s).Act(s.ActivePlayerId!, new("attack-port", PortId: p.Id, ShipId: ship.Id));
        Rules(s, 3, 3).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal("awaiting-roll", s.Combat.Status); Assert.Equal(2, s.Combat.Rolls.Count);
        Rules(s, 2, 6).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat.Id));
        Assert.Equal("resolved", s.Combat.Status); Assert.Equal(1, p.DefenseWeakness); Assert.Single(s.Ships);
        Assert.Equal(2, s.Events.Count(e => e.Kind == "roll"));
    }
    [Fact] public void Capture_cancels_builds_converts_last_port_fleet_and_announces_victory()
    {
        var s = Playing(); var target = s.Ports[3];
        foreach (var p in s.Ports) p.OwnerId = s.Players[0].Id;
        target.OwnerId = s.Players[1].Id;
        var ship = Add(s, 0, BoardDefinition.Harbor(target.Id)[0]);
        var survivor = Add(s, 1, Open);
        s.Constructions.Add(new() { OwnerId = s.Players[1].Id, PortId = target.Id });
        Rules(s).Act(s.ActivePlayerId!, new("attack-port", PortId: target.Id, ShipId: ship.Id));
        Rules(s, 6, 1).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Empty(s.Constructions); Assert.Equal(s.Players[0].Id, survivor.OwnerId); Assert.Equal(Open, survivor.Hex);
        Assert.Equal("finished", s.Phase); Assert.Equal(s.Players[0].Id, s.WinnerId); Assert.Null(s.TurnEndsAt); Assert.Null(s.ActionEndsAt);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("roll-movement")));
    }
    [Fact] public void Timeout_completes_construction_and_uses_nearest_open_water_when_harbor_is_full()
    {
        var s = Playing(); var port = s.Ports[0];
        foreach (var h in BoardDefinition.Harbor(port.Id)) Add(s, 0, h);
        s.Constructions.Add(new() { OwnerId = s.ActivePlayerId!, PortId = port.Id, RemainingOwnerTurns = 1, StartedTurnNumber = 1 });
        s.TurnEndsAt = Now.AddSeconds(-1);
        Assert.True(Rules(s).Expire());
        Assert.Empty(s.Constructions);
        var launched = s.Ships.Last(); Assert.Equal("water", BoardDefinition.Cell(launched.Hex)!.Terrain);
        Assert.Equal(6, s.TurnNumber); Assert.Equal(s.Players[1].Id, s.ActivePlayerId);
        Assert.Contains(s.Events, e => e.Kind == "timeout");
    }
    [Fact] public void Construction_counts_only_two_future_owner_rounds_and_respects_population()
    {
        var s = Playing(); Add(s, 0, Open); s.IsBuildPhase = true; s.AvailableBuilds = 5;
        Rules(s).Act(s.ActivePlayerId!, new("build", PortId: s.Ports[0].Id));
        var build = s.Constructions[0];
        Rules(s).Act(s.ActivePlayerId!, new("end-turn"));
        Assert.Equal(2, build.RemainingOwnerTurns);
        s.ActivePlayerId = s.Players[0].Id; s.TurnNumber = 9; s.IsBuildPhase = true;
        Rules(s).Act(s.ActivePlayerId!, new("end-turn")); Assert.Equal(1, build.RemainingOwnerTurns);
        s.ActivePlayerId = s.Players[0].Id; s.TurnNumber = 13; s.IsBuildPhase = true;
        Rules(s).Act(s.ActivePlayerId!, new("end-turn")); Assert.Empty(s.Constructions); Assert.Equal(2, s.Ships.Count(sh => sh.OwnerId == s.Players[0].Id));
        s.ActivePlayerId = s.Players[0].Id; s.IsBuildPhase = true;
        for (var i = 0; i < 4; i++) Rules(s).Act(s.ActivePlayerId!, new("build", PortId: s.Ports[0].Id));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.ActivePlayerId!, new("build", PortId: s.Ports[0].Id)));
    }
}
