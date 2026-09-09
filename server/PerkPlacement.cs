namespace Marauders.Server;

/// <summary>Terrain-based sailing distances and randomized pickup layouts revealed before drafting.</summary>
public static class PerkPlacement
{
    public static readonly string[] Kinds = ["black-pearl", "glass-cannon", "loaded-dice", "architect"];
    private sealed class MapDistances(BoardMap board)
    {
        public Dictionary<string, Dictionary<Hex, int>> Ports { get; } = board.Ports.ToDictionary(p => p.Id, p => HarborDistances(board, p.Id));
        public IReadOnlyList<Hex> Candidates { get; set; } = [];
    }
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, MapDistances> Cache = new();
    private static MapDistances For(string mapId) => Cache.GetOrAdd(mapId, id =>
    {
        var board = MapCatalog.Get(id).Board;
        var data = new MapDistances(board);
        data.Candidates = board.Cells.Where(c => c.Terrain == "water" && IsBalanced(data, c.Hex)).Select(c => c.Hex).ToArray();
        return data;
    });
    public static int Distance(string portId, Hex hex, string mapId = "classic") => For(mapId).Ports[portId].GetValueOrDefault(hex, int.MaxValue / 2);
    public static IReadOnlyList<Hex> Candidates => For("classic").Candidates;

    private static Dictionary<Hex, int> HarborDistances(BoardMap board, string portId)
    {
        var distances = board.Harbor(portId).ToDictionary(h => h, _ => 0);
        var queue = new Queue<Hex>(distances.Keys);
        while (queue.TryDequeue(out var current))
            foreach (var next in board.Neighbors(current))
                if (distances.TryAdd(next, distances[current] + 1)) queue.Enqueue(next);
        return distances;
    }
    private static bool IsBalanced(MapDistances data, Hex hex)
    {
        var nearest = data.Ports.Values.Select(d => d.GetValueOrDefault(hex, int.MaxValue / 2)).Order().Take(2).ToArray();
        return nearest[0] >= 3 && nearest[1] < int.MaxValue / 2 && nearest[1] - nearest[0] <= 1;
    }
    public static List<PerkPickup> Create(GameState state, IDice random)
    {
        var candidates = For(state.MapId).Candidates.Where(h => !state.Ships.Any(s => s.Hex == h)).ToArray();
        List<Hex>? best = null;
        var bestScore = int.MaxValue;
        // Sampling keeps terrain constraints strict, with random variation among fair layouts.
        for (var trial = 0; trial < 128; trial++)
        {
            var layout = new List<Hex>();
            for (var i = 0; i < Kinds.Length; i++)
            {
                var available = candidates.Where(h => layout.All(other => h.DistanceTo(other) >= 6)).ToArray();
                if (available.Length == 0) break;
                layout.Add(available[random.Next(available.Length)]);
            }
            if (layout.Count != Kinds.Length) continue;
            // Ownership is chosen after the reveal. Balance geographic access
            // across all ports so the draft itself determines captain access.
            var access = state.Ports.Select(p => layout.Min(h => Distance(p.Id, h, state.MapId))).ToArray();
            var score = (access.Max() - access.Min()) * 1000 + access.Sum();
            if (score >= bestScore) continue;
            bestScore = score; best = layout;
        }
        if (best is null) throw new RuleException("No fair perk layout is available on this board.");
        var kinds = Kinds.ToArray();
        for (var i = kinds.Length - 1; i > 0; i--) { var j = random.Next(i + 1); (kinds[i], kinds[j]) = (kinds[j], kinds[i]); }
        return best.Select((h, i) => new PerkPickup(kinds[i], h.Q, h.R)).ToList();
    }
}
