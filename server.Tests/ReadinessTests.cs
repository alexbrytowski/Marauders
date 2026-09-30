using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private sealed class FirstCaptainDice(int seat) : IDice
    {
        public int Roll(int sides = 6) => sides;
        public int Next(int exclusiveMax) => exclusiveMax == 4 ? seat : 0;
    }

    private static void ReadyCaptain(GameState state, int seat, bool ready = true)
        => Rules(state).Act(state.Players[seat].Id, new("set-ready", IsReady: ready, LobbyVersion: state.LobbyVersion));

    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)] [InlineData(3)]
    public void Only_four_explicit_ready_captains_start_one_game_with_public_random_first_player(int seat)
    {
        var s = Lobby(); var version = s.LobbyVersion;
        var rules = new GameRules(s, new FirstCaptainDice(seat), new(), Now);
        Assert.Null(s.FirstPlayerId);
        Assert.All(s.Players, p => Assert.False(p.IsReady));
        Assert.Throws<RuleException>(() => Rules(s).Act("spectator", new("set-ready", IsReady: true, LobbyVersion: version)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: s.HostPlayerId)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("set-first-player", FirstPlayerId: s.Players[2].Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-first-player", FirstPlayerId: s.Players[2].Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", LobbyVersion: version)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", IsReady: true)));
        for (var i = 0; i < 3; i++) ReadyCaptain(s, i);
        ReadyCaptain(s, 0); // Explicit assignment is idempotent, not a toggle.
        Assert.Equal(3, s.Players.Count(p => p.IsReady));
        Assert.Equal("lobby", s.Phase); Assert.Null(s.MapSelection); Assert.Empty(s.PerkPickups);
        ReadyCaptain(s, 1, false); ReadyCaptain(s, 3);
        Assert.Equal("lobby", s.Phase);
        rules.Act(s.Players[1].Id, new("set-ready", IsReady: true, LobbyVersion: s.LobbyVersion));
        Assert.Equal("playing", s.Phase); Assert.Equal(s.Players[seat].Id, s.ActivePlayerId);
        Assert.Equal(s.ActivePlayerId, s.FirstPlayerId);
        Assert.Equal(s.Players[seat].Id, s.TurnOrder[0]);
        Assert.Single(s.Events, e => e.Kind == "setup" && e.Message.StartsWith("First captain draw:"));
        Assert.Equal(6, s.PerkPickups.Count); Assert.Single(s.Events, e => e.Message.StartsWith("Three geographically balanced random ports"));
        Assert.Throws<RuleException>(() => ReadyCaptain(s, 1));
        Assert.Throws<RuleException>(() => ReadyCaptain(s, 1, false));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-first-player", FirstPlayerId: s.Players[1].Id)));
        Assert.Single(s.Events, e => e.Message.StartsWith("Three geographically balanced random ports"));
    }

    [Fact] public void Setup_changes_invalidate_old_ready_clicks_and_reset_the_affected_captains()
    {
        var s = Lobby(); ReadyCaptain(s, 0); ReadyCaptain(s, 1);
        var version = s.LobbyVersion;
        Rules(s).Act(s.Players[1].Id, new("vote-map", MapId: "narrows"));
        Assert.True(s.Players[0].IsReady); Assert.False(s.Players[1].IsReady);
        Assert.NotEqual(version, s.LobbyVersion);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", IsReady: true, LobbyVersion: version)));
        ReadyCaptain(s, 0); ReadyCaptain(s, 1);
        Rules(s).Act(s.Players[1].Id, new("vote-map", MapId: "delta"));
        Assert.True(s.Players[0].IsReady); Assert.False(s.Players[1].IsReady);
        ReadyCaptain(s, 1); version = s.LobbyVersion;
        Rules(s).Act(s.Players[1].Id, new("vote-map", MapId: "delta"));
        Assert.True(s.Players[1].IsReady); Assert.Equal(version, s.LobbyVersion);
        Rules(s).Act(s.Players[1].Id, new("vote-map"));
        Assert.False(s.Players[1].IsReady);
        for (var i = 0; i < 4; i++) ReadyCaptain(s, i);
        Assert.Equal(s.Players[0].Id, s.ActivePlayerId);
    }

    [Fact] public void Leaving_clears_readiness_but_a_replacement_join_preserves_it()
    {
        var s = Lobby(); ReadyCaptain(s, 0); ReadyCaptain(s, 1); ReadyCaptain(s, 2);
        Rules(s).Act(s.HostPlayerId!, new("forfeit"));
        Assert.Equal(s.Players[0].Id, s.HostPlayerId); Assert.Null(s.FirstPlayerId);
        Assert.All(s.Players, p => Assert.False(p.IsReady));
        for (var i = 0; i < 3; i++) ReadyCaptain(s, i);
        Assert.Equal("lobby", s.Phase); Assert.Null(s.MapSelection);
        var previousVersion = s.LobbyVersion;
        Rules(s).Join(new("Replacement", GameRules.Colors[0], GameRules.Characters[0]));
        Assert.NotEqual(previousVersion, s.LobbyVersion);
        Assert.Equal(new[] { true, true, true, false }, s.Players.Select(p => p.IsReady));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[3].Id,
            new("set-ready", IsReady: true, LobbyVersion: previousVersion)));
        ReadyCaptain(s, 3);
        Assert.Equal("playing", s.Phase);
    }
}

