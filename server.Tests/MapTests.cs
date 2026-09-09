using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class TicketRandom(int ticket) : IDice
    {
        public int Calls { get; private set; }
        public int Roll(int sides = 6) => 6;
        public int Next(int exclusiveMax) { Calls++; Assert.InRange(ticket, 0, exclusiveMax - 1); return ticket; }
    }

    [Fact] public void Weighted_map_lottery_gives_each_vote_exactly_one_ticket()
    {
        var maps = new[] { "classic", "narrows", "shattered-isles" };
        var votes = new[] { "classic", "classic", "classic", "narrows" };
        var results = Enumerable.Range(0, 4).Select(i => MapLottery.Draw(maps, votes, new TicketRandom(i))).ToArray();
        Assert.Equal(3, results.Count(r => r.MapId == "classic")); Assert.Single(results, r => r.MapId == "narrows");
        Assert.DoesNotContain(results, r => r.MapId == "shattered-isles"); Assert.All(results, r => Assert.Equal(4, r.TotalTickets));
        Assert.All(results, r => Assert.False(r.UsedEqualOdds));
        var equal = Enumerable.Range(0, 3).Select(i => MapLottery.Draw(maps, [], new TicketRandom(i))).ToArray();
        Assert.Equal(maps, equal.Select(r => r.MapId)); Assert.All(equal, r => Assert.True(r.UsedEqualOdds));
        Assert.Throws<RuleException>(() => MapLottery.Draw(maps, ["forged-map"], new FixedDice()));
    }

    [Fact] public void Captain_votes_can_change_and_clear_but_lock_with_one_draw_at_draft_start()
    {
        var s = Lobby(); var captain = s.Players[2].Id;
        Rules(s).Act(captain, new("vote-map", MapId: "narrows"));
        Rules(s).Act(captain, new("vote-map", MapId: "shattered-isles"));
        Assert.Single(s.MapVotes); Assert.Equal("shattered-isles", s.MapVotes[captain]);
        Rules(s).Act(captain, new("vote-map")); Assert.Empty(s.MapVotes);
        Assert.Throws<RuleException>(() => Rules(s).Act("spectator", new("vote-map", MapId: "classic")));
        Assert.Throws<RuleException>(() => Rules(s).Act(captain, new("vote-map", MapId: "unknown")));
        Rules(s).Act(captain, new("vote-map", MapId: "narrows"));
        var random = new TicketRandom(0); var rules = new GameRules(s, random, new(), Now);
        Assert.Throws<RuleException>(() => rules.Act(captain, new("start-draft", FirstPlayerId: captain)));
        Assert.Equal(0, random.Calls);
        rules.Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: captain));
        var callsAfterReveal = random.Calls;
        Assert.True(callsAfterReveal > 1); Assert.Equal(4, s.PerkPickups.Count); Assert.Equal("narrows", s.MapId);
        Assert.Equal(MapCatalog.Get("narrows").Version, s.BoardVersion);
        Assert.Equal("Westwatch", s.Ports[0].Name);
        Assert.Throws<RuleException>(() => rules.Act(captain, new("vote-map", MapId: "classic")));
        Assert.Throws<RuleException>(() => rules.Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: captain)));
        Assert.Equal(callsAfterReveal, random.Calls); Assert.Contains(s.Events, e => e.Kind == "map" && e.Message.Contains("ticket 1/1"));
        s.MapVotes.Clear(); Assert.Equal(1, s.MapSelection!.Votes["narrows"]);
    }

    [Theory] [InlineData("classic")] [InlineData("narrows")] [InlineData("shattered-isles")]
    public void Each_map_supports_automatic_fleets_spillover_and_predraft_perk_layouts(string mapId)
    {
        var map = MapCatalog.Get(mapId).Board;
        Assert.Equal(13, map.Ports.Count); Assert.Equal(13, map.Cells.Count(c => c.Terrain == "port"));
        var first = map.Harbor(map.Ports[0].Id)[0];
        foreach (var port in map.Ports)
        {
            Assert.True(map.Harbor(port.Id).Count >= 2);
            Assert.All(map.Harbor(port.Id), h => Assert.NotNull(map.FindPath(first, h, new HashSet<Hex>())));
            var occupied = map.Harbor(port.Id).ToHashSet(); var spill = map.SpawnHex(port.Id, occupied);
            Assert.NotNull(spill); Assert.Equal("water", map.Cell(spill!.Value)!.Terrain); Assert.DoesNotContain(spill.Value, occupied);
        }
        var s = Lobby(); Rules(s).Act(s.HostPlayerId!, new("vote-map", MapId: mapId));
        Rules(s).Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: s.HostPlayerId));
        var revealed = s.PerkPickups.ToArray(); Assert.Equal(4, revealed.Length);
        for (var i = 0; i < 12; i++) Rules(s).Act(s.ActivePlayerId!, new("draft", PortId: s.Ports[i].Id));
        Assert.Equal(revealed, s.PerkPickups);
        Assert.Equal("playing", s.Phase); Assert.Equal(24, s.Ships.Count); Assert.Equal(4, s.PerkPickups.Count);
        Assert.Equal(24, s.Ships.Select(ship => ship.Hex).Distinct().Count());
        Assert.All(s.Ships, ship => Assert.True(map.InHarbor(ship.Hex, ship.PortId)));
        for (var seed = 0; seed < 20; seed++)
        {
            var beforeDraft = PerkPlacement.Create(s, new SeededDice(seed));
            // Port ownership must not influence a layout revealed before drafting.
            var owners = s.Players.SelectMany(p => Enumerable.Repeat(p.Id, 3)).ToArray();
            var shuffle = new Random(seed); shuffle.Shuffle(owners);
            for (var i = 0; i < 12; i++) s.Ports[i].OwnerId = owners[i];
            var pickups = PerkPlacement.Create(s, new SeededDice(seed)); var hexes = pickups.Select(p => new Hex(p.Q, p.R)).ToArray();
            Assert.Equal(beforeDraft, pickups);
            foreach (var h in hexes)
            {
                Assert.Equal("water", map.Cell(h)!.Terrain);
                var distances = s.Ports.Select(p => PerkPlacement.Distance(p.Id, h, mapId)).Order().ToArray();
                Assert.True(distances[0] >= 3); Assert.InRange(distances[1] - distances[0], 0, 1);
                Assert.All(hexes.Where(other => other != h), other => Assert.True(h.DistanceTo(other) >= 6));
            }
        }
    }

    [Theory] [InlineData("narrows")] [InlineData("shattered-isles")]
    public void Alternate_map_movement_and_port_combat_use_its_own_terrain(string mapId)
    {
        var map = MapCatalog.Get(mapId).Board; var s = Playing(); s.MapId = mapId; s.BoardVersion = map.Version;
        s.Ports = map.Ports.Select((p, i) => new Port { Id = p.Id, Name = p.Name, OwnerId = i < 12 ? s.Players[i / 3].Id : null }).ToList();
        var differentWater = map.Cells.First(c => c.Terrain == "water" && !BoardDefinition.IsSailable(c.Hex) && map.Neighbors(c.Hex).Any());
        var start = map.Neighbors(differentWater.Hex).First(); var ship = Add(s, 0, start); s.RemainingMovement = 1;
        Rules(s).Act(s.ActivePlayerId!, new("move", ShipId: ship.Id, Q: differentWater.Q, R: differentWater.R));
        Assert.Equal(differentWater.Hex, ship.Hex);
        var port = s.Ports[3]; var harbor = map.Harbor(port.Id)[0]; ship.Q = harbor.Q; ship.R = harbor.R; s.RemainingActions = 1;
        Rules(s).Act(s.ActivePlayerId!, new("attack-port", ShipId: ship.Id, PortId: port.Id));
        Rules(s, 6, 1).Act(s.ActivePlayerId!, new("roll-combat", CombatId: s.Combat!.Id));
        Assert.Equal(ship.OwnerId, port.OwnerId);
    }
}
