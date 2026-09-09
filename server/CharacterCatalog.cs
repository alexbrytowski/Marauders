using System.Text.Json;

namespace Marauders.Server;

public sealed record CharacterProfile(string Id, string Name, string? ImageUrl = null);

public sealed class CharacterCatalog
{
    public static readonly string[] Ids = ["navigator", "corsair", "privateer", "buccaneer", "captain-5", "captain-6", "captain-7", "captain-8"];
    public IReadOnlyList<CharacterProfile> Profiles { get; }

    public CharacterCatalog(IHostEnvironment environment)
    {
        var file = Path.Combine(environment.ContentRootPath, "characters.local.json");
        Profiles = File.Exists(file)
            ? JsonSerializer.Deserialize<List<CharacterProfile>>(File.ReadAllText(file), GameStateStore.JsonOptions)
                ?? throw new InvalidDataException("The character catalog is empty.")
            : Ids.Select((id, i) => new CharacterProfile(id, $"Captain {i + 1}")).ToArray();
        if (Profiles.Count != 8 || !Profiles.Select(p => p.Id).Order().SequenceEqual(Ids.Order()) ||
            Profiles.Any(p => string.IsNullOrWhiteSpace(p.Name) || p.Name.Length > 40 || p.Name.Any(char.IsControl) ||
                (p.ImageUrl is not null && !System.Text.RegularExpressions.Regex.IsMatch(p.ImageUrl, @"^/characters/[a-zA-Z0-9_-]+\.jpe?g$"))))
            throw new InvalidDataException("Configure exactly eight character IDs, names up to 40 characters, and optional /characters/filename.jpg or .jpeg paths.");
    }
}
