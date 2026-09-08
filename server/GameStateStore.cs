using System.Text.Json;
using Microsoft.AspNetCore.SignalR;

namespace Marauders.Server;

public sealed class GameStateStore(IHostEnvironment environment)
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly string statePath = Path.Combine(environment.ContentRootPath, "data", "game-state.json");
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private GameState state = Load(environment.ContentRootPath, JsonOptions);
    public GameState Read() => state;
    public async Task<GameState?> ExpireTurnAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing" || state.TurnEndsAt is null || state.TurnEndsAt > DateTimeOffset.UtcNow || state.ActivePlayerId is null) return null;
            var index = state.Players.FindIndex(player => player.Id == state.ActivePlayerId);
            state.ActivePlayerId = state.Players[(index + 1) % state.Players.Count].Id;
            state.TurnNumber++; state.RemainingActions = ActionCount(state.ActivePlayerId);
            state.RemainingMovement = 0; state.LastRoll = null; state.Combat = null; state.IsBuildPhase = false; state.AvailableBuilds = 0;
            state.TurnEndsAt = DateTimeOffset.UtcNow.AddMinutes(2);
            await SaveAsync(); return state;
        }
        finally { gate.Release(); }
    }

    public async Task<GameState> ResetAsync()
    {
        await gate.WaitAsync();
        try { state = new GameState(); await SaveAsync(); return state; }
        finally { gate.Release(); }
    }

    public async Task<MutationResult> AddPlayerAsync(string? name, string? color)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "lobby") return new(false, Error: "Players can only join before drafting starts.");
            if (state.Players.Count >= 4) return new(false, Error: "Marauders needs exactly four players; additional visitors are spectators.");
            if (string.IsNullOrWhiteSpace(name)) return new(false, Error: "Enter a player name.");
            if (state.Players.Any(player => player.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase))) return new(false, Error: "That player name is already in use.");
            state.Players.Add(new Player { Name = name.Trim(), Color = string.IsNullOrWhiteSpace(color) ? "#d84a4a" : color });
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }

    public async Task<MutationResult> StartDraftAsync()
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "lobby") return new(false, Error: "The draft has already started.");
            if (state.Players.Count != 4) return new(false, Error: "Four players are required to start the draft.");
            state.Phase = "draft"; state.DraftPickNumber = 0; state.ActivePlayerId = DraftOrder()[0];
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }

    public async Task<MutationResult> DraftPortAsync(string playerId, string portId)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "draft") return new(false, Error: "Port drafting is not active.");
            if (state.ActivePlayerId != playerId) return new(false, Error: "It is not that player's pick.");
            var port = state.Ports.SingleOrDefault(item => item.Id == portId);
            if (port is null || port.OwnerId is not null) return new(false, Error: "That port is not available.");
            port.OwnerId = playerId; state.DraftPickNumber++;
            if (state.DraftPickNumber == 12) StartGame();
            else state.ActivePlayerId = DraftOrder()[state.DraftPickNumber];
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }

    private List<string> DraftOrder()
    {
        var ids = state.Players.Select(player => player.Id).ToList();
        return [ids[0], ids[1], ids[2], ids[3], ids[3], ids[2], ids[1], ids[0], ids[0], ids[1], ids[2], ids[3]];
    }
    public async Task<MutationResult> RollMovementAsync(string playerId)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing") return new(false, Error: "The game has not started.");
            if (state.ActivePlayerId != playerId) return new(false, Error: "It is not that player's turn.");
            if (state.RemainingActions <= 0) return new(false, Error: "No actions remain this turn.");
            if (state.RemainingMovement > 0) return new(false, Error: "Finish the current movement before rolling again.");
            state.LastRoll = Random.Shared.Next(1, 7);
            state.RemainingActions--;
            state.RemainingMovement = state.LastRoll.Value;
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> EndTurnAsync(string playerId)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing") return new(false, Error: "The game has not started.");
            if (state.ActivePlayerId != playerId) return new(false, Error: "It is not that player's turn.");
            if (!state.IsBuildPhase)
            {
                state.IsBuildPhase = true;
                state.AvailableBuilds = Math.Max(0, OwnedPortCount(playerId) * 2 - state.Ships.Count(ship => ship.OwnerId == playerId) - state.Constructions.Count(build => build.OwnerId == playerId));
                state.RemainingMovement = 0;
                await SaveAsync(); return new(true, state);
            }
            FinishBuildPhase(playerId);
            var currentIndex = state.Players.FindIndex(player => player.Id == playerId);
            var nextIndex = (currentIndex + 1) % state.Players.Count;
            state.ActivePlayerId = state.Players[nextIndex].Id;
            state.TurnNumber++;
            state.TurnEndsAt = DateTimeOffset.UtcNow.AddMinutes(2);
            state.LastRoll = null; state.RemainingMovement = 0; state.IsBuildPhase = false; state.AvailableBuilds = 0;
            state.RemainingActions = ActionCount(state.ActivePlayerId);
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> StartConstructionAsync(string playerId, string portId)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing" || state.ActivePlayerId != playerId || !state.IsBuildPhase) return new(false, Error: "Construction can only be chosen at the end of your round.");
            if (state.AvailableBuilds <= 0) return new(false, Error: "No ships can be started this round.");
            if (!state.Ports.Any(port => port.Id == portId && port.OwnerId == playerId)) return new(false, Error: "Choose one of your own ports.");
            state.Constructions.Add(new Construction { OwnerId = playerId, PortId = portId, StartedTurnNumber = state.TurnNumber });
            state.AvailableBuilds--;
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> MoveShipAsync(string playerId, string shipId, int q, int r)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing") return new(false, Error: "The game has not started.");
            if (state.ActivePlayerId != playerId) return new(false, Error: "It is not that player's turn.");
            if (state.RemainingMovement <= 0) return new(false, Error: "Roll a movement die first.");
            if (state.Combat is not null) return new(false, Error: "Resolve the active combat first.");
            var ship = state.Ships.SingleOrDefault(item => item.Id == shipId && item.OwnerId == playerId);
            if (ship is null) return new(false, Error: "That ship does not belong to the active player.");
            var start = new Hex(ship.Q, ship.R);
            var blocked = state.Ships.Where(item => item.Id != ship.Id).Select(item => new Hex(item.Q, item.R)).ToHashSet();
            var path = BoardDefinition.FindPath(start, new Hex(q, r), blocked);
            if (path is null) return new(false, Error: "No legal open-water route exists to that hex.");
            var distance = path.Count - 1;
            if (distance == 0) return new(false, Error: "Choose a different destination.");
            if (distance > state.RemainingMovement) return new(false, Error: "That destination is farther than the movement remaining.");
            ship.Q = q; ship.R = r;
            state.RemainingMovement -= distance;
            StartCombatIfTriggered(ship);
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> RollCombatAsync(string playerId, string combatId)
    {
        await gate.WaitAsync();
        try
        {
            var combat = state.Combat;
            if (combat is null || combat.Id != combatId) return new(false, Error: "That combat is no longer active.");
            if (combat.Status != "awaiting-roll") return new(false, Error: "Choose the losing ship before rolling again.");
            if (!combat.ParticipantShipIds.Any(id => state.Ships.Any(ship => ship.Id == id && ship.OwnerId == playerId))) return new(false, Error: "Only a combat participant can roll.");
            combat.Rolls = combat.ParticipantShipIds.Select(id => state.Ships.SingleOrDefault(ship => ship.Id == id)).Where(ship => ship is not null)
                .GroupBy(ship => ship!.OwnerId).ToDictionary(group => group.Key, group => group.Select(_ => Random.Shared.Next(1, 7)).ToList());
            var highs = combat.Rolls.ToDictionary(pair => pair.Key, pair => pair.Value.Max());
            var winningHigh = highs.Values.Max();
            var winners = highs.Where(pair => pair.Value == winningHigh).Select(pair => pair.Key).ToList();
            if (winners.Count > 1) return await SaveCombatAsync(combat);
            combat.LosingPlayerId = highs.Single(pair => pair.Value != winningHigh).Key;
            combat.Status = "choose-loss";
            return await SaveCombatAsync(combat);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> RemoveCombatShipAsync(string playerId, string combatId, string shipId)
    {
        await gate.WaitAsync();
        try
        {
            var combat = state.Combat;
            if (combat is null || combat.Id != combatId) return new(false, Error: "That combat is no longer active.");
            if (combat.Status != "choose-loss" || combat.LosingPlayerId != playerId) return new(false, Error: "That player is not choosing a combat loss.");
            var ship = state.Ships.SingleOrDefault(item => item.Id == shipId);
            if (ship is null || ship.OwnerId != playerId || !combat.ParticipantShipIds.Contains(shipId)) return new(false, Error: "Choose a participating ship from the losing side.");
            var triggeringShipWasRemoved = shipId == combat.TriggerShipId || shipId == combat.OpponentShipId;
            state.Ships.Remove(ship);
            combat.ParticipantShipIds.Remove(shipId);
            if (triggeringShipWasRemoved || !TriggerShipsAreAdjacent(combat)) state.Combat = null;
            else { combat.Status = "awaiting-roll"; combat.LosingPlayerId = null; combat.Rolls = []; }
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    public async Task<MutationResult> AttackPortAsync(string playerId, string shipId, string portId)
    {
        await gate.WaitAsync();
        try
        {
            if (state.Phase != "playing" || state.ActivePlayerId != playerId) return new(false, Error: "It is not that player's turn.");
            if (state.Combat is not null) return new(false, Error: "Resolve ship combat before attacking a port.");
            if (state.RemainingActions <= 0) return new(false, Error: "No actions remain this turn.");
            var ship = state.Ships.SingleOrDefault(item => item.Id == shipId && item.OwnerId == playerId);
            var port = state.Ports.SingleOrDefault(item => item.Id == portId);
            if (ship is null || port is null || port.OwnerId == playerId) return new(false, Error: "Choose one of your ships beside an enemy or unowned port.");
            if (new Hex(ship.Q, ship.R).DistanceTo(BoardDefinition.PortHex(portId)) != 1) return new(false, Error: "The attacking ship must be in the port's dark-blue water.");
            state.RemainingActions--;
            int attackerRoll, portRoll;
            do { attackerRoll = Random.Shared.Next(1, 7); portRoll = Random.Shared.Next(1, 7) - port.DefenseWeakness; } while (attackerRoll == portRoll);
            if (attackerRoll > portRoll) CapturePort(port, playerId);
            else port.DefenseWeakness++;
            state.LastRoll = attackerRoll;
            await SaveAsync(); return new(true, state);
        }
        finally { gate.Release(); }
    }
    private void StartGame()
    {
        state.Phase = "playing";
        foreach (var port in state.Ports.Where(port => port.OwnerId is not null))
            for (var slot = 0; slot < 2; slot++)
            {
                var hex = BoardDefinition.InitialShipHex(port.Id, slot);
                state.Ships.Add(new Ship { OwnerId = port.OwnerId!, PortId = port.Id, Slot = slot, Q = hex.Q, R = hex.R });
            }
        state.ActivePlayerId = state.Players[0].Id;
        state.TurnNumber = 1;
        state.TurnEndsAt = DateTimeOffset.UtcNow.AddMinutes(2);
        state.RemainingActions = ActionCount(state.ActivePlayerId);
        state.LastRoll = null;
        state.RemainingMovement = 0;
    }
    private int ActionCount(string? playerId)
    {
        var ships = state.Ships.Count(ship => ship.OwnerId == playerId);
        return ships == 0 ? 0 : ships / 4 + 1;
    }
    private int OwnedPortCount(string playerId) => state.Ports.Count(port => port.OwnerId == playerId);
    private void FinishBuildPhase(string playerId)
    {
        foreach (var build in state.Constructions.Where(build => build.OwnerId == playerId && build.StartedTurnNumber < state.TurnNumber).ToList())
        {
            build.RemainingOwnerTurns--;
            if (build.RemainingOwnerTurns > 0) continue;
            var occupied = state.Ships.Select(ship => new Hex(ship.Q, ship.R)).ToHashSet();
            var spawn = BoardDefinition.NearestEmptyWater(BoardDefinition.PortHex(build.PortId), occupied);
            if (spawn is not null) state.Ships.Add(new Ship { OwnerId = playerId, PortId = build.PortId, Q = spawn.Value.Q, R = spawn.Value.R });
            state.Constructions.Remove(build);
        }
    }
    private void StartCombatIfTriggered(Ship movedShip)
    {
        var movedHex = new Hex(movedShip.Q, movedShip.R);
        var opponent = state.Ships.FirstOrDefault(ship => ship.OwnerId != movedShip.OwnerId && movedHex.DistanceTo(new Hex(ship.Q, ship.R)) == 1);
        if (opponent is null) return;
        var opponentHex = new Hex(opponent.Q, opponent.R);
        var participants = state.Ships
            .Where(ship => (ship.OwnerId == movedShip.OwnerId && new Hex(ship.Q, ship.R).DistanceTo(movedHex) <= 2) ||
                           (ship.OwnerId == opponent.OwnerId && new Hex(ship.Q, ship.R).DistanceTo(opponentHex) <= 2))
            .Select(ship => ship.Id).ToList();
        state.Combat = new CombatState { TriggerShipId = movedShip.Id, OpponentShipId = opponent.Id, ParticipantShipIds = participants };
    }
    private bool TriggerShipsAreAdjacent(CombatState combat)
    {
        var first = state.Ships.SingleOrDefault(ship => ship.Id == combat.TriggerShipId);
        var second = state.Ships.SingleOrDefault(ship => ship.Id == combat.OpponentShipId);
        return first is not null && second is not null && new Hex(first.Q, first.R).DistanceTo(new Hex(second.Q, second.R)) == 1;
    }
    private async Task<MutationResult> SaveCombatAsync(CombatState combat)
    {
        await SaveAsync();
        return new(true, state);
    }
    private void CapturePort(Port port, string capturerId)
    {
        var previousOwner = port.OwnerId;
        port.OwnerId = capturerId;
        port.DefenseWeakness = 0;
        if (previousOwner is not null && !state.Ports.Any(item => item.OwnerId == previousOwner))
            foreach (var ship in state.Ships.Where(ship => ship.OwnerId == previousOwner)) ship.OwnerId = capturerId;
    }
    private static GameState Load(string contentRoot, JsonSerializerOptions options)
    {
        var path = Path.Combine(contentRoot, "data", "game-state.json");
        return File.Exists(path) ? JsonSerializer.Deserialize<GameState>(File.ReadAllText(path), options) ?? new GameState() : new GameState();
    }
    private async Task SaveAsync()
    {
        state.UpdatedAt = DateTimeOffset.UtcNow;
        Directory.CreateDirectory(Path.GetDirectoryName(statePath)!);
        await File.WriteAllTextAsync(statePath, JsonSerializer.Serialize(state, JsonOptions));
    }
}

public sealed class GameHub : Hub;
public sealed class GameHubNotifier(IHubContext<GameHub> hub)
{
    public Task GameUpdatedAsync(GameState state) => hub.Clients.All.SendAsync("gameUpdated", state);
}
