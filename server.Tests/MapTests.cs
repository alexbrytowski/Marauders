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
        var maps = new[] { "classic", "narrows", "delta" };
        var votes = new[] { "classic", "classic", "classic", "narrows" };
        var results = Enumerable.Range(0, 4).Select(i => MapLottery.Draw(maps, votes, new TicketRandom(i))).ToArray();
        Assert.Equal(3, results.Count(r => r.MapId == "classic")); Assert.Single(results, r => r.MapId == "narrows");
        Assert.DoesNotContain(results, r => r.MapId == "delta"); Assert.All(results, r => Assert.Equal(4, r.TotalTickets));
        Assert.All(results, r => Assert.False(r.UsedEqualOdds));
        var equal = Enumerable.Range(0, 3).Select(i => MapLottery.Draw(maps, [], new TicketRandom(i))).ToArray();
        Assert.Equal(maps, equal.Select(r => r.MapId)); Assert.All(equal, r => Assert.True(r.UsedEqualOdds));
        Assert.Throws<RuleException>(() => MapLottery.Draw(maps, ["forged-map"], new FixedDice()));
    }

    [Fact] public void Captain_votes_can_change_and_clear_but_lock_with_one_draw_at_draft_start()
    {
        var s = Lobby(); var captain = s.Players[2].Id;
        Rules(s).Act(captain, new("vote-map", MapId: "narrows"));
        Rules(s).Act(captain, new("vote-map", MapId: "delta"));
        Assert.Single(s.MapVotes); Assert.Equal("delta", s.MapVotes[captain]);
        Rules(s).Act(captain, new("vote-map")); Assert.Empty(s.MapVotes);
        Assert.Throws<RuleException>(() => Rules(s).Act("spectator", new("vote-map", MapId: "classic")));
        Assert.Throws<RuleException>(() => Rules(s).Act(captain, new("vote-map", MapId: "unknown")));
        Assert.Throws<RuleException>(() => Rules(s).Act(captain, new("vote-map", MapId: "shattered-isles")));
        Rules(s).Act(captain, new("vote-map", MapId: "narrows"));
        var random = new TicketRandom(0); var rules = new GameRules(s, random, new(), Now);
        Assert.Throws<RuleException>(() => rules.Act(captain, new("start-draft", FirstPlayerId: captain)));
        Assert.Equal(0, random.Calls);
        ReadyCrew(s, rules);
        var callsAfterReveal = random.Calls;
        Assert.True(callsAfterReveal > 1); Assert.Equal(6, s.PerkPickups.Count); Assert.Equal("narrows", s.MapId);
        Assert.Equal(MapCatalog.Get("narrows").Version, s.BoardVersion);
        Assert.Equal("Westwatch", s.Ports[0].Name);
        Assert.Throws<RuleException>(() => rules.Act(captain, new("vote-map", MapId: "classic")));
        Assert.Throws<RuleException>(() => rules.Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: captain)));
        Assert.Equal(callsAfterReveal, random.Calls); Assert.Contains(s.Events, e => e.Kind == "map" && e.Message.Contains("ticket 1/1"));
        s.MapVotes.Clear(); Assert.Equal(1, s.MapSelection!.Votes["narrows"]);
    }

    [Theory] [InlineData("classic")] [InlineData("narrows")] [InlineData("delta")]
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
        ReadyCrew(s);
        var revealed = s.PerkPickups.ToArray(); Assert.Equal(6, revealed.Length);
        Assert.Equal(revealed, s.PerkPickups);
        Assert.Equal("playing", s.Phase); Assert.Equal(24, s.Ships.Count); Assert.Equal(6, s.PerkPickups.Count);
        Assert.Equal(MapCatalog.Get(mapId).NeutralPortId, Assert.Single(s.Ports, p => p.OwnerId is null).Id);
        Assert.Null(s.Combat); Assert.Empty(s.CombatChoices);
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

    [Theory] [InlineData("narrows")] [InlineData("delta")]
    public void Revised_coasts_have_no_isolated_water_or_split_harbors(string mapId)
    {
        var map = MapCatalog.Get(mapId).Board;
        var water = map.Cells.Where(c => map.IsSailable(c.Hex)).Select(c => c.Hex).ToHashSet();
        var reached = new HashSet<Hex> { water.First() };
        var queue = new Queue<Hex>(reached);
        while (queue.TryDequeue(out var current))
            foreach (var next in map.Neighbors(current))
                if (reached.Add(next)) queue.Enqueue(next);
        Assert.True(water.SetEquals(reached));
        foreach (var port in map.Ports)
        {
            var harbor = map.Harbor(port.Id).ToHashSet();
            var blocked = water.Except(harbor).ToHashSet();
            Assert.All(harbor, h => Assert.NotNull(map.FindPath(harbor.First(), h, blocked)));
        }
    }

    [Fact] public void Choke_has_three_crossing_hexes_one_neutral_center_and_balanced_outer_rings()
    {
        var map = MapCatalog.Get("narrows").Board;
        var west = BoardMap.Offset(10, 15); var east = BoardMap.Offset(22, 15);
        var crossing = Enumerable.Range(0, 31).Select(r => BoardMap.Offset(16, r)).Where(map.IsSailable).ToHashSet();
        Assert.Equal(3, crossing.Count);
        Assert.Null(map.FindPath(west, east, crossing));
        foreach (var gap in crossing) Assert.NotNull(map.FindPath(west, east, crossing.Where(h => h != gap).ToHashSet()));
        var center = Assert.Single(map.Ports, p => p.Col is >= 15 and <= 17 && p.Row is >= 12 and <= 18);
        Assert.Equal("Northgate", center.Name); Assert.Equal(center.Id, MapCatalog.Get("narrows").NeutralPortId);
        Assert.DoesNotContain(map.Ports, p => p.Name == "Southgate");
        Assert.Equal("Dusk Harbor", Assert.Single(map.Ports, p => p.Id == "port-13").Name);
        Assert.Equal(6, map.Ports.Count(p => p.Col < 15)); Assert.Equal(6, map.Ports.Count(p => p.Col > 17));
        Assert.Equal("The Choke", MapCatalog.Get("narrows").Name);
    }

    [Fact] public void Delta_follows_the_numbered_ports_and_retires_the_coil()
    {
        var option = MapCatalog.Get("delta");
        var map = option.Board;
        Assert.Equal("Delta", option.Name);
        Assert.Equal("delta-v1", map.Version);
        Assert.Equal("port-11", option.NeutralPortId);
        Assert.Equal(Enumerable.Range(1, 13).Select(i => $"Port {i}"), map.Ports.Select(port => port.Name));
        Assert.Equal(new[] {
            (27, 1), (18, 4), (12, 7), (22, 14), (25, 12), (29, 17), (2, 27),
            (4, 14), (3, 6), (19, 23), (13, 18), (32, 5), (30, 27)
        }, map.Ports.Select(port => (port.Col, port.Row)));
        Assert.Null(MapCatalog.Find("shattered-isles"));
        Assert.Throws<RuleException>(() => MapCatalog.Get("shattered-isles"));
        Assert.Equal("land", map.Cell(BoardMap.Offset(7, 8))!.Terrain);
        Assert.Equal("water", map.Cell(BoardMap.Offset(16, 21))!.Terrain);
        Assert.Equal("water", map.Cell(BoardMap.Offset(27, 22))!.Terrain);
    }

    [Theory] [InlineData("narrows", 8, 10)] [InlineData("narrows", 24, 19)]
    public void New_islands_are_small_separate_land_masses(string mapId, int col, int row)
    {
        var map = MapCatalog.Get(mapId).Board; var old = MapCatalog.Resolve(mapId, mapId + "-v4");
        var start = BoardMap.Offset(col, row);
        var island = new HashSet<Hex> { start }; var queue = new Queue<Hex>(island);
        while (queue.TryDequeue(out var current))
            foreach (var next in BoardMap.Adjacent(current))
                if (map.Cell(next)?.Terrain == "land" && island.Add(next)) queue.Enqueue(next);
        Assert.InRange(island.Count, 8, 18);
        Assert.All(island, h => { Assert.Equal("water", old.Cell(h)!.Terrain); Assert.Equal("land", map.Cell(h)!.Terrain); });
    }

    [Theory] [InlineData("narrows", "delta-v1")] [InlineData("delta", "narrows-v3")] [InlineData("classic", "narrows-v3")]
    [InlineData("narrows", "narrows-v999")]
    public void Map_versions_cannot_select_another_maps_terrain_or_unknown_data(string id, string version)
        => Assert.Throws<RuleException>(() => MapCatalog.Resolve(id, version));

    [Theory] [InlineData("narrows")] [InlineData("delta")]
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