public partial class GameStateStoreTests
{
    [Fact] public async Task Concurrent_ready_commands_persist_and_start_the_game_exactly_once()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-ready-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var before = await store.ReadAsync();
        Assert.False((await store.ActAsync("spectator", new("set-ready", IsReady: true, LobbyVersion: before.LobbyVersion))).Success);
        Assert.False((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: "old-lobby"))).Success);
        Assert.Equal(before.Revision, (await store.ReadAsync()).Revision);
        Assert.False((await store.ActAsync("browser-0", new("set-first-player", FirstPlayerId: before.Players[2].Id))).Success);
        Assert.True((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: before.LobbyVersion))).Success);
        store = Store(directory, password);
        var restored = await store.ReadAsync();
        Assert.Null(restored.FirstPlayerId); Assert.Equal(before.LobbyVersion, restored.LobbyVersion);
        Assert.True(restored.Players[0].IsReady); Assert.Equal("lobby", restored.Phase);
        var results = await Task.WhenAll(Enumerable.Range(1, 3).Select(i => store.ActAsync($"browser-{i}",
            new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion))));
        Assert.All(results, result => Assert.True(result.Success, result.Error));
        var draft = await Store(directory, password).ReadAsync();
        Assert.Equal("playing", draft.Phase); Assert.Equal(draft.Players[0].Id, draft.ActivePlayerId);
        Assert.Equal(draft.ActivePlayerId, draft.FirstPlayerId);
        Assert.Single(draft.Events, e => e.Message.StartsWith("Three geographically balanced random ports")); Assert.Equal(6, draft.PerkPickups.Count);
        Assert.Equal(24, draft.Ships.Count); Assert.All(draft.Players, p => Assert.Equal(3, draft.Ports.Count(port => port.OwnerId == p.Id)));
        var late = await store.ActAsync("browser-3", new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion));
        Assert.False(late.Success); Assert.Equal(draft.Revision, (await store.ReadAsync()).Revision);
        var reset = await store.ResetAsync(new(password, draft.Id, draft.Revision));
        Assert.True(reset.Success); Assert.All(reset.State!.Players, p => Assert.False(p.IsReady));
        Assert.NotEqual(restored.LobbyVersion, reset.State.LobbyVersion);
        Assert.Null(reset.State.FirstPlayerId);
        Assert.False((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion))).Success);
    }

    [Fact] public async Task Legacy_lobby_without_readiness_fields_loads_unready_and_draws_first_at_start()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-legacy-ready-").FullName;
        var store = Store(directory);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var path = Path.Combine(directory, "data", "game-state-v2.json");
        var saved = System.Text.Json.Nodes.JsonNode.Parse(await File.ReadAllTextAsync(path))!;
        var game = saved["game"]!.AsObject(); game.Remove("lobbyVersion"); game.Remove("firstPlayerId");
        foreach (var player in game["players"]!.AsArray()) player!.AsObject().Remove("isReady");
        await File.WriteAllTextAsync(path, saved.ToJsonString());
        store = Store(directory); var legacy = await store.ReadAsync();
        Assert.All(legacy.Players, p => Assert.False(p.IsReady));
        var started = await ReadyCrewAsync(store);
        Assert.Equal("playing", started.Phase); Assert.Equal(legacy.HostPlayerId, started.ActivePlayerId);
    }
}
