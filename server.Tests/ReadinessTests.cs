using Marauders.Server;
using Xunit;

namespace Marauders.Server.Tests;

public partial class GameRulesTests
{
    private static void ReadyCaptain(GameState state, int seat, bool ready = true)
        => Rules(state).Act(state.Players[seat].Id, new("set-ready", IsReady: ready, LobbyVersion: state.LobbyVersion));

    [Fact] public void Only_four_explicit_ready_captains_start_one_draft_with_public_first_player()
    {
        var s = Lobby(); var version = s.LobbyVersion;
        Assert.All(s.Players, p => Assert.False(p.IsReady));
        Assert.Throws<RuleException>(() => Rules(s).Act("spectator", new("set-ready", IsReady: true, LobbyVersion: version)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("start-draft", FirstPlayerId: s.HostPlayerId)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.Players[1].Id, new("set-first-player", FirstPlayerId: s.Players[2].Id)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-first-player", FirstPlayerId: "unknown")));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", LobbyVersion: version)));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", IsReady: true)));
        for (var i = 0; i < 3; i++) ReadyCaptain(s, i);
        ReadyCaptain(s, 0); // Explicit assignment is idempotent, not a toggle.
        Assert.Equal(3, s.Players.Count(p => p.IsReady));
        Assert.Equal("lobby", s.Phase); Assert.Null(s.MapSelection); Assert.Empty(s.PerkPickups);
        ReadyCaptain(s, 1, false); ReadyCaptain(s, 3);
        Assert.Equal("lobby", s.Phase);
        ReadyCaptain(s, 1);
        Assert.Equal("draft", s.Phase); Assert.Equal(s.HostPlayerId, s.ActivePlayerId);
        Assert.Equal(4, s.PerkPickups.Count); Assert.Single(s.Events, e => e.Kind == "draft");
        Assert.Throws<RuleException>(() => ReadyCaptain(s, 1));
        Assert.Throws<RuleException>(() => ReadyCaptain(s, 1, false));
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-first-player", FirstPlayerId: s.Players[1].Id)));
        Assert.Single(s.Events, e => e.Kind == "draft");
    }

    [Fact] public void Setup_changes_invalidate_old_ready_clicks_and_reset_the_affected_captains()
    {
        var s = Lobby(); ReadyCaptain(s, 0); ReadyCaptain(s, 1);
        var version = s.LobbyVersion;
        Rules(s).Act(s.HostPlayerId!, new("set-first-player", FirstPlayerId: s.Players[2].Id));
        Assert.All(s.Players, p => Assert.False(p.IsReady));
        Assert.NotEqual(version, s.LobbyVersion);
        Assert.Throws<RuleException>(() => Rules(s).Act(s.HostPlayerId!, new("set-ready", IsReady: true, LobbyVersion: version)));
        ReadyCaptain(s, 0); ReadyCaptain(s, 1);
        Rules(s).Act(s.Players[1].Id, new("vote-map", MapId: "narrows"));
        Assert.True(s.Players[0].IsReady); Assert.False(s.Players[1].IsReady);
        ReadyCaptain(s, 1); version = s.LobbyVersion;
        Rules(s).Act(s.Players[1].Id, new("vote-map", MapId: "narrows"));
        Assert.True(s.Players[1].IsReady); Assert.Equal(version, s.LobbyVersion);
        Rules(s).Act(s.Players[1].Id, new("vote-map"));
        Assert.False(s.Players[1].IsReady);
        for (var i = 0; i < 4; i++) ReadyCaptain(s, i);
        Assert.Equal(s.Players[2].Id, s.ActivePlayerId);
    }

    [Fact] public void Leaving_or_joining_changes_the_crew_and_requires_fresh_readiness()
    {
        var s = Lobby(); ReadyCaptain(s, 0); ReadyCaptain(s, 1); ReadyCaptain(s, 2);
        Rules(s).Act(s.HostPlayerId!, new("forfeit"));
        Assert.Equal(s.Players[0].Id, s.HostPlayerId); Assert.Equal(s.HostPlayerId, s.FirstPlayerId);
        Assert.All(s.Players, p => Assert.False(p.IsReady));
        for (var i = 0; i < 3; i++) ReadyCaptain(s, i);
        Assert.Equal("lobby", s.Phase); Assert.Null(s.MapSelection);
        Rules(s).Join(new("Replacement", GameRules.Colors[0], GameRules.Characters[0]));
        Assert.All(s.Players, p => Assert.False(p.IsReady)); Assert.Equal("lobby", s.Phase);
    }
}

public partial class GameStateStoreTests
{
    [Fact] public async Task Concurrent_ready_commands_persist_and_start_the_draft_exactly_once()
    {
        var directory = Directory.CreateTempSubdirectory("marauders-ready-").FullName;
        var password = Guid.NewGuid().ToString("N"); var store = Store(directory, password);
        for (var i = 0; i < 4; i++) await store.JoinAsync($"browser-{i}", Captain(i));
        var before = await store.ReadAsync();
        Assert.False((await store.ActAsync("spectator", new("set-ready", IsReady: true, LobbyVersion: before.LobbyVersion))).Success);
        Assert.False((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: "old-lobby"))).Success);
        Assert.Equal(before.Revision, (await store.ReadAsync()).Revision);
        Assert.True((await store.ActAsync("browser-0", new("set-first-player", FirstPlayerId: before.Players[2].Id))).Success);
        before = await store.ReadAsync();
        Assert.True((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: before.LobbyVersion))).Success);
        store = Store(directory, password);
        var restored = await store.ReadAsync();
        Assert.Equal(before.Players[2].Id, restored.FirstPlayerId); Assert.Equal(before.LobbyVersion, restored.LobbyVersion);
        Assert.True(restored.Players[0].IsReady); Assert.Equal("lobby", restored.Phase);
        var results = await Task.WhenAll(Enumerable.Range(1, 3).Select(i => store.ActAsync($"browser-{i}",
            new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion))));
        Assert.All(results, result => Assert.True(result.Success, result.Error));
        var draft = await Store(directory, password).ReadAsync();
        Assert.Equal("draft", draft.Phase); Assert.Equal(restored.FirstPlayerId, draft.ActivePlayerId);
        Assert.Single(draft.Events, e => e.Kind == "draft"); Assert.Equal(4, draft.PerkPickups.Count);
        var late = await store.ActAsync("browser-3", new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion));
        Assert.False(late.Success); Assert.Equal(draft.Revision, (await store.ReadAsync()).Revision);
        var reset = await store.ResetAsync(new(password, draft.Id, draft.Revision));
        Assert.True(reset.Success); Assert.All(reset.State!.Players, p => Assert.False(p.IsReady));
        Assert.NotEqual(restored.LobbyVersion, reset.State.LobbyVersion);
        Assert.Equal(reset.State.HostPlayerId, reset.State.FirstPlayerId);
        Assert.False((await store.ActAsync("browser-0", new("set-ready", IsReady: true, LobbyVersion: restored.LobbyVersion))).Success);
    }

    [Fact] public async Task Legacy_lobby_without_readiness_fields_loads_unready_with_host_first()
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
        Assert.Equal("draft", started.Phase); Assert.Equal(legacy.HostPlayerId, started.ActivePlayerId);
    }
}
