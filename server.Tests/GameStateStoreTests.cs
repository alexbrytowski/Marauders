using Marauders.Server;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameStateStoreTests
{
    private sealed class TestEnvironment(string directory) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Marauders.Tests";
        public string ContentRootPath { get; set; } = directory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    private static GameStateStore Store(string directory, string? password = null) => new(new TestEnvironment(directory), Options.Create(new GameOptions { ResetPassword = password }), new FixedDice(), TimeProvider.System);
    private static JoinRequest Captain(int number) => new($"Captain {number}", GameRules.Colors[number], "navigator");
    private static async Task<GameState> ReadyCrewAsync(GameStateStore store, string? first = null, string prefix = "browser-")
    {
        var lobby = await store.ReadAsync();
        Assert.True((await store.ActAsync(prefix + "0", new("set-first-player", FirstPlayerId: first ?? lobby.HostPlayerId))).Success);
        lobby = await store.ReadAsync();
        foreach (var i in Enumerable.Range(0, 4))
            Assert.True((await store.ActAsync(prefix + i, new("set-ready", IsReady: true, LobbyVersion: lobby.LobbyVersion))).Success);
        return await store.ReadAsync();
    }

    [Fact] public async Task Forfeit_is_revision_checked_releases_identity_and_persists_across_restart()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-forfeit-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var game = await store.ReadAsync();
        Assert.False((await store.ActAsync("spectator", new("forfeit", ExpectedRevision: game.Revision))).Success);
        Assert.False((await store.ActAsync("browser-0", new("forfeit"))).Success);
        Assert.False((await store.ActAsync("browser-0", new("forfeit", ExpectedRevision: game.Revision - 1))).Success);
        Assert.Equal(4, (await store.ReadAsync()).Players.Count);
        Assert.True((await store.ActAsync("browser-0", new("forfeit", ExpectedRevision: game.Revision))).Success);
        store = Store(directory); Assert.Null(await store.PlayerIdAsync("browser-0"));
        Assert.Equal(3, (await store.ReadAsync()).Players.Count);
        Assert.False((await store.ActAsync("browser-0", new("start-draft", FirstPlayerId: game.Players[1].Id))).Success);
        Assert.True((await store.JoinAsync("browser-0", Captain(0))).Success);
    }

    [Theory] [InlineData("classic", "original-map-v2")] [InlineData("narrows", "narrows-v2")]
    [InlineData("shattered-isles", "shattered-isles-v2")] [InlineData("narrows", "narrows-v3")]
    [InlineData("shattered-isles", "shattered-isles-v3")]
    public async Task Legacy_geometry_and_architect_migration_preserve_saved_ships_and_whirlpool_timer(string mapId, string version)
    {
        var directory = Directory.CreateTempSubdirectory("marauders-legacy-").FullName;
        var data = Path.Combine(directory, "data"); Directory.CreateDirectory(data);
        var board = MapCatalog.Resolve(mapId, version);
        var saved = new SavedGame(); saved.Game.MapId = mapId; saved.Game.BoardVersion = version;
        saved.Game.Ships.Add(new() { OwnerId = "captain", Perk = "architect", Q = 4, R = 8 });
        saved.Game.IsBuildPhase = true; saved.Game.ActivePlayerId = "captain"; saved.Game.Ports[0].OwnerId = "captain";
        saved.Game.PerkPickups.Add(new("architect", 6, 10));
        saved.Game.Whirlpool = new() { First = new(5, 3), Second = new(5, 20), RemainingTurns = 3 };
        await File.WriteAllTextAsync(Path.Combine(data, "game-state-v2.json"), System.Text.Json.JsonSerializer.Serialize(saved, GameStateStore.JsonOptions));
        var game = await Store(directory).ReadAsync();
        Assert.Equal(version, game.BoardVersion); Assert.Same(board, MapCatalog.Resolve(game.MapId, game.BoardVersion));
        Assert.Equal("mouth-to-feed", Assert.Single(game.Ships).Perk); Assert.Equal(new(4, 8), game.Ships[0].Hex);
        Assert.Equal("mouth-to-feed", Assert.Single(game.PerkPickups).Kind);
        Assert.Equal(2, game.AvailableBuilds);
        Assert.Equal(3, game.Whirlpool!.RemainingTurns); Assert.Equal(new(5, 20), game.Whirlpool.Second);
    }

    [Fact] public async Task Leaving_finished_match_preserves_result_and_rematch_only_retains_bound_captains()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-finished-leave-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var game = await store.ReadAsync(); game.Phase = "finished"; game.WinnerId = game.Players[0].Id;
        var saved = new SavedGame { Game = game, Seats = game.Players.Select((p, i) => (p.Id, Browser: $"browser-{i}")).ToDictionary(p => p.Browser, p => p.Id) };
        await File.WriteAllTextAsync(Path.Combine(directory, "data", "game-state-v2.json"), System.Text.Json.JsonSerializer.Serialize(saved, GameStateStore.JsonOptions));
        store = Store(directory, password);
        var left = (await store.ActAsync("browser-0", new("forfeit", ExpectedRevision: game.Revision))).State!;
        Assert.Equal(game.WinnerId, left.WinnerId); Assert.Equal(4, left.Players.Count); Assert.Null(await store.PlayerIdAsync("browser-0"));
        var reset = (await store.ResetAsync(new(password, left.Id, left.Revision))).State!;
        Assert.Equal(3, reset.Players.Count); Assert.Equal(game.Players[1].Id, reset.HostPlayerId);
        Assert.True((await store.JoinAsync("browser-0", Captain(0))).Success);
    }

    [Theory] [InlineData("draft")] [InlineData("placement")]
    public async Task Legacy_setup_resumes_once_and_persists_without_replacing_existing_ships_or_seats(string phase)
    {
        var directory = Directory.CreateTempSubdirectory("marauders-setup-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var game = await store.ReadAsync();
        game = await ReadyCrewAsync(store);
        for (var i = 0; i < (phase == "draft" ? 3 : 12); i++)
        {
            var browser = $"browser-{game.Players.FindIndex(p => p.Id == game.ActivePlayerId)}";
            game = (await store.ActAsync(browser, new("draft", PortId: game.Ports[i].Id))).State!;
        }
        game.Phase = phase; game.PerkPickups.Clear(); game.TurnEndsAt = null; game.ActionEndsAt = null;
        game.Ships = game.Ships.Take(5).ToList();
        var originalShips = game.Ships.Select(s => (s.Id, s.OwnerId, s.Hex)).ToArray();
        var seats = game.Players.Select((p, i) => (p.Id, Browser: $"browser-{i}")).ToDictionary(p => p.Browser, p => p.Id);
        var path = Path.Combine(directory, "data", "game-state-v2.json");
        await File.WriteAllTextAsync(path, System.Text.Json.JsonSerializer.Serialize(new SavedGame { Game = game, Seats = seats }, GameStateStore.JsonOptions));
        store = Store(directory);
        var resumed = await store.ExpireTurnAsync(); Assert.NotNull(resumed);
        Assert.Equal(game.Revision + 1, resumed.Revision); Assert.Equal(game.Id, resumed.Id);
        Assert.Equal(4, resumed.PerkPickups.Count);
        Assert.Equal(phase == "draft" ? "draft" : "playing", resumed.Phase);
        Assert.Equal(phase == "draft" ? 0 : 24, resumed.Ships.Count);
        Assert.All(originalShips, original => Assert.Contains(resumed.Ships, s => (s.Id, s.OwnerId, s.Hex) == original));
        if (phase == "placement") { Assert.Equal(game.TurnOrder[0], resumed.ActivePlayerId); Assert.Equal(1, resumed.TurnNumber); }
        else Assert.Equal(game.ActivePlayerId, resumed.ActivePlayerId);
        var reloaded = Store(directory); Assert.Null(await reloaded.ExpireTurnAsync());
        var persisted = await reloaded.ReadAsync();
        Assert.Equal(resumed.Revision, persisted.Revision); Assert.Equal(resumed.PerkPickups, persisted.PerkPickups);
        Assert.Equal(resumed.Ships.Select(s => s.Id), persisted.Ships.Select(s => s.Id));
        foreach (var seat in seats) Assert.Equal(seat.Value, await reloaded.PlayerIdAsync(seat.Key));
    }

    [Fact] public async Task Concurrent_joins_from_one_browser_claim_exactly_one_seat()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-store-").FullName;
        var store = Store(directory);
        var results = await Task.WhenAll(store.JoinAsync("browser-a", Captain(0)), store.JoinAsync("browser-a", Captain(1)));
        Assert.Single(results, r => r.Success);
        var state = await store.ReadAsync(); Assert.Single(state.Players);
        Assert.Equal(state.Players[0].Id, await store.PlayerIdAsync("browser-a"));
        Assert.Null(await store.PlayerIdAsync("spectator"));
    }
    [Fact] public async Task Seats_and_state_survive_restart_and_public_snapshots_are_independent()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-store-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) Assert.True((await store.JoinAsync($"browser-{i}", Captain(i))).Success);
        var before = await store.ReadAsync();
        await ReadyCrewAsync(store, before.Players[2].Id);
        var restored = Store(directory); var after = await restored.ReadAsync();
        Assert.Equal("draft", after.Phase); Assert.Equal(before.Players[2].Id, after.ActivePlayerId);
        Assert.Equal(before.Players[0].Id, await restored.PlayerIdAsync("browser-0"));
        after.Players.Clear();
        Assert.Equal(4, (await restored.ReadAsync()).Players.Count);
    }
    [Fact] public async Task Spectators_wrong_seats_stale_commands_and_bad_input_do_not_mutate_state()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-store-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var before = await store.ReadAsync();
        Assert.False((await store.ActAsync("spectator", new("start-draft", FirstPlayerId: before.Players[0].Id))).Success);
        Assert.False((await store.ActAsync("browser-1", new("start-draft", FirstPlayerId: before.Players[0].Id))).Success);
        Assert.False((await store.ActAsync("browser-0", new("start-draft", FirstPlayerId: before.Players[0].Id, ExpectedRevision: before.Revision - 1))).Success);
        Assert.False((await store.ResetAsync(new("wrong", before.Id, before.Revision))).Success);
        Assert.Equal(before.Revision, (await store.ReadAsync()).Revision);
        await ReadyCrewAsync(store);
        var started = await store.ReadAsync();
        Assert.False((await store.ActAsync("browser-0", new("draft", PortId: "not-a-port"))).Success);
        Assert.Equal(started.Revision, (await store.ReadAsync()).Revision);
    }

    [Fact] public async Task Password_reset_preserves_or_releases_seats_archives_save_and_rejects_stale_requests()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-reset-").FullName;
        var password = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
        var store = Store(directory, password);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var before = await store.ReadAsync();
        var request = new ResetRequest(password, before.Id, before.Revision);
        Assert.Equal(403, (await store.ResetAsync(request with { Password = "incorrect" })).StatusCode);
        Assert.False((await store.ResetAsync(request with { ExpectedRevision = before.Revision - 1 })).Success);
        Assert.Equal(before.Revision, (await store.ReadAsync()).Revision);
        Assert.True((await store.ResetAsync(request)).Success);
        var rematch = await store.ReadAsync();
        Assert.NotEqual(before.Id, rematch.Id); Assert.Equal(before.Revision + 1, rematch.Revision);
        Assert.Equal(before.Players.Select(p => p.Id), rematch.Players.Select(p => p.Id));
        Assert.Equal(before.Players[0].Id, await store.PlayerIdAsync("browser-0"));
        Assert.False((await store.ResetAsync(request)).Success);
        var archive = Assert.Single(Directory.GetFiles(Path.Combine(directory, "data", "backups")));
        var json = await File.ReadAllTextAsync(archive);
        Assert.DoesNotContain(password, json);
        var saved = System.Text.Json.JsonSerializer.Deserialize<SavedGame>(json, GameStateStore.JsonOptions)!;
        Assert.Equal(before.Id, saved.Game.Id); Assert.Equal(4, saved.Seats.Count);
        Assert.True((await store.ResetAsync(new(password, rematch.Id, rematch.Revision, ReleaseSeats: true))).Success);
        var restored = Store(directory, password); var empty = await restored.ReadAsync();
        Assert.Empty(empty.Players); Assert.Null(empty.HostPlayerId); Assert.Null(await restored.PlayerIdAsync("browser-0"));
        Assert.Empty(empty.RoundHistory); Assert.Empty(empty.PerkPickups);
        Assert.True((await restored.JoinAsync("browser-0", Captain(0))).Success);
    }

    [Fact] public async Task A_failed_reset_archive_does_not_replace_the_active_game()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-reset-failure-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        await store.JoinAsync("browser", Captain(0)); var before = await store.ReadAsync();
        await File.WriteAllTextAsync(Path.Combine(directory, "data", "backups"), "Prevent directory creation");
        await Assert.ThrowsAsync<IOException>(() => store.ResetAsync(new(password, before.Id, before.Revision)));
        Assert.Equal(before.Id, (await store.ReadAsync()).Id);
        Assert.Equal(before.Id, (await Store(directory).ReadAsync()).Id);
    }

    [Fact] public async Task Perks_and_round_history_survive_reload_without_exposing_private_bindings()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-perks-save-").FullName;
        var data = Path.Combine(directory, "data"); Directory.CreateDirectory(data);
        var saved = new SavedGame(); saved.Seats.Add("private-browser", "captain");
        saved.Game.Ships.Add(new() { OwnerId = "captain", Perk = "glass-cannon", ConvertedTurnNumber = 2 });
        saved.Game.PerkPickups.Add(new("mouth-to-feed", 5, 5));
        saved.Game.RoundHistory.Add(new(2, "captain", DateTimeOffset.UtcNow, false, [new("captain", 1, 3)]));
        await File.WriteAllTextAsync(Path.Combine(data, "game-state-v2.json"), System.Text.Json.JsonSerializer.Serialize(saved, GameStateStore.JsonOptions));
        var store = Store(directory); var state = await store.ReadAsync();
        Assert.Equal("glass-cannon", Assert.Single(state.Ships).Perk);
        Assert.Equal("mouth-to-feed", Assert.Single(state.PerkPickups).Kind); Assert.Equal(3, Assert.Single(state.RoundHistory).Teams[0].Ports);
        Assert.DoesNotContain("private-browser", System.Text.Json.JsonSerializer.Serialize(state, GameStateStore.JsonOptions));
        state.RoundHistory[0].Teams.Clear(); Assert.Single((await store.ReadAsync()).RoundHistory[0].Teams);
    }

    [Fact] public async Task Ballots_and_selected_maps_survive_restart_and_reset_clears_them()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-maps-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"private-browser-{i}", Captain(i));
        var lobby = await store.ReadAsync();
        Assert.False((await store.ActAsync("spectator", new("vote-map", MapId: "narrows"))).Success);
        Assert.True((await store.ActAsync("private-browser-1", new("vote-map", MapId: "narrows"))).Success);
        store = Store(directory, password);
        Assert.Equal("narrows", (await store.ReadAsync()).MapVotes[lobby.Players[1].Id]);
        await ReadyCrewAsync(store, prefix: "private-browser-");
        var selected = await Store(directory, password).ReadAsync();
        Assert.Equal("narrows", selected.MapId); Assert.Equal("narrows-v4", selected.BoardVersion);
        Assert.Equal("Westwatch", selected.Ports[0].Name); Assert.Equal("narrows", selected.MapSelection!.MapId);
        Assert.DoesNotContain("private-browser", System.Text.Json.JsonSerializer.Serialize(selected, GameStateStore.JsonOptions));
        Assert.True((await store.ResetAsync(new(password, selected.Id, selected.Revision))).Success);
        var reset = await Store(directory, password).ReadAsync();
        Assert.Equal("classic", reset.MapId); Assert.Empty(reset.MapVotes); Assert.Null(reset.MapSelection);
    }
}
