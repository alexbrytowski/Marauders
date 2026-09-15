namespace Marauders.Server;

public sealed record StartingPortDeal(
    IReadOnlyList<IReadOnlyList<string>> PortIdsByOwner,
    int FairLayoutCount,
    int ClusteredGroupCount,
    int MinimumSpread,
    int SpreadRange,
    int ReachRange);

public static class StartingPortDealer
{
    private sealed record Candidate(
        int[][] Groups,
        int ClusteredGroupCount,
        int MinimumSpread,
        int SpreadRange,
        int ReachRange);

    public static StartingPortDeal Create(BoardMap board, IReadOnlyList<string> portIds, int ownerCount, IDice random)
    {
        if (ownerCount < 2 || portIds.Count % ownerCount != 0 || portIds.Count / ownerCount != 3)
            throw new RuleException("Starting ports must divide into three ports per captain.");
        if (portIds.Count != portIds.Distinct(StringComparer.Ordinal).Count())
            throw new RuleException("Starting ports must be distinct.");

        var distances = Distances(board, portIds);
        var allPairDistances = Enumerable.Range(0, portIds.Count)
            .SelectMany(i => Enumerable.Range(0, i).Select(j => distances[i, j]))
            .Order()
            .ToArray();
        // A map-relative definition of "nearby" keeps the guardrail useful on
        // layouts of different sizes. Two nearby links make a three-port cluster.
        var nearbyDistance = allPairDistances[(allPairDistances.Length - 1) / 4];
        var reach = Enumerable.Range(0, portIds.Count)
            .Select(i => Enumerable.Range(0, portIds.Count).Sum(j => distances[i, j]))
            .ToArray();

        var candidates = new List<Candidate>();
        BuildPartitions(Enumerable.Range(0, portIds.Count).ToArray(), [], ownerCount, groups =>
        {
            var spreads = groups.Select(group =>
            {
                var pairDistances = group.SelectMany((first, i) => group.Take(i).Select(second => distances[first, second]))
                    .Order()
                    .ToArray();
                return (Spread: pairDistances[0] + pairDistances[1], Clustered: pairDistances[1] <= nearbyDistance);
            }).ToArray();
            var groupReach = groups.Select(group => group.Sum(i => reach[i])).ToArray();
            candidates.Add(new(groups.Select(group => group.ToArray()).ToArray(),
                spreads.Count(value => value.Clustered),
                spreads.Min(value => value.Spread),
                spreads.Max(value => value.Spread) - spreads.Min(value => value.Spread),
                groupReach.Max() - groupReach.Min()));
        });

        var fewestClusters = candidates.Min(candidate => candidate.ClusteredGroupCount);
        var ranked = candidates.Where(candidate => candidate.ClusteredGroupCount == fewestClusters)
            .OrderByDescending(candidate => candidate.MinimumSpread)
            .ThenBy(candidate => candidate.SpreadRange)
            .ThenBy(candidate => candidate.ReachRange)
            .ToArray();
        // Draw from a broad fair band instead of always taking the single optimum.
        // On the current four-player maps this retains hundreds or more geographic layouts.
        var fairLayoutCount = Math.Max(1, ranked.Length / 10);
        var selected = ranked[random.Next(fairLayoutCount)];
        var shuffledGroups = selected.Groups.Select(group => group.ToArray()).ToArray();
        for (var i = shuffledGroups.Length - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (shuffledGroups[i], shuffledGroups[j]) = (shuffledGroups[j], shuffledGroups[i]);
        }

        return new(shuffledGroups.Select(group => (IReadOnlyList<string>)group.Select(i => portIds[i]).ToArray()).ToArray(),
            fairLayoutCount, selected.ClusteredGroupCount, selected.MinimumSpread, selected.SpreadRange, selected.ReachRange);
    }

    private static void BuildPartitions(int[] remaining, List<int[]> groups, int ownerCount, Action<int[][]> add)
    {
        if (groups.Count == ownerCount - 1)
        {
            add(groups.Append(remaining).ToArray());
            return;
        }

        // Pin the first remaining port into the next group. This enumerates each
        // geographic partition once rather than once for every captain ordering.
        for (var second = 1; second < remaining.Length - 1; second++)
            for (var third = second + 1; third < remaining.Length; third++)
            {
                var group = new[] { remaining[0], remaining[second], remaining[third] };
                var next = remaining.Where((_, index) => index != 0 && index != second && index != third).ToArray();
                groups.Add(group);
                BuildPartitions(next, groups, ownerCount, add);
                groups.RemoveAt(groups.Count - 1);
            }
    }

    private static int[,] Distances(BoardMap board, IReadOnlyList<string> portIds)
    {
        var result = new int[portIds.Count, portIds.Count];
        for (var first = 0; first < portIds.Count; first++)
            for (var second = 0; second < first; second++)
                result[first, second] = result[second, first] = SailingDistance(board, portIds[first], portIds[second]);
        return result;
    }

    private static int SailingDistance(BoardMap board, string firstPortId, string secondPortId)
    {
        var targets = board.Harbor(secondPortId).ToHashSet();
        var seen = board.Harbor(firstPortId).ToHashSet();
        var queue = new Queue<(Hex Hex, int Distance)>(seen.Select(hex => (hex, 0)));
        while (queue.TryDequeue(out var current))
        {
            if (targets.Contains(current.Hex)) return current.Distance;
            foreach (var neighbor in board.Neighbors(current.Hex))
                if (seen.Add(neighbor)) queue.Enqueue((neighbor, current.Distance + 1));
        }
        throw new RuleException("Every starting port must be reachable by sea.");
    }
}
