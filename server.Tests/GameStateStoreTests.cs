using Marauders.Server;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace Marauders.Server.Tests;

public class GameStateStoreTests
{
    private sealed class TestEnvironment(string directory) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Marauders.Tests";
        public string ContentRootPath { get; set; } = directory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
    private static GameStateStore Store(string directory) => new(new TestEnvironment(directory), Options.Create(new GameOptions()), new FixedDice(), TimeProvider.System);
    private static JoinRequest Captain(int number) => new($"Captain {number}", GameRules.Colors[number], "navigator");

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
        Assert.True((await store.ActAsync("browser-0", new("start-draft", FirstPlayerId: before.Players[2].Id))).Success);
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
        Assert.False((await store.ResetAsync("browser-2")).Success);
        Assert.Equal(before.Revision, (await store.ReadAsync()).Revision);
        Assert.True((await store.ActAsync("browser-0", new("start-draft", FirstPlayerId: before.Players[0].Id))).Success);
        var started = await store.ReadAsync();
        Assert.False((await store.ActAsync("browser-0", new("draft", PortId: "not-a-port"))).Success);
        Assert.Equal(started.Revision, (await store.ReadAsync()).Revision);
    }
}
