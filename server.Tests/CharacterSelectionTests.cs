using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    [Theory]
    [InlineData(null, "navigator")]
    [InlineData("", "navigator")]
    [InlineData("red", "navigator")]
    [InlineData("#ed7866", null)]
    [InlineData("#ed7866", "")]
    [InlineData("#ed7866", "unknown")]
    public void Joining_requires_a_valid_color_and_character(string? color, string? character)
    {
        var state = new GameState();
        Assert.Throws<RuleException>(() => Rules(state).Join(new("Captain", color!, character!)));
        Assert.Empty(state.Players); Assert.Empty(state.Events); Assert.Null(state.HostPlayerId);
    }

    [Fact] public void Every_character_can_be_chosen_and_duplicates_are_rejected_independently_of_color()
    {
        foreach (var character in GameRules.Characters)
        {
            var state = new GameState();
            Rules(state).Join(new("First", GameRules.Colors[0], character));
            var error = Assert.Throws<RuleException>(() => Rules(state).Join(new("Second", GameRules.Colors[1], character)));
            Assert.Contains("character is already taken", error.Message);
            Assert.Single(state.Players); Assert.Single(state.Events);
            var other = GameRules.Characters.First(c => c != character);
            error = Assert.Throws<RuleException>(() => Rules(state).Join(new("Second", GameRules.Colors[0], other)));
            Assert.Contains("color is already taken", error.Message);
            Rules(state).Join(new("Second", GameRules.Colors[1], other));
            Assert.Equal(2, state.Players.Count);
        }
    }
}

public partial class GameStateStoreTests
{
    [Theory] [InlineData(true)] [InlineData(false)]
    public async Task Concurrent_character_or_color_claims_reserve_once_and_persist(bool sameCharacter)
    {
        var directory = Directory.CreateTempSubdirectory("marauders-characters-").FullName;
        var store = Store(directory);
        var second = Captain(1) with
        {
            Character = sameCharacter ? Captain(0).Character : Captain(1).Character,
            Color = sameCharacter ? Captain(1).Color : Captain(0).Color
        };
        var results = await Task.WhenAll(store.JoinAsync("first-browser", Captain(0)), store.JoinAsync("second-browser", second));
        Assert.Single(results, r => r.Success);
        Assert.Contains(sameCharacter ? "character is already taken" : "color is already taken", results.Single(r => !r.Success).Error);
        var game = await store.ReadAsync(); var player = Assert.Single(game.Players);
        Assert.Single(game.Events); Assert.Equal(1, game.Revision);
        var winner = results[0].Success ? "first-browser" : "second-browser";
        var loser = results[0].Success ? "second-browser" : "first-browser";
        store = Store(directory);
        Assert.Equal(player.Id, await store.PlayerIdAsync(winner));
        Assert.Null(await store.PlayerIdAsync(loser));
        var reserved = await store.JoinAsync(loser, new("Retry", GameRules.Colors[2], player.Character));
        Assert.False(reserved.Success); Assert.Equal(game.Revision, (await store.ReadAsync()).Revision);
        Assert.True((await store.ActAsync(winner, new("forfeit", ExpectedRevision: game.Revision))).Success);
        store = Store(directory);
        Assert.True((await store.JoinAsync(loser, new("Replacement", player.Color, player.Character))).Success);
        Assert.Null(await store.PlayerIdAsync(winner));
    }

    [Fact] public async Task Rematches_keep_choices_and_empty_resets_release_them()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-character-reset-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        for (var i = 0; i < 4; i++) Assert.True((await store.JoinAsync($"browser-{i}", Captain(i))).Success);
        var before = await store.ReadAsync();
        var retained = (await store.ResetAsync(new(password, before.Id, before.Revision))).State!;
        Assert.Equal(before.Players.Select(p => (p.Id, p.Color, p.Character)), retained.Players.Select(p => (p.Id, p.Color, p.Character)));
        var empty = (await store.ResetAsync(new(password, retained.Id, retained.Revision, ReleaseSeats: true))).State!;
        Assert.Empty(empty.Players);
        Assert.True((await Store(directory, password).JoinAsync("new-browser", Captain(0))).Success);
    }

    [Fact] public void Default_catalog_uses_all_eight_supplied_names_with_stable_saved_ids()
    {
        var catalog = new CharacterCatalog(new TestEnvironment(Directory.CreateTempSubdirectory("marauders-catalog-").FullName));
        Assert.Equal(GameRules.Characters, catalog.Profiles.Select(p => p.Id));
        Assert.Equal(new[] { "Alex the Merciless", "Alyssa the Sea Witch", "Dylan the Salty Dog", "Hayven the Merchant",
            "Jacob the Vengeful", "Jared the Oil Baron", "Josh the Phantom", "Steven the Cruel" }, catalog.Profiles.Select(p => p.Name));
        Assert.All(catalog.Profiles, p => Assert.Matches(@"^/characters/[a-z-]+\.jpg$", p.ImageUrl!));
    }
}
