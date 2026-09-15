using System.Text.Json.Serialization;

namespace Marauders.Server;

public sealed record MapOption(string Id, string Name, string Description, [property: JsonIgnore] BoardMap Board)
{
    public string Version => Board.Version;
    public string NeutralPortId => Id switch
    {
        "classic" => "port-7",
        "narrows" => "port-12",
        "shattered-isles" => "port-13",
        _ => throw new RuleException("This map needs a designated neutral starting port.")
    };
}

public static class MapCatalog
{
    public static IReadOnlyList<MapOption> All { get; } = [
        new("classic", "Classic", "The original Marauder Sea: familiar coastlines, sheltered harbors, and open crossings.", BoardDefinition.Classic),
        new("narrows", "The Choke", "Six ports ring each sea around one three-ship-wide crossing and a neutral central gate.", BoardMap.Load("maps/narrows.json")),
        new("shattered-isles", "Serpent's Coil", "A northwest island and a winding inner sea, with eastern and southern entrances and a northern cut near the heart.", BoardMap.Load("maps/shattered-isles.json"))
    ];
    private static readonly IReadOnlyDictionary<string, BoardMap> Legacy = new Dictionary<string, BoardMap>
    {
        ["narrows-v2"] = BoardMap.Load("maps/narrows-v2.json"),
        ["shattered-isles-v2"] = BoardMap.Load("maps/shattered-isles-v2.json"),
        ["narrows-v3"] = BoardMap.Load("maps/narrows-v3.json"),
        ["shattered-isles-v3"] = BoardMap.Load("maps/shattered-isles-v3.json"),
        ["narrows-v4"] = BoardMap.Load("maps/narrows-v4.json"),
        ["shattered-isles-v4"] = BoardMap.Load("maps/shattered-isles-v4.json"),
        ["narrows-v5"] = BoardMap.Load("maps/narrows-v5.json"),
        ["shattered-isles-v5"] = BoardMap.Load("maps/shattered-isles-v5.json"),
        ["narrows-v6"] = BoardMap.Load("maps/narrows-v6.json"),
        ["shattered-isles-v6"] = BoardMap.Load("maps/shattered-isles-v6.json")
    };
    public static BoardMap Resolve(string id, string version)
    {
        var map = Get(id);
        if (map.Version == version) return map.Board;
        if (version.StartsWith(id + "-v", StringComparison.Ordinal) && Legacy.TryGetValue(version, out var legacy)) return legacy;
        throw new RuleException("The saved map version is unavailable. Preserve the save before starting a new match.");
    }
    public static string Name(string id, string version) => version == "narrows-v2" ? "The Narrows (legacy)"
        : version == "shattered-isles-v2" ? "Shattered Isles (legacy)"
        : Get(id).Name + (version == Get(id).Version ? "" : " (legacy)");
    public static MapOption? Find(string? id) => All.FirstOrDefault(m => m.Id == id);
    public static MapOption Get(string id) => Find(id) ?? throw new RuleException("Choose a map from the lobby.");
}

public static class MapLottery
{
    public static MapSelection Draw(IReadOnlyList<string> maps, IEnumerable<string> votes, IDice random)
    {
        var counts = maps.ToDictionary(id => id, _ => 0);
        foreach (var id in votes)
        {
            if (!counts.ContainsKey(id)) throw new RuleException("The ballot contains an unavailable map.");
            counts[id]++;
        }
        var noVotes = counts.Values.Sum() == 0;
        var tickets = maps.SelectMany(id => Enumerable.Repeat(id, noVotes ? 1 : counts[id])).ToArray();
        if (tickets.Length == 0) throw new RuleException("No maps are available for this game.");
        var ticket = random.Next(tickets.Length);
        return new(tickets[ticket], ticket + 1, tickets.Length, noVotes, counts);
    }
}
