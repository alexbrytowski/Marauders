namespace Marauders.Server;

// Chance that the attacker wins the next decisive exchange. A tie starts the
// same exchange over; a Cheat Death activation still counts as losing it.
public static class CombatWinChance
{
    private static readonly IReadOnlyDictionary<int, double> NormalDie = Uniform(1, 6);
    private static readonly IReadOnlyDictionary<int, double> GlassDie = Uniform(-1, 8);
    private static readonly IReadOnlyDictionary<int, double> SirenDie = Uniform(1, 20);
    private static readonly IReadOnlyDictionary<int, double> LoadedDie = new Dictionary<int, double>
    {
        [4] = 4.0 / 6, [5] = 1.0 / 6, [6] = 1.0 / 6
    };

    public static double? Calculate(GameState state)
    {
        var battle = state.Combat;
        if (battle?.Status != "awaiting-roll") return null;

        var participants = state.Ships.Where(ship => battle.ParticipantShipIds.Contains(ship.Id)).ToArray();
        if (participants.Length != battle.ParticipantShipIds.Count) return null;
        if (participants.Any(ship => ship.Perk is "mark-of-the-kraken" or "call-of-the-siren") is false &&
            participants.Any(ship => ship.Perk == "black-and-white")) return 0.5;

        var attackerDice = new List<IReadOnlyDictionary<int, double>>();
        var defenderDice = new List<IReadOnlyDictionary<int, double>>();
        foreach (var ship in participants)
        {
            var dice = ship.OwnerId == battle.AttackerId ? attackerDice : defenderDice;
            var die = ship.Perk switch
            {
                "glass-cannon" => GlassDie,
                "loaded-dice" => LoadedDie,
                _ => NormalDie
            };
            var callPenalty = state.Ships.Any(holder => holder.Perk == "call-of-the-siren" &&
                holder.OwnerId != ship.OwnerId && holder.Hex.DistanceTo(ship.Hex) == 1) ? 1 : 0;
            if (callPenalty != 0) die = die.ToDictionary(outcome => outcome.Key - callPenalty, outcome => outcome.Value);
            var count = ship.Perk == "mark-of-the-kraken" ? 3 : 1;
            for (var i = 0; i < count; i++) dice.Add(die);
        }

        if (battle.Kind == "port") defenderDice.Add(NormalDie);
        else if (battle.Kind == "kraken")
            for (var i = 0; i < KrakenPlacement.Dice; i++) defenderDice.Add(NormalDie);
        else if (battle.Kind == "siren")
            defenderDice.Add(participants.Any(ship => ship.Perk == "ear-plugs")
                ? new Dictionary<int, double> { [1] = 1 } : SirenDie);
        else
            foreach (var portId in battle.SupportingPortIds)
            {
                var ownerId = state.Ports.FirstOrDefault(port => port.Id == portId)?.OwnerId;
                if (ownerId == battle.AttackerId) attackerDice.Add(NormalDie);
                else if (ownerId == battle.DefenderId) defenderDice.Add(NormalDie);
            }

        if (attackerDice.Count == 0 || defenderDice.Count == 0) return null;
        var attackerMaximum = Maximum(attackerDice);
        var defenderMaximum = Maximum(defenderDice);
        double wins = 0, losses = 0;
        foreach (var (attacker, attackerProbability) in attackerMaximum)
            foreach (var (defender, defenderProbability) in defenderMaximum)
            {
                var weight = attackerProbability * defenderProbability;
                var comparison = attacker.CompareTo(defender + battle.DefenseModifier);
                if (comparison > 0) wins += weight;
                else if (comparison < 0) losses += weight;
            }
        return wins + losses == 0 ? null : wins / (wins + losses);
    }

    private static IReadOnlyDictionary<int, double> Uniform(int first, int last) =>
        Enumerable.Range(first, last - first + 1).ToDictionary(value => value, _ => 1.0 / (last - first + 1));

    private static Dictionary<int, double> Maximum(IEnumerable<IReadOnlyDictionary<int, double>> dice)
    {
        var maximum = new Dictionary<int, double> { [int.MinValue] = 1 };
        foreach (var die in dice)
        {
            var next = new Dictionary<int, double>();
            foreach (var (oldValue, oldProbability) in maximum)
                foreach (var (roll, rollProbability) in die)
                {
                    var value = Math.Max(oldValue, roll);
                    next[value] = next.GetValueOrDefault(value) + oldProbability * rollProbability;
                }
            maximum = next;
        }
        return maximum;
    }
}
