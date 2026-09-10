using System.Text.Json;
using System.Security.Cryptography;
using System.Text;
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
        if (saved.SchemaVersion != 2)
            throw new InvalidDataException("The saved game uses an incompatible board or schema. Preserve it before starting a new match.");
        try { MapCatalog.Resolve(saved.Game.MapId, saved.Game.BoardVersion); }
        catch (RuleException error) { throw new InvalidDataException(error.Message); }
        foreach (var ship in saved.Game.Ships.Where(s => s.Perk == "architect")) ship.Perk = "mouth-to-feed";
        saved.Game.PerkPickups = saved.Game.PerkPickups.Select(p => p.Kind == "architect" ? p with { Kind = "mouth-to-feed" } : p).ToList();
        if (saved.Game.Combat is { } battle)
            battle.Ships = battle.Ships.Select(s => s.Perk == "architect" ? s with { Perk = "mouth-to-feed" } : s).ToList();
        Rules(saved.Game).RefreshBuildCapacity();
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
        if (command.Type == "forfeit" && !command.ExpectedRevision.HasValue)
            throw new RuleException("Review and confirm leaving the current game first.");
        if (command.ExpectedRevision.HasValue && command.ExpectedRevision != candidate.Game.Revision)
            throw new RuleException("The game changed. Review the latest state and try again.");
        Rules(candidate.Game).Act(actor, command);
        if (command.Type == "forfeit")
            foreach (var browser in candidate.Seats.Where(s => s.Value == actor).Select(s => s.Key).ToArray()) candidate.Seats.Remove(browser);
    });
    public Task<MutationResult> ResetAsync(ResetRequest request)
    {
        if (string.IsNullOrEmpty(options.ResetPassword))
            return Task.FromResult(new MutationResult(false, Error: "The server owner must configure a reset password first.", StatusCode: 503));
        if (string.IsNullOrEmpty(request.Password) || request.Password.Length > 1024 ||
            !CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(request.Password)),
                SHA256.HashData(Encoding.UTF8.GetBytes(options.ResetPassword))))
            return Task.FromResult(new MutationResult(false, Error: "Incorrect reset password.", StatusCode: 403));
        return ChangeAsync(candidate =>
        {
            if (request.GameId != candidate.Game.Id || request.ExpectedRevision != candidate.Game.Revision)
                throw new RuleException("The game changed. Review the latest state before resetting.");
            candidate.Game = new GameState
            {
                Players = request.ReleaseSeats ? [] : candidate.Game.Players.Where(p => !p.HasForfeited && candidate.Seats.ContainsValue(p.Id)).ToList(),
                HostPlayerId = request.ReleaseSeats ? null : candidate.Game.Players.FirstOrDefault(p => !p.HasForfeited && candidate.Seats.ContainsValue(p.Id))?.Id,
                Revision = candidate.Game.Revision
            };
            if (request.ReleaseSeats) candidate.Seats.Clear();
            candidate.Game.FirstPlayerId = candidate.Game.HostPlayerId;
            foreach (var player in candidate.Game.Players) player.IsReady = false;
        }, archive: true);
    }
    private GameRules Rules(GameState state) => new(state, dice, options, clock.GetUtcNow());
    private async Task<MutationResult> ChangeAsync(Action<SavedGame> change, bool archive = false)
    {
        await gate.WaitAsync();
        try
        {
            var candidate = Clone(saved);
            try { change(candidate); }
            catch (RuleException error) { return new(false, Error: error.Message); }
            if (archive)
            {
                var directory = Path.Combine(Path.GetDirectoryName(statePath)!, "backups");
                Directory.CreateDirectory(directory);
                var backup = Path.Combine(directory, $"before-reset-{clock.GetUtcNow():yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.json");
                await File.WriteAllTextAsync(backup, JsonSerializer.Serialize(saved, JsonOptions));
            }
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
