namespace Marauders.Server;

public sealed class GameState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string BoardVersion { get; set; } = BoardDefinition.Version;
    public string MapId { get; set; } = "classic";
    public Dictionary<string, string> MapVotes { get; set; } = [];
    public MapSelection? MapSelection { get; set; }
    public long Revision { get; set; }
    public string Phase { get; set; } = "lobby";
    public string? HostPlayerId { get; set; }
    public string? FirstPlayerId { get; set; }
    public string LobbyVersion { get; set; } = Guid.NewGuid().ToString("N");
    public string? WinnerId { get; set; }
    public List<Player> Players { get; set; } = [];
    public List<Port> Ports { get; set; } = BoardDefinition.Ports.Select(p => new Port { Id = p.Id, Name = p.Name }).ToList();
    public List<Ship> Ships { get; set; } = [];
    public List<Construction> Constructions { get; set; } = [];
    public List<string> TurnOrder { get; set; } = [];
    public List<string> PlacementDone { get; set; } = [];
    public int DraftPickNumber { get; set; }
    public string? ActivePlayerId { get; set; }
    public int RemainingActions { get; set; }
    public int RemainingMovement { get; set; }
    public int? LastRoll { get; set; }
    public int TurnNumber { get; set; }
    public DateTimeOffset? TurnEndsAt { get; set; }
    public DateTimeOffset? ActionEndsAt { get; set; }
    public bool IsBuildPhase { get; set; }
    public bool IsEndingRound { get; set; }
    public int AvailableBuilds { get; set; }
    public CombatState? Combat { get; set; }
    public List<CombatChoice> CombatChoices { get; set; } = [];
    public string? CombatPlayerId
    {
        get
        {
            if (Combat is { } battle)
                return ActivePlayerId == battle.AttackerId || ActivePlayerId == battle.DefenderId
                    ? ActivePlayerId : battle.AttackerId;
            var captains = CombatChoices.SelectMany(c => new[] { c.TriggerShipId, c.OpponentShipId })
                .Select(id => Ships.FirstOrDefault(s => s.Id == id)?.OwnerId).OfType<string>().ToArray();
            return captains.Contains(ActivePlayerId) ? ActivePlayerId : captains.FirstOrDefault();
        }
    }
    public List<GameEvent> Events { get; set; } = [];
    public List<RoundSnapshot> RoundHistory { get; set; } = [];
    public List<PerkPickup> PerkPickups { get; set; } = [];
    public WhirlpoolPair? Whirlpool { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class Player
{
    public bool IsReady { get; set; }
    public bool HasForfeited { get; set; }
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#ed7866";
    public string Character { get; set; } = "navigator";
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
    public string? Perk { get; set; }
    public int? ConvertedTurnNumber { get; set; }
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public string PortId { get; set; } = "";
    public int Number { get; set; }
    public int Q { get; set; }
    public int R { get; set; }
    public Hex Hex => new(Q, R);
}
public sealed class Construction
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public string PortId { get; set; } = "";
    public int RemainingOwnerTurns { get; set; } = 2;
    public int StartedTurnNumber { get; set; }
}
public sealed record CombatChoice(string Id, string TriggerShipId, string OpponentShipId, string? HarborId);
public sealed record BattleShip(string Id, string OwnerId, int Number, int Q, int R, string? Perk);
public sealed class CombatState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Kind { get; set; } = "ships";
    public string TriggerShipId { get; set; } = "";
    public string? OpponentShipId { get; set; }
    public string AttackerId { get; set; } = "";
    public string DefenderId { get; set; } = "";
    public string? PortId { get; set; }
    public List<string> ParticipantShipIds { get; set; } = [];
    public List<BattleShip> Ships { get; set; } = [];
    public List<string> SupportingPortIds { get; set; } = [];
    public string Status { get; set; } = "awaiting-roll";
    public string? LosingPlayerId { get; set; }
    public string? WinnerId { get; set; }
    public Dictionary<string, List<int>> Rolls { get; set; } = [];
    public string? BlackWhiteResult { get; set; }
    public string? BlackWhiteOwnerId { get; set; }
    public int DefenseModifier { get; set; }
    public int Round { get; set; }
    public string Message { get; set; } = "All captains are watching.";
}
public sealed record GameEvent(string Id, DateTimeOffset At, int Turn, string Kind, string Message,
    Dictionary<string, List<int>>? Rolls = null, string? BlackWhiteResult = null, string? BlackWhiteOwnerId = null);
public sealed record GameCommand(string Type, string? PortId = null, string? ShipId = null, int? Q = null, int? R = null,
    string? CombatId = null, string? ChoiceId = null, string? FirstPlayerId = null, long? ExpectedRevision = null, string? MapId = null,
    bool? IsReady = null, string? LobbyVersion = null);
public sealed record MapSelection(string MapId, int Ticket, int TotalTickets, bool UsedEqualOdds, Dictionary<string, int> Votes);
public sealed record JoinRequest(string Name, string Color, string Character);
public sealed record TeamSnapshot(string PlayerId, int Ships, int Ports);
public sealed record RoundSnapshot(int Turn, string? ActivePlayerId, DateTimeOffset At, bool IsFinal, List<TeamSnapshot> Teams);
public sealed record ResetRequest(string Password, string GameId, long ExpectedRevision, bool ReleaseSeats = false);
public sealed record PerkPickup(string Kind, int Q, int R);
public sealed class WhirlpoolPair
{
    public Hex First { get; set; }
    public Hex Second { get; set; }
    public int RemainingTurns { get; set; }
    public Hex? Exit(Hex entry) => entry == First ? Second : entry == Second ? First : null;
}
public sealed record MutationResult(bool Success, GameState? State = null, string? Error = null, int StatusCode = 400);
public sealed class GameOptions
{
    public int TurnSeconds { get; set; } = 135;
    public int ActionSeconds { get; set; } = 45;
    public string? DataDirectory { get; set; }
    public string? ResetPassword { get; set; }
    // Opt in only when a trusted deployment proxy is the sole public entry point.
    public bool TrustForwardedHeaders { get; set; }
}
public interface IDice
{
    int Roll(int sides = 6);
    int Next(int exclusiveMax) => System.Security.Cryptography.RandomNumberGenerator.GetInt32(exclusiveMax);
}
public sealed class ServerDice : IDice
{
    public int Roll(int sides = 6) => System.Security.Cryptography.RandomNumberGenerator.GetInt32(1, sides + 1);
}
public sealed class RuleException(string message) : Exception(message);
