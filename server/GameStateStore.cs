using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace Marauders.Server;

// Session bindings are persisted privately and never included in HTTP or hub state.
public sealed class SavedGame
{
    public int SchemaVersion { get; set; } = 2;
    public GameState Game { get; set; } = new();
    public Dictionary<string, string> Seats { get; set; } = [];
}

public sealed class GameStateStore
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string statePath;
    private readonly GameOptions options;
    private readonly IDice dice;
    private readonly TimeProvider clock;
    private SavedGame saved;
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public GameStateStore(IHostEnvironment environment, IOptions<GameOptions> configuration, IDice dice, TimeProvider clock)
    {
        options = configuration.Value; this.dice = dice; this.clock = clock;
        var directory = options.DataDirectory ?? Path.Combine(environment.ContentRootPath, "data");
        statePath = Path.Combine(directory, "game-state-v2.json");
        saved = File.Exists(statePath) ? JsonSerializer.Deserialize<SavedGame>(File.ReadAllText(statePath), JsonOptions)
            ?? throw new InvalidDataException("The saved game is empty.") : new();
        if (saved.SchemaVersion != 2 || saved.Game.BoardVersion != BoardDefinition.Version)
            throw new InvalidDataException("The saved game uses an incompatible board or schema. Preserve it before starting a new match.");
    }
    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, JsonOptions), JsonOptions)!;
    public async Task<GameState> ReadAsync()
    {
        await gate.WaitAsync();
        try { return Clone(saved.Game); } finally { gate.Release(); }
    }
    public async Task<string?> PlayerIdAsync(string browserId)
    {
        await gate.WaitAsync();
        try { return saved.Seats.GetValueOrDefault(browserId); } finally { gate.Release(); }
    }
    public Task<MutationResult> JoinAsync(string browserId, JoinRequest request) => ChangeAsync(candidate =>
    {
        if (candidate.Seats.ContainsKey(browserId)) throw new RuleException("This browser already has a captain. Refresh to return to your seat.");
        var player = Rules(candidate.Game).Join(request);
        candidate.Seats.Add(browserId, player.Id);
    });
    public Task<MutationResult> ActAsync(string browserId, GameCommand command) => ChangeAsync(candidate =>
    {
        if (!candidate.Seats.TryGetValue(browserId, out var actor)) throw new RuleException("You are watching as a spectator.");
        if (command.ExpectedRevision.HasValue && command.ExpectedRevision != candidate.Game.Revision)
            throw new RuleException("The game changed. Review the latest state and try again.");
        Rules(candidate.Game).Act(actor, command);
    });
    public Task<MutationResult> ResetAsync(string browserId) => ChangeAsync(candidate =>
    {
        if (!candidate.Seats.TryGetValue(browserId, out var actor) || candidate.Game.HostPlayerId != actor)
            throw new RuleException("Only the host can start a new local game.");
        candidate.Game = new GameState { Players = candidate.Game.Players, HostPlayerId = actor, Revision = candidate.Game.Revision };
    });
    private GameRules Rules(GameState state) => new(state, dice, options, clock.GetUtcNow());
    private async Task<MutationResult> ChangeAsync(Action<SavedGame> change)
    {
        await gate.WaitAsync();
        try
        {
            var candidate = Clone(saved);
            try { change(candidate); }
            catch (RuleException error) { return new(false, Error: error.Message); }
            await CommitAsync(candidate);
            return new(true, Clone(candidate.Game));
        }
        finally { gate.Release(); }
    }
    public async Task<GameState?> ExpireTurnAsync()
    {
        await gate.WaitAsync();
        try
        {
            var candidate = Clone(saved);
            if (!Rules(candidate.Game).Expire()) return null;
            await CommitAsync(candidate);
            return Clone(candidate.Game);
        }
        finally { gate.Release(); }
    }
    private async Task CommitAsync(SavedGame candidate)
    {
        candidate.Game.Revision++;
        candidate.Game.UpdatedAt = clock.GetUtcNow();
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        var temporary = statePath + ".tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(candidate, JsonOptions));
        File.Move(temporary, statePath, overwrite: true);
        saved = candidate;
    }
}

public sealed class GameHub : Hub;
public sealed class GameHubNotifier(IHubContext<GameHub> hub)
{
    public Task GameUpdatedAsync(GameState state) => hub.Clients.All.SendAsync("gameUpdated", state);
}
