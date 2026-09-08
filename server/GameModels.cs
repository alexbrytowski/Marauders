namespace Marauders.Server;

public sealed class GameState
{
    public string Phase { get; set; } = "lobby";
    public List<Player> Players { get; set; } = [];
    public List<Port> Ports { get; set; } = Enumerable.Range(1, 13).Select(number => new Port { Id = $"port-{number}", Name = $"Port {number}" }).ToList();
    public List<Ship> Ships { get; set; } = [];
    public List<Construction> Constructions { get; set; } = [];
    public int DraftPickNumber { get; set; }
    public string? ActivePlayerId { get; set; }
    public int RemainingActions { get; set; }
    public int? LastRoll { get; set; }
    public int RemainingMovement { get; set; }
    public int TurnNumber { get; set; }
    public DateTimeOffset? TurnEndsAt { get; set; }
    public CombatState? Combat { get; set; }
    public bool IsBuildPhase { get; set; }
    public int AvailableBuilds { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Player
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#d84a4a";
}

public sealed class Port
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? OwnerId { get; set; }
    public int DefenseWeakness { get; set; }
}

public sealed class Ship
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public string PortId { get; set; } = "";
    public int Slot { get; set; }
    public int Q { get; set; }
    public int R { get; set; }
}

public sealed class Construction
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public string PortId { get; set; } = "";
    public int RemainingOwnerTurns { get; set; } = 2;
    public int StartedTurnNumber { get; set; }
}

public sealed class CombatState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string TriggerShipId { get; set; } = "";
    public string OpponentShipId { get; set; } = "";
    public List<string> ParticipantShipIds { get; set; } = [];
    public string Status { get; set; } = "awaiting-roll";
    public string? LosingPlayerId { get; set; }
    public Dictionary<string, List<int>> Rolls { get; set; } = [];
}

public sealed record MutationResult(bool Success, GameState? State = null, string? Error = null);
