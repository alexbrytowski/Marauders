namespace Marauders.Server;

public readonly record struct Hex(int Q, int R)
{
    public int DistanceTo(Hex other)
    {
        var dq = Q - other.Q;
        var dr = R - other.R;
        return (Math.Abs(dq) + Math.Abs(dr) + Math.Abs(dq + dr)) / 2;
    }
}

public static class BoardDefinition
{
    // This initial playable sea is intentionally represented independently of the
    // photographed board. It lets the server validate every move deterministically;
    // individual land hexes can be carved out without changing game rules.
    public const int MinQ = 0;
    public const int MaxQ = 28;
    public const int MinR = 0;
    public const int MaxR = 30;

    private static readonly Dictionary<string, Hex> portHexes = new()
    {
        ["port-1"] = new(9, 1), ["port-2"] = new(23, 1), ["port-3"] = new(15, 6),
        ["port-4"] = new(23, 7), ["port-5"] = new(2, 10), ["port-6"] = new(11, 10),
        ["port-7"] = new(17, 14), ["port-8"] = new(26, 14), ["port-9"] = new(4, 18),
        ["port-10"] = new(10, 19), ["port-11"] = new(20, 22), ["port-12"] = new(6, 28),
        ["port-13"] = new(25, 28),
    };
    private static readonly Hex[] directions = [new(1, 0), new(1, -1), new(0, -1), new(-1, 0), new(-1, 1), new(0, 1)];

    public static Hex PortHex(string portId) => portHexes[portId];
    public static IReadOnlyList<Hex> Neighbors(Hex hex) => directions.Select(direction => new Hex(hex.Q + direction.Q, hex.R + direction.R)).Where(IsSailable).ToList();
    public static bool IsSailable(Hex hex) => hex.Q >= MinQ && hex.Q <= MaxQ && hex.R >= MinR && hex.R <= MaxR && !portHexes.Values.Contains(hex);
    public static Hex InitialShipHex(string portId, int slot) => Neighbors(PortHex(portId))[slot];
    public static IReadOnlyList<Hex>? FindPath(Hex start, Hex destination, ISet<Hex> blocked)
    {
        if (!IsSailable(destination) || blocked.Contains(destination)) return null;
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
    public static Hex? NearestEmptyWater(Hex start, ISet<Hex> blocked)
    {
        var queue = new Queue<Hex>(); var visited = new HashSet<Hex> { start }; queue.Enqueue(start);
        while (queue.TryDequeue(out var current))
        {
            if (IsSailable(current) && !blocked.Contains(current)) return current;
            foreach (var neighbor in directions.Select(direction => new Hex(current.Q + direction.Q, current.R + direction.R)))
                if (IsSailable(neighbor) && visited.Add(neighbor)) queue.Enqueue(neighbor);
        }
        return null;
    }
}
