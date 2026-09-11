using System.Text.Json;
using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameStateStoreTests
{
    [Fact] public async Task Older_single_owner_save_finishes_atomically_once_and_survives_restart()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-endgame-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var game = await store.ReadAsync();
        game.Phase = "playing"; game.ActivePlayerId = game.Players[0].Id;
        game.TurnOrder = game.Players.Select(p => p.Id).ToList(); game.TurnNumber = 20;
        game.TurnEndsAt = DateTimeOffset.UtcNow.AddMinutes(1); game.ActionEndsAt = game.TurnEndsAt;
        game.IsBuildPhase = true; game.AvailableBuilds = 2;
        game.Ports[0].OwnerId = game.ActivePlayerId;
        var saved = new SavedGame { Game = game, Seats = game.Players.Select((p, i) => (p.Id, Browser: $"browser-{i}")).ToDictionary(p => p.Browser, p => p.Id) };
        await File.WriteAllTextAsync(Path.Combine(directory, "data", "game-state-v2.json"), JsonSerializer.Serialize(saved, GameStateStore.JsonOptions));
        store = Store(directory);
        var finished = await store.ExpireTurnAsync();
        Assert.NotNull(finished); Assert.Equal("finished", finished.Phase);
        Assert.Equal(game.Revision + 1, finished.Revision); Assert.Equal(game.ActivePlayerId, finished.WinnerId);
        Assert.Equal(12, finished.Ports.Count(p => p.OwnerId is null));
        Assert.False(finished.IsBuildPhase); Assert.Equal(0, finished.AvailableBuilds);
        Assert.True(Assert.Single(finished.RoundHistory).IsFinal); Assert.Null(finished.TurnEndsAt); Assert.Null(finished.ActionEndsAt);
        Assert.Null(await store.ExpireTurnAsync());
        store = Store(directory);
        var reloaded = await store.ReadAsync();
        Assert.Equal(finished.Revision, reloaded.Revision); Assert.Equal(finished.WinnerId, reloaded.WinnerId);
        Assert.Single(reloaded.Events, e => e.Kind == "victory"); Assert.Single(reloaded.RoundHistory);
        Assert.Null(await store.ExpireTurnAsync());
        Assert.False((await store.ActAsync("browser-0", new("end-turn"))).Success);
    }
}
