using System.Text.Json;

namespace Marauders.Server;

public sealed record CharacterProfile(string Id, string Name, string? ImageUrl = null);

public sealed class CharacterCatalog
{
    public static readonly string[] Ids = ["navigator", "corsair", "privateer", "buccaneer", "captain-5", "captain-6", "captain-7", "captain-8"];
    private static readonly CharacterProfile[] DefaultProfiles =
    [
        new("navigator", "Alex the Merciless", "/characters/alex-the-merciless.jpg"),
        new("corsair", "Alyssa the Sea Witch", "/characters/alyssa-the-witch.jpg"),
        new("privateer", "Dylan the Salty Dog", "/characters/dylan-the-salty-dog.jpg"),
        new("buccaneer", "Hayven the Merchant", "/characters/hayven-the-merchant.jpg"),
        new("captain-5", "Jacob the Vengeful", "/characters/jacob-the-vengeful.jpg"),
        new("captain-6", "Jared the Oil Baron", "/characters/jared-the-oil-baron.jpg"),
        new("captain-7", "Josh the Phantom", "/characters/josh-the-phantom.jpg"),
        new("captain-8", "Steven the Cruel", "/characters/steven-the-cruel.jpg"),
    ];
    public IReadOnlyList<CharacterProfile> Profiles { get; }

    public CharacterCatalog(IHostEnvironment environment)
    {
        var file = Path.Combine(environment.ContentRootPath, "characters.local.json");
        Profiles = File.Exists(file)
            ? JsonSerializer.Deserialize<List<CharacterProfile>>(File.ReadAllText(file), GameStateStore.JsonOptions)
                ?? throw new InvalidDataException("The character catalog is empty.")
            : DefaultProfiles;
        if (Profiles.Count != 8 || !Profiles.Select(p => p.Id).Order().SequenceEqual(Ids.Order()) ||
            Profiles.Any(p => string.IsNullOrWhiteSpace(p.Name) || p.Name.Length > 40 || p.Name.Any(char.IsControl) ||
                (p.ImageUrl is not null && !System.Text.RegularExpressions.Regex.IsMatch(p.ImageUrl, @"^/characters/[a-zA-Z0-9_-]+\.jpe?g$"))))
            throw new InvalidDataException("Configure exactly eight character IDs, names up to 40 characters, and optional /characters/filename.jpg or .jpeg paths.");
    }
}
