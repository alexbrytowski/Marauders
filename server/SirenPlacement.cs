namespace Marauders.Server;

public static class SirenPlacement
{
    public const int Reach = 3;
    public const int ClearRadius = 2;
    public const int SpawnRound = 12;
    public const int WarningRound = SpawnRound - 4;

    // Saves created before timed arrival contain an already active Siren.
    public static bool IsActive(SirenState? siren, int round) =>
        siren is { Alive: true } && (siren.AwakensOnRound is null || round >= siren.AwakensOnRound);

    public static SirenState Spawn(GameState state, IDice random)
    {
        var board = MapCatalog.Resolve(state.MapId, state.BoardVersion);
        var water = board.Cells.Where(cell => cell.Terrain == "water").Select(cell => cell.Hex).ToHashSet();
        var centerQ = board.Cells.Average(cell => cell.Q);
        var centerR = board.Cells.Average(cell => cell.R);
        var candidates = water.Where(hex =>
            water.Count(other => hex.DistanceTo(other) <= ClearRadius) == 1 + 3 * ClearRadius * (ClearRadius + 1) &&
            state.PerkPickups.All(perk => hex.DistanceTo(new(perk.Q, perk.R)) > ClearRadius) &&
            state.Whirlpool?.Exit(hex) is null).ToArray();
        if (candidates.Length == 0) throw new RuleException("No open water is available for Cam the Siren.");
        // Prefer sites beyond the call's port distance; use closer sites only if necessary.
        var portSafe = candidates.Where(hex => board.Ports.All(port =>
            hex.DistanceTo(board.PortHex(port.Id)) > Reach)).ToArray();
        var pool = portSafe.Length > 0 ? portSafe : candidates;
        // Draw from a broad central pool; the third ring may meet land or harbors.
        var central = pool.OrderBy(hex => Math.Abs(hex.Q - centerQ) + Math.Abs(hex.R - centerR))
            .Take(Math.Min(24, pool.Length)).ToArray();
        var chosen = central[random.Next(central.Length)];
        return new() { Q = chosen.Q, R = chosen.R };
    }

    public static PerkPickup EarPlugs(GameState state, IDice random)
    {
        var board = MapCatalog.Resolve(state.MapId, state.BoardVersion);
        var center = state.Siren!.Hex;
        var candidates = board.Cells.Where(cell => cell.Terrain == "water" &&
            cell.Hex.DistanceTo(center) >= 10 &&
            BoardMap.Adjacent(cell.Hex).All(neighbor => board.Cell(neighbor)?.Terrain == "water") &&
            state.PerkPickups.All(perk => cell.Hex.DistanceTo(new(perk.Q, perk.R)) >= 6) &&
            !state.Ships.Any(ship => ship.Hex == cell.Hex)).ToArray();
        if (candidates.Length < 10) throw new RuleException("This map needs ten remote open-water locations for Sailor's Wax.");
        var farthest = candidates.OrderByDescending(cell => cell.Hex.DistanceTo(center))
            .ThenBy(cell => cell.R).ThenBy(cell => cell.Q).Take(10).ToArray();
        var chosen = farthest[random.Next(farthest.Length)];
        return new("ear-plugs", chosen.Q, chosen.R);
    }
}
