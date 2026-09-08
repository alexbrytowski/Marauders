using System.Text.Json;

namespace Marauders.Server;

public readonly record struct Hex(int Q, int R)
{
    public int DistanceTo(Hex other) => (Math.Abs(Q - other.Q) + Math.Abs(R - other.R) + Math.Abs(Q - other.Q + R - other.R)) / 2;
}

public sealed record BoardCell(int Q, int R, string Terrain, string? PortId = null, string? HarborId = null)
{
    public Hex Hex => new(Q, R);
}
public sealed record MapPort(string Id, string Name, int Col, int Row);
public sealed record MapSource(string Version, string[] Rows, MapPort[] Ports);

public static class BoardDefinition
{
    public static readonly Hex[] Directions = [new(1, 0), new(1, -1), new(0, -1), new(-1, 0), new(-1, 1), new(0, 1)];
    private static readonly MapSource Source = JsonSerializer.Deserialize<MapSource>(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "board.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    public static string Version => Source.Version;
    public static IReadOnlyList<MapPort> Ports => Source.Ports;
    private static readonly Dictionary<string, Hex> PortHexes = Source.Ports.ToDictionary(p => p.Id, p => Offset(p.Col, p.Row));
    public static IReadOnlyList<BoardCell> Cells { get; } = CreateCells();
    private static readonly Dictionary<Hex, BoardCell> ByHex = Cells.ToDictionary(c => c.Hex);
    public static Hex Offset(int col, int row) => new(col - (row + 1) / 2, row);
    public static Hex PortHex(string portId) => PortHexes[portId];
    public static BoardCell? Cell(Hex hex) => ByHex.GetValueOrDefault(hex);
    public static IEnumerable<Hex> Adjacent(Hex hex) => Directions.Select(d => new Hex(hex.Q + d.Q, hex.R + d.R));
    public static IEnumerable<Hex> Neighbors(Hex hex) => Adjacent(hex).Where(IsSailable);
    public static bool IsSailable(Hex hex) => Cell(hex)?.Terrain is "water" or "harbor";
    public static IReadOnlyList<Hex> Harbor(string portId) => Cells.Where(c => c.HarborId == portId).Select(c => c.Hex).ToArray();
    public static bool InHarbor(Hex hex, string portId) => Cell(hex)?.HarborId == portId;

    private static BoardCell[] CreateCells()
    {
        var result = new List<BoardCell>();
        for (var row = 0; row < Source.Rows.Length; row++)
            for (var col = 0; col < Source.Rows[row].Length; col++)
            {
                var hex = Offset(col, row);
                var port = Source.Ports.SingleOrDefault(p => p.Col == col && p.Row == row);
                var water = Source.Rows[row][col] == '.';
                var harbor = water ? PortHexes.FirstOrDefault(p => p.Value.DistanceTo(hex) == 1).Key : null;
                result.Add(new(hex.Q, hex.R, port is not null ? "port" : harbor is not null ? "harbor" : water ? "water" : "land", port?.Id, harbor));
            }
        return result.ToArray();
    }

    public static IReadOnlyList<Hex>? FindPath(Hex start, Hex destination, ISet<Hex> blocked)
    {
        if (!IsSailable(start) || !IsSailable(destination) || blocked.Contains(destination)) return null;
        var queue = new Queue<Hex>();
        var previous = new Dictionary<Hex, Hex?> { [start] = null };
        queue.Enqueue(start);
        while (queue.TryDequeue(out var current))
        {
            if (current == destination) break;
            foreach (var neighbor in Neighbors(current))
                if (!blocked.Contains(neighbor) && previous.TryAdd(neighbor, current)) queue.Enqueue(neighbor);
        }
        if (!previous.ContainsKey(destination)) return null;
        var path = new List<Hex>();
        for (Hex? current = destination; current is not null; current = previous[current.Value]) path.Add(current.Value);
        path.Reverse();
        return path;
    }

    public static Hex? SpawnHex(string portId, ISet<Hex> occupied)
    {
        foreach (var hex in Harbor(portId)) if (!occupied.Contains(hex)) return hex;
        // Search over water, preferring harbor cells. Occupied cells can be
        // searched through for spillover but never receive a new ship.
        var queue = new Queue<Hex>(Harbor(portId));
        var seen = Harbor(portId).ToHashSet();
        while (queue.TryDequeue(out var current))
        {
            if (Cell(current)?.Terrain == "water" && !occupied.Contains(current)) return current;
            foreach (var neighbor in Neighbors(current)) if (seen.Add(neighbor)) queue.Enqueue(neighbor);
        }
        return null;
    }
}
