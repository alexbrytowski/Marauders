namespace Marauders.Server;

public static class SirenPlacement
{
    public const int Reach = 3;

    public static SirenState Spawn(GameState state, IDice random)
    {
        var board = MapCatalog.Resolve(state.MapId, state.BoardVersion);
        var water = board.Cells.Where(cell => cell.Terrain == "water").Select(cell => cell.Hex).ToHashSet();
        var centerQ = board.Cells.Average(cell => cell.Q);
        var centerR = board.Cells.Average(cell => cell.R);
        var candidates = water.Where(hex =>
            board.Ports.All(port => hex.DistanceTo(board.PortHex(port.Id)) > Reach) &&
            state.PerkPickups.All(perk => hex.DistanceTo(new(perk.Q, perk.R)) > Reach) &&
            !state.Ships.Any(ship => ship.Hex == hex)).ToArray();
        if (candidates.Length == 0) throw new RuleException("No open water is available for Cam the Siren.");
        // Prefer a complete three-hex water ring; on tight maps keep the widest available ring.
        var ranked = candidates.Select(hex => new
        {
            Hex = hex,
            Water = water.Count(other => hex.DistanceTo(other) <= Reach),
            Center = Math.Abs(hex.Q - centerQ) + Math.Abs(hex.R - centerR)
        }).OrderByDescending(candidate => candidate.Water).ThenBy(candidate => candidate.Center).ToArray();
        var top = ranked.Take(Math.Min(6, ranked.Length)).ToArray();
        var chosen = top[random.Next(top.Length)].Hex;
        return new() { Q = chosen.Q, R = chosen.R };
    }

    public static PerkPickup EarPlugs(GameState state, IDice random)
    {
        var board = MapCatalog.Resolve(state.MapId, state.BoardVersion);
        var center = state.Siren!.Hex;
        var candidates = board.Cells.Where(cell => cell.Terrain == "water" &&
            cell.Hex.DistanceTo(center) >= 10 &&
            BoardMap.Adjacent(cell.Hex).All(neighbor => board.Cell(neighbor)?.Terrain == "water") &&
            !state.Ships.Any(ship => ship.Hex == cell.Hex)).ToArray();
        if (candidates.Length < 10) throw new RuleException("This map needs ten remote open-water locations for Sailor's Wax.");
        var farthest = candidates.OrderByDescending(cell => cell.Hex.DistanceTo(center))
            .ThenBy(cell => cell.R).ThenBy(cell => cell.Q).Take(10).ToArray();
        var chosen = farthest[random.Next(farthest.Length)];
        return new("ear-plugs", chosen.Q, chosen.R);
    }
}
