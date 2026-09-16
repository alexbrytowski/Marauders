namespace Marauders.Server;

/// <summary>Chooses open water whose entire two-hex Kraken reach is outside port support range.</summary>
public static class KrakenPlacement
{
    public const int SpawnRound = 33;
    public const int WarningRound = SpawnRound - 4;
    public const int Reach = 2;
    public const int StartingLives = 3;
    public const int Dice = 3;

    public static IReadOnlyList<Hex> SafeCells(BoardMap board) => board.Cells
        .Where(cell => cell.Terrain == "water" && board.Ports.All(port =>
            cell.Hex.DistanceTo(board.PortHex(port.Id)) > Reach + 2))
        .Select(cell => cell.Hex)
        .ToArray();

    public static KrakenState Spawn(GameState state, IDice random)
    {
        var board = MapCatalog.Resolve(state.MapId, state.BoardVersion);
        var candidates = SafeCells(board).Where(hex =>
            !state.Ships.Any(ship => ship.Hex == hex) &&
            !state.PerkPickups.Any(perk => new Hex(perk.Q, perk.R) == hex) &&
            state.Whirlpool?.Exit(hex) is null).ToArray();
        if (candidates.Length == 0)
            throw new RuleException("No port-safe open water is available for the Kraken.");
        var hex = candidates[random.Next(candidates.Length)];
        return new() { Q = hex.Q, R = hex.R, Lives = StartingLives, AwakensOnRound = SpawnRound };
    }

    // Kraken records from older saves have no awakening round and are already active.
    public static bool IsActive(KrakenState? kraken, int round) =>
        kraken is { Lives: > 0 } && (kraken.AwakensOnRound is null || round >= kraken.AwakensOnRound);
}
