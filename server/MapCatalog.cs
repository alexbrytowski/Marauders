using System.Text.Json.Serialization;

namespace Marauders.Server;

public sealed record MapOption(string Id, string Name, string Description, [property: JsonIgnore] BoardMap Board)
{
    public string Version => Board.Version;
}

public static class MapCatalog
{
    public static IReadOnlyList<MapOption> All { get; } = [
        new("classic", "Classic", "The original Marauder Sea: familiar coastlines, sheltered harbors, and open crossings.", BoardDefinition.Classic),
        new("narrows", "The Narrows", "Two basins, two contested passages. Hold a crossing or sail for the other gate.", BoardMap.Load("maps/narrows.json")),
        new("shattered-isles", "Shattered Isles", "Scattered islands and several routes. Spread out, flank rivals, and contest the central crown.", BoardMap.Load("maps/shattered-isles.json"))
    ];
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
