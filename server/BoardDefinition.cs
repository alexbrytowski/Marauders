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

public sealed class BoardMap
{
    public static readonly Hex[] Directions = [new(1, 0), new(1, -1), new(0, -1), new(-1, 0), new(-1, 1), new(0, 1)];
    private readonly MapSource Source;
    public string Version => Source.Version;
    public IReadOnlyList<MapPort> Ports => Source.Ports;
    private readonly Dictionary<string, Hex> PortHexes;
    public IReadOnlyList<BoardCell> Cells { get; }
    private readonly Dictionary<Hex, BoardCell> ByHex;
    public BoardMap(MapSource source)
    {
        Source = source;
        PortHexes = source.Ports.ToDictionary(p => p.Id, p => Offset(p.Col, p.Row));
        Cells = CreateCells();
        ByHex = Cells.ToDictionary(c => c.Hex);
        if (Ports.Count != 13 || PortHexes.Values.Distinct().Count() != 13 || Ports.Any(p => Harbor(p.Id).Count < 2))
            throw new InvalidDataException("A Marauders map needs thirteen distinct ports with at least two harbor cells each.");
    }
    public static BoardMap Load(string file) => new(JsonSerializer.Deserialize<MapSource>(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, file)), new JsonSerializerOptions(JsonSerializerDefaults.Web))!);
    public static Hex Offset(int col, int row) => new(col - (row + 1) / 2, row);
    public Hex PortHex(string portId) => PortHexes[portId];
    public BoardCell? Cell(Hex hex) => ByHex.GetValueOrDefault(hex);
    public static IEnumerable<Hex> Adjacent(Hex hex) => Directions.Select(d => new Hex(hex.Q + d.Q, hex.R + d.R));
    public IEnumerable<Hex> Neighbors(Hex hex) => Adjacent(hex).Where(IsSailable);
    public bool IsSailable(Hex hex) => Cell(hex)?.Terrain is "water" or "harbor";
    public IReadOnlyList<Hex> Harbor(string portId) => Cells.Where(c => c.HarborId == portId).Select(c => c.Hex).ToArray();
    public bool InHarbor(Hex hex, string portId) => Cell(hex)?.HarborId == portId;

    private BoardCell[] CreateCells()
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

    public IReadOnlyList<Hex>? FindPath(Hex start, Hex destination, ISet<Hex> blocked, ISet<Hex>? stops = null)
    {
        if (!IsSailable(start) || !IsSailable(destination) || blocked.Contains(destination)) return null;
        var queue = new Queue<Hex>();
        var previous = new Dictionary<Hex, Hex?> { [start] = null };
        queue.Enqueue(start);
        while (queue.TryDequeue(out var current))
        {
            if (current == destination) break;
            if (current != start && stops?.Contains(current) == true) continue;
            foreach (var neighbor in Neighbors(current))
                if (!blocked.Contains(neighbor) && previous.TryAdd(neighbor, current)) queue.Enqueue(neighbor);
        }
        if (!previous.ContainsKey(destination)) return null;
        var path = new List<Hex>();
        for (Hex? current = destination; current is not null; current = previous[current.Value]) path.Add(current.Value);
        path.Reverse();
        return path;
    }

    public Hex? SpawnHex(string portId, ISet<Hex> occupied)
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

// Classic's stable facade is retained for photo-mapping tools and old test fixtures.
// Live rules resolve the map from the saved match rather than changing global state.
public static class BoardDefinition
{
    public static BoardMap Classic { get; } = BoardMap.Load("board.json");
    public static string Version => Classic.Version;
    public static IReadOnlyList<MapPort> Ports => Classic.Ports;
    public static IReadOnlyList<BoardCell> Cells => Classic.Cells;
    public static readonly Hex[] Directions = BoardMap.Directions;
    public static Hex Offset(int col, int row) => BoardMap.Offset(col, row);
    public static Hex PortHex(string portId) => Classic.PortHex(portId);
    public static BoardCell? Cell(Hex hex) => Classic.Cell(hex);
    public static IEnumerable<Hex> Adjacent(Hex hex) => BoardMap.Adjacent(hex);
    public static IEnumerable<Hex> Neighbors(Hex hex) => Classic.Neighbors(hex);
    public static bool IsSailable(Hex hex) => Classic.IsSailable(hex);
    public static IReadOnlyList<Hex> Harbor(string portId) => Classic.Harbor(portId);
    public static bool InHarbor(Hex hex, string portId) => Classic.InHarbor(hex, portId);
    public static IReadOnlyList<Hex>? FindPath(Hex start, Hex destination, ISet<Hex> blocked) => Classic.FindPath(start, destination, blocked);
    public static Hex? SpawnHex(string portId, ISet<Hex> occupied) => Classic.SpawnHex(portId, occupied);
}
