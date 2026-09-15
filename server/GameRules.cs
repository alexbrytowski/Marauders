namespace Marauders.Server;

/// <summary>All rule decisions and random rolls live on the server. Each instance
/// operates on a private candidate state; a rejected command is never published.</summary>
public sealed class GameRules(GameState state, IDice dice, GameOptions options, DateTimeOffset now)
{
    private BoardMap Board => MapCatalog.Resolve(state.MapId, state.BoardVersion);
    public static int ActionCount(int ships) => (ships + 2) / 3;
    public static readonly string[] Colors = ["#ed7866", "#69c5bc", "#b19bdf", "#e6be68"];
    public static readonly string[] Characters = CharacterCatalog.Ids;
    private static void Require([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool condition, string error) { if (!condition) throw new RuleException(error); }
    private string Name(string id) => state.Players.FirstOrDefault(p => p.Id == id)?.Name ?? "Unclaimed port";
    private Ship Ship(string? id) => state.Ships.SingleOrDefault(s => s.Id == id) ?? throw new RuleException("That ship is no longer on the board.");
    private Port Port(string? id) => state.Ports.SingleOrDefault(p => p.Id == id) ?? throw new RuleException("Choose a port on the map.");
    private int Capacity(string id) => state.Ports.Count(p => p.OwnerId == id) * 2 + state.Ships.Count(s => s.OwnerId == id && s.Perk == "mouth-to-feed");
    private int FreeBuilds(string id) => Math.Max(0, Capacity(id) - state.Ships.Count(s => s.OwnerId == id) - state.Constructions.Count(b => b.OwnerId == id));
    private int NewConstructionOwnerTurns => state.TurnNumber >= 66 ? 3 : 2;
    private bool HasTime => state.ActionEndsAt > now && (state.IsEndingRound || state.TurnEndsAt > now);
    public void RefreshBuildCapacity()
    {
        if (state.IsBuildPhase && state.ActivePlayerId is { } owner)
            state.AvailableBuilds = state.IsEndingRound ? 0 : FreeBuilds(owner);
    }
    private void Log(string kind, string message, Dictionary<string, List<int>>? rolls = null,
        string? blackWhiteResult = null, string? blackWhiteOwnerId = null)
        => state.Events.Add(new(Guid.NewGuid().ToString("N"), now, state.TurnNumber, kind, message,
            rolls?.ToDictionary(p => p.Key, p => p.Value.ToList()), blackWhiteResult, blackWhiteOwnerId));

    public Player Join(JoinRequest request)
    {
        Require(state.Phase == "lobby", "The game has started. You can watch as a spectator.");
        Require(state.Players.Count < 4, "All four seats are taken. You can watch as a spectator.");
        var name = request.Name?.Trim() ?? "";
        Require(name.Length is >= 1 and <= 24 && !name.Any(char.IsControl), "Use a captain name with 1–24 characters.");
        Require(!state.Players.Any(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase)), "That captain name is already taken.");
        Require(Colors.Contains(request.Color), "Choose one of the four crew colors.");
        Require(!state.Players.Any(p => p.Color == request.Color), "That crew color is already taken.");
        Require(Characters.Contains(request.Character), "Choose a captain character.");
        Require(!state.Players.Any(p => p.Character == request.Character), "That character is already taken. Choose another captain character.");
        var player = new Player { Name = name, Color = request.Color, Character = request.Character };
        state.Players.Add(player);
        state.HostPlayerId ??= player.Id;
        state.FirstPlayerId ??= state.HostPlayerId;
        InvalidateLobbyReadiness();
        Log("lobby", $"{name} joined the crew.");
        return player;
    }

    public void Act(string playerId, GameCommand command)
    {
        Require(state.Players.Any(p => p.Id == playerId), "Spectators cannot control a captain.");
        if (command.Type == "forfeit") { Forfeit(playerId); return; }
        Require(!state.Players.Single(p => p.Id == playerId).HasForfeited, "This captain has forfeited.");
        if (state.Phase == "playing") Require(HasTime, "The clock has expired. Wait for the next round.");
        if (command.Type == "vote-map") { VoteMap(playerId, command.MapId); return; }
        if (command.Type == "set-first-player") { SetFirstPlayer(playerId, command.FirstPlayerId); return; }
        if (command.Type == "set-ready") { SetReady(playerId, command); return; }
        if (command.Type == "draft") { Draft(playerId, command.PortId); return; }
        Require(state.Phase == "playing" || (state.Phase == "finished" && command.Type == "continue-combat"), "The game is not in play.");
        if (command.Type == "remove-ship") { RemoveLoss(playerId, command.CombatId, command.ShipId); return; }
        if (command.Type is "choose-combat" or "roll-combat" or "continue-combat")
            Require(state.CombatPlayerId == playerId, "Only the captain controlling this battle can choose, roll, or continue.");
        else Require(state.ActivePlayerId == playerId, "It is another captain's turn.");
        switch (command.Type)
        {
            case "choose-combat":
                Require(state.Combat is null, "Resolve the current battle first.");
                var choice = state.CombatChoices.SingleOrDefault(c => c.Id == command.ChoiceId);
                Require(choice is not null, "Choose a pending encounter.");
                StartBattle(choice!);
                break;
            case "roll-combat": RollBattle(command.CombatId); break;
            case "continue-combat":
                Require(state.Combat is not null && state.Combat.Id == command.CombatId && state.Combat.Status == "resolved", "That battle is not ready to close.");
                state.Combat = null;
                if (state.Phase == "playing")
                {
                    RefreshEncounters();
                    if (state.IsEndingRound) FinishRound(); else SettleActions();
                }
                break;
            case "roll-movement":
                Ready();
                Require(state.RemainingActions > 0 && state.RemainingMovement == 0, "Finish your current movement before using another die.");
                state.LastRoll = 4 + dice.Next(3);
                state.RemainingActions--;
                state.RemainingMovement = state.LastRoll.Value;
                ActionClock();
                Log("movement", $"{Name(playerId)} rolled {state.LastRoll} movement.", new() { [playerId] = [state.LastRoll.Value] });
                break;
            case "move": Move(playerId, command); break;
            case "pass-movement":
                Ready();
                Require(state.RemainingMovement > 0, "There is no movement to pass.");
                state.RemainingMovement = 0;
                Log("movement", $"{Name(playerId)} passed the remaining movement.");
                ActionClock(); SettleActions();
                break;
            case "attack-port": Attack(playerId, command); break;
            case "end-turn":
                NoBattle();
                if (state.IsBuildPhase) FinishRound(); else BeginBuild();
                break;
            case "build":
                NoBattle();
                Require(state.IsBuildPhase && !state.IsEndingRound, "Construction selection is closed until your next round.");
                var port = Port(command.PortId);
                Require(port.OwnerId == playerId, "Choose one of your own ports.");
                Require(FreeBuilds(playerId) > 0, "Your fleet and construction already fill your population cap.");
                var ownerTurns = NewConstructionOwnerTurns;
                state.Constructions.Add(new() { OwnerId = playerId, PortId = port.Id,
                    StartedTurnNumber = state.TurnNumber, RemainingOwnerTurns = ownerTurns });
                state.AvailableBuilds = FreeBuilds(playerId);
                Log("construction", $"{Name(playerId)} started a ship at {port.Name}; ready in {ownerTurns} owner rounds.");
                break;
            default: throw new RuleException("Unknown game action.");
        }
    }

    private void VoteMap(string actor, string? mapId)
    {
        Require(state.Phase == "lobby", "Map voting closes when play begins.");
        if (mapId is null)
        {
            if (state.MapVotes.Remove(actor))
            {
                InvalidateLobbyReadiness(actor);
                Log("map", $"{Name(actor)} cleared their map vote and must ready again.");
            }
            return;
        }
        var map = MapCatalog.Get(mapId);
        if (state.MapVotes.GetValueOrDefault(actor) == mapId) return;
        state.MapVotes[actor] = mapId;
        InvalidateLobbyReadiness(actor);
        Log("map", $"{Name(actor)} voted for {map.Name}.");
    }
    private void InvalidateLobbyReadiness(string? actor = null)
    {
        state.LobbyVersion = Guid.NewGuid().ToString("N");
        foreach (var player in state.Players.Where(p => actor is null || p.Id == actor)) player.IsReady = false;
    }
    private void SetFirstPlayer(string actor, string? first)
    {
        Require(state.Phase == "lobby", "The first captain is chosen before play.");
        Require(state.HostPlayerId == actor, "Only the host can choose the first captain.");
        Require(state.Players.Any(p => p.Id == first), "Choose a seated captain to go first.");
        if ((state.FirstPlayerId ?? state.HostPlayerId) == first) return;
        state.FirstPlayerId = first;
        InvalidateLobbyReadiness();
        Log("lobby", $"{Name(first!)} will take the first turn. Every captain must ready again.");
    }
    private void SetReady(string actor, GameCommand command)
    {
        Require(state.Phase == "lobby", "Readiness closes when play begins.");
        Require(command.IsReady.HasValue, "Choose ready or not ready.");
        Require(command.LobbyVersion == state.LobbyVersion, "The lobby setup changed. Review it and ready again.");
        var player = state.Players.Single(p => p.Id == actor);
        if (player.IsReady == command.IsReady.Value) return;
        player.IsReady = command.IsReady.Value;
        Log("lobby", $"{player.Name} is {(player.IsReady ? "ready" : "not ready")}.");
        if (state.Players.Count == 4 && state.Players.All(p => p.IsReady)) StartGame();
    }
    private void StartGame()
    {
        Require(state.Phase == "lobby" && state.Players.Count == 4, "Four captains must join before play.");
        Require(state.Players.All(p => p.IsReady), "Every captain must ready before play.");
        var first = state.FirstPlayerId ?? state.HostPlayerId;
        var start = state.Players.FindIndex(p => p.Id == first);
        Require(start >= 0, "Choose which captain goes first.");
        state.MapSelection = MapLottery.Draw(MapCatalog.All.Select(m => m.Id).ToArray(),
            state.MapVotes.Where(v => state.Players.Any(p => p.Id == v.Key)).Select(v => v.Value), dice);
        var selected = MapCatalog.Get(state.MapSelection.MapId);
        state.MapId = selected.Id; state.BoardVersion = selected.Version;
        state.Ports = selected.Board.Ports.Select(p => new Port { Id = p.Id, Name = p.Name }).ToList();
        var counts = string.Join(", ", MapCatalog.All.Select(m => $"{m.Name}: {state.MapSelection.Votes[m.Id]}"));
        Log("map", $"Map draw: {selected.Name}, ticket {state.MapSelection.Ticket}/{state.MapSelection.TotalTickets}. Votes — {counts}.{(state.MapSelection.UsedEqualOdds ? " No votes: all maps had equal odds." : " Each vote was one ticket.")}");
        state.TurnOrder = Enumerable.Range(0, 4).Select(i => state.Players[(start + i) % 4].Id).ToList();
        RevealPerks();
        var ports = state.Ports.Where(p => p.Id != selected.NeutralPortId).ToArray();
        Require(ports.Length == 12, "A new game needs exactly twelve starting ports.");
        for (var i = ports.Length - 1; i > 0; i--)
        {
            var j = dice.Next(i + 1);
            (ports[i], ports[j]) = (ports[j], ports[i]);
        }
        for (var i = 0; i < ports.Length; i++) ports[i].OwnerId = state.TurnOrder[i % 4];
        Log("setup", $"Three ports were randomly assigned to each captain. {Port(selected.NeutralPortId).Name} remains neutral.");
        LaunchStartingFleets();
    }
    private string DraftPlayer(int pick) => state.TurnOrder[pick / 4 % 2 == 0 ? pick % 4 : 3 - pick % 4];
    private void Draft(string actor, string? portId)
    {
        Require(state.Phase == "draft" && actor == state.ActivePlayerId, "Wait for your port draft pick.");
        var port = Port(portId);
        Require(port.OwnerId is null, "That port is already claimed.");
        port.OwnerId = actor;
        state.DraftPickNumber++;
        Log("draft", $"{Name(actor)} claimed {port.Name}.");
        AdvanceDraft();
    }
    private void AdvanceDraft()
    {
        while (state.DraftPickNumber < 12 && state.Players.Single(p => p.Id == DraftPlayer(state.DraftPickNumber)).HasForfeited)
            state.DraftPickNumber++;
        if (state.DraftPickNumber == 12) LaunchStartingFleets();
        else state.ActivePlayerId = DraftPlayer(state.DraftPickNumber);
    }
    private void AddShip(string ownerId, string portId, Hex hex)
    {
        var number = state.Ships.Select(s => s.Number).DefaultIfEmpty(0).Max() + 1;
        state.Ships.Add(new() { OwnerId = ownerId, PortId = portId, Q = hex.Q, R = hex.R, Number = number });
    }
    private void RevealPerks()
    {
        state.PerkPickups = PerkPlacement.Create(state, dice);
        Log("perk", "Six perks are charted in open water. Sail through a pickup to collect it.");
    }
    private void LaunchStartingFleets()
    {
        var occupied = state.Ships.Select(s => s.Hex).ToHashSet();
        foreach (var owner in state.TurnOrder)
        {
            if (state.Players.Single(p => p.Id == owner).HasForfeited) continue;
            foreach (var port in state.Ports.Where(p => p.OwnerId == owner))
            {
                var missing = 2 - state.Ships.Count(s => s.PortId == port.Id);
                var cells = Board.Harbor(port.Id).Where(h => !occupied.Contains(h)).OrderBy(h => h.R).ThenBy(h => h.Q).Take(missing).ToList();
                Require(cells.Count == missing, "This port needs two empty starting harbor cells.");
                foreach (var hex in cells) { AddShip(owner, port.Id, hex); occupied.Add(hex); }
            }
            Log("setup", $"{Name(owner)} launched two ships at each of their ports.");
        }
        state.PlacementDone.Clear();
        state.Phase = "playing"; state.TurnNumber = 1; BeginTurn(state.TurnOrder.First(id => state.Ports.Any(p => p.OwnerId == id)));
    }
    private void NoBattle() => Require(state.Combat is null && state.CombatChoices.Count == 0, "Resolve the pending battle first.");
    private void Ready() { NoBattle(); Require(!state.IsBuildPhase, "The round is in construction selection."); }
    private void ActionClock() => state.ActionEndsAt = state.Phase == "finished" ? null : now.AddSeconds(options.ActionSeconds);
    private void Move(string actor, GameCommand command)
    {
        Ready();
        Require(state.RemainingMovement > 0, "Roll a movement die first.");
        var ship = Ship(command.ShipId);
        Require(ship.OwnerId == actor, "That ship belongs to another captain.");
        Require(command.Q.HasValue && command.R.HasValue, "Choose a destination hex.");
        var blocked = state.Ships.Where(s => s.Id != ship.Id).Select(s => s.Hex).ToHashSet();
        if (state.Whirlpool is { } pair)
        {
            if (blocked.Contains(pair.First)) blocked.Add(pair.Second);
            if (blocked.Contains(pair.Second)) blocked.Add(pair.First);
        }
        var path = Board.FindPath(ship.Hex, new(command.Q!.Value, command.R!.Value), blocked,
            state.Whirlpool is { } whirlpool ? new HashSet<Hex> { whirlpool.First, whirlpool.Second } : null);
        Require(path is not null && path.Count > 1 && path.Count - 1 <= state.RemainingMovement, "Choose a reachable empty water hex within your movement.");
        var moved = 0;
        foreach (var hex in path!.Skip(1))
        {
            var previousHarbor = Board.Cell(ship.Hex)?.HarborId;
            ship.Q = hex.Q; ship.R = hex.R;
            CollectPerk(ship);
            state.RemainingMovement--; moved++;
            var harbor = Board.Cell(hex)?.HarborId;
            if (harbor is not null && harbor != previousHarbor)
            {
                var port = state.Ports.SingleOrDefault(p => p.Id == harbor);
                if (port?.OwnerId == actor && port.DefenseWeakness > 0)
                {
                    port.DefenseWeakness = 0;
                    Log("port", $"An allied ship restored {port.Name}'s defense.");
                }
            }
            if (state.Whirlpool?.Exit(hex) is { } exit)
            {
                ship.Q = exit.Q; ship.R = exit.R;
                CollectPerk(ship);
                Log("whirlpool", $"Ship {ship.Number} sailed through a whirlpool to {exit.Q}, {exit.R}. Chart a new route with the remaining movement.");
                RefreshEncounters(ship.Id);
                break;
            }
            RefreshEncounters(ship.Id);
            if (state.Combat is not null || state.CombatChoices.Count > 0) break;
        }
        Log("movement", $"{Name(actor)} moved ship {ship.Number} {moved} hex{(moved == 1 ? "" : "es")}.");
        if (state.RemainingMovement == 0 && state.Combat is null && state.CombatChoices.Count == 0) ActionClock();
        SettleActions();
    }

    private void CollectPerk(Ship ship)
    {
        var pickup = state.PerkPickups.FirstOrDefault(p => p.Q == ship.Q && p.R == ship.R);
        if (ship.Perk is not null || pickup is null) return;
        ship.Perk = pickup.Kind;
        state.PerkPickups.Remove(pickup);
        Log("perk", $"{Name(ship.OwnerId)}'s ship {ship.Number} collected {PerkName(pickup.Kind)}.");
    }

    public static bool Triggers(Ship first, Ship second, BoardMap? board = null, IReadOnlyList<Port>? ports = null)
    {
        if (first.OwnerId == second.OwnerId) return false;
        var map = board ?? BoardDefinition.Classic;
        var harbor = map.Cell(first.Hex)?.HarborId;
        if (ports is not null && !ports.Any(p => p.Id == harbor)) harbor = null;
        return first.Hex.DistanceTo(second.Hex) == 1 || (harbor is not null && map.InHarbor(second.Hex, harbor));
    }
    private List<CombatChoice> Encounters(string? preferred = null)
    {
        var choices = new List<CombatChoice>();
        for (var i = 0; i < state.Ships.Count; i++)
            for (var j = i + 1; j < state.Ships.Count; j++)
            {
                var a = state.Ships[i]; var b = state.Ships[j];
                if (!Triggers(a, b, Board, state.Ports)) continue;
                if (b.Id == preferred || (a.Id != preferred && b.OwnerId == state.ActivePlayerId)) (a, b) = (b, a);
                var harbor = Board.Cell(a.Hex)?.HarborId;
                if (!state.Ports.Any(p => p.Id == harbor)) harbor = null;
                if (harbor is not null && !Board.InHarbor(b.Hex, harbor)) harbor = null;
                choices.Add(new($"{a.Id}:{b.Id}", a.Id, b.Id, harbor));
            }
        // Different triggering pairs can describe exactly the same fight. Only
        // ask for a choice if the forces or supporting port actually differ.
        return choices.DistinctBy(c =>
        {
            var a = Ship(c.TriggerShipId); var b = Ship(c.OpponentShipId);
            var participants = Helpers(a).Concat(Helpers(b)).Select(s => s.Id).Order(StringComparer.Ordinal);
            var support = SupportingPorts(a).Concat(SupportingPorts(b)).Select(p => p.Id).Distinct().Order(StringComparer.Ordinal);
            return string.Join(",", participants) + "|" + string.Join(",", support);
        }).ToList();
    }
    private void RefreshEncounters(string? preferred = null)
    {
        if (state.Phase != "playing" || state.Combat is not null) return;
        state.CombatChoices = Encounters(preferred);
        if (state.CombatChoices.Count == 1) StartBattle(state.CombatChoices[0]);
    }
    private IEnumerable<Ship> Helpers(Ship trigger) => state.Ships.Where(s => s.OwnerId == trigger.OwnerId && s.Hex.DistanceTo(trigger.Hex) <= 2);
    private IEnumerable<Port> SupportingPorts(Ship trigger) => state.Ports.Where(p =>
        p.OwnerId == trigger.OwnerId && Board.PortHex(p.Id).DistanceTo(trigger.Hex) <= 2);
    private void StartBattle(CombatChoice choice)
    {
        var a = Ship(choice.TriggerShipId); var b = Ship(choice.OpponentShipId);
        Require(Triggers(a, b, Board, state.Ports), "That encounter is no longer pending.");
        var battle = new CombatState
        {
            TriggerShipId = a.Id, OpponentShipId = b.Id, AttackerId = a.OwnerId, DefenderId = b.OwnerId,
            PortId = choice.HarborId,
            ParticipantShipIds = Helpers(a).Concat(Helpers(b)).Select(s => s.Id).Distinct().ToList(),
            SupportingPortIds = SupportingPorts(a).Concat(SupportingPorts(b)).Select(p => p.Id).Distinct().ToList()
        };
        SnapshotBattleShips(battle);
        state.Combat = battle; state.CombatChoices = [];
        ActionClock();
        Log("combat", $"Battle: {Name(a.OwnerId)} versus {Name(b.OwnerId)}{(choice.HarborId is null ? " at sea" : $" at {Port(choice.HarborId).Name}")}.");
    }
    private void Attack(string actor, GameCommand command)
    {
        Ready();
        Require(state.RemainingActions > 0 && state.RemainingMovement == 0, "A port attack needs an unused action. Finish or pass movement first.");
        var ship = Ship(command.ShipId); var port = Port(command.PortId);
        Require(ship.OwnerId == actor && port.OwnerId != actor, "Choose your ship and an enemy or unclaimed port.");
        Require(Board.InHarbor(ship.Hex, port.Id), "Your attacking ship must be in the port's dark-blue harbor.");
        Require(Encounters().Count == 0, "Ship combat must be resolved before a port attack.");
        state.RemainingActions--;
        state.Combat = new()
        {
            Kind = "port", TriggerShipId = ship.Id, PortId = port.Id, AttackerId = actor,
            DefenderId = port.OwnerId ?? port.Id, ParticipantShipIds = Helpers(ship).Select(s => s.Id).ToList(),
            DefenseModifier = -port.DefenseWeakness
        };
        SnapshotBattleShips(state.Combat);
        ActionClock();
        Log("combat", $"{Name(actor)} spent an action to attack {port.Name}.");
    }
    private void SnapshotBattleShips(CombatState battle) => battle.Ships = state.Ships
        .Where(s => battle.ParticipantShipIds.Contains(s.Id))
        .Select(s => new BattleShip(s.Id, s.OwnerId, s.Number, s.Q, s.R, s.Perk)).ToList();

    private void RollBattle(string? combatId)
    {
        var battle = state.Combat;
        Require(battle is not null && battle.Id == combatId && battle.Status == "awaiting-roll", "That battle is not awaiting a roll.");
        // Older saved battles did not retain their participant positions.
        if (battle!.Ships.Count == 0) SnapshotBattleShips(battle);
        battle!.Round++;
        battle.WinnerId = null;
        battle.LosingPlayerId = null;
        battle.Rolls = new() { [battle.AttackerId] = [], [battle.DefenderId] = [] };
        battle.BlackWhiteResult = null;
        battle.BlackWhiteOwnerId = null;
        var blackWhite = battle.ParticipantShipIds.Select(Ship).FirstOrDefault(ship => ship.Perk == "black-and-white");
        if (blackWhite is not null)
        {
            RollBlackAndWhite(battle, blackWhite);
            return;
        }
        foreach (var id in battle.ParticipantShipIds)
        {
            var ship = Ship(id);
            var roll = ship.Perk == "glass-cannon" ? dice.Roll(9) - 1 : dice.Roll();
            if (ship.Perk == "loaded-dice" && roll is 1 or 2) roll = 3;
            battle.Rolls[ship.OwnerId].Add(roll);
        }
        if (battle.Kind == "port") battle.Rolls[battle.DefenderId].Add(dice.Roll());
        else foreach (var id in battle.SupportingPortIds) battle.Rolls[Port(id).OwnerId!].Add(dice.Roll());
        var a = battle.Rolls[battle.AttackerId].Max();
        var b = battle.Rolls[battle.DefenderId].Max() + battle.DefenseModifier;
        if (a == b)
        {
            battle.Message = $"Tied at {a}. Roll again.";
            Log("roll", battle.Message, battle.Rolls);
            ActionClock(); return;
        }
        battle.WinnerId = a > b ? battle.AttackerId : battle.DefenderId;
        if (TryCheatDeath(battle)) return;
        if (battle.Kind == "port")
        {
            var port = Port(battle.PortId);
            if (a > b)
            {
                Capture(port, battle.AttackerId);
                battle.Message = $"{Name(battle.AttackerId)} captured {port.Name}, {a} to {b}.";
            }
            else
            {
                port.DefenseWeakness++;
                battle.Message = $"{port.Name} held, {b} to {a}. Its defense is now −{port.DefenseWeakness}. No ship is lost.";
            }
            battle.Status = "resolved";
        }
        else
        {
            battle.LosingPlayerId = a > b ? battle.DefenderId : battle.AttackerId;
            battle.Status = "choose-loss";
            var onlyCasualty = state.Ships.Count(s => s.OwnerId == battle.LosingPlayerId && battle.ParticipantShipIds.Contains(s.Id)) == 1;
            battle.Message = $"{Name(battle.WinnerId)} wins {Math.Max(a, b)} to {Math.Min(a, b)}. " +
                (onlyCasualty ? "The only eligible casualty will be resolved automatically." : $"{Name(battle.LosingPlayerId)} must choose a participating ship to lose.");
        }
        Log("roll", battle.Message, battle.Rolls);
        ActionClock();
        ResolveOnlyLoss($"{Name(battle.WinnerId!)} wins {Math.Max(a, b)} to {Math.Min(a, b)}.");
    }
    private void RollBlackAndWhite(CombatState battle, Ship holder)
    {
        battle.BlackWhiteOwnerId = holder.OwnerId;
        battle.BlackWhiteResult = dice.Roll(2) == 1 ? "black" : "white";
        var opposingId = holder.OwnerId == battle.AttackerId ? battle.DefenderId : battle.AttackerId;
        battle.WinnerId = battle.BlackWhiteResult == "black" ? holder.OwnerId : opposingId;
        if (TryCheatDeath(battle)) return;
        var result = $"{(battle.BlackWhiteResult == "black" ? "Black" : "White")}. " +
            $"{Name(battle.WinnerId)} wins the Black and White exchange.";
        if (battle.Kind == "port")
        {
            var port = Port(battle.PortId);
            if (battle.WinnerId == battle.AttackerId)
            {
                Capture(port, battle.AttackerId);
                battle.Message = $"{result} {Name(battle.AttackerId)} captured {port.Name}.";
            }
            else
            {
                port.DefenseWeakness++;
                battle.Message = $"{result} {port.Name} held. Its defense is now −{port.DefenseWeakness}. No ship is lost.";
            }
            battle.Status = "resolved";
        }
        else
        {
            battle.LosingPlayerId = battle.WinnerId == battle.AttackerId ? battle.DefenderId : battle.AttackerId;
            battle.Status = "choose-loss";
            var onlyCasualty = state.Ships.Count(s => s.OwnerId == battle.LosingPlayerId && battle.ParticipantShipIds.Contains(s.Id)) == 1;
            battle.Message = result + " " +
                (onlyCasualty ? "The only eligible casualty will be resolved automatically." : $"{Name(battle.LosingPlayerId)} must choose a participating ship to lose.");
        }
        Log("roll", battle.Message, blackWhiteResult: battle.BlackWhiteResult,
            blackWhiteOwnerId: battle.BlackWhiteOwnerId);
        ActionClock();
        ResolveOnlyLoss($"{Name(battle.WinnerId!)} wins the Black and White exchange.");
    }
    private bool TryCheatDeath(CombatState battle)
    {
        var loser = battle.WinnerId == battle.AttackerId ? battle.DefenderId : battle.AttackerId;
        var holder = state.Ships.Where(s => s.OwnerId == loser && s.Perk == "cheat-death" &&
            battle.ParticipantShipIds.Contains(s.Id)).OrderBy(s => s.Number).FirstOrDefault();
        if (holder is null) return false;
        Log("roll", $"{Name(loser)} lost the exchange. Ship {holder.Number} uses Cheat Death, forcing a public reroll before any losses or port effects.",
            battle.Rolls, battle.BlackWhiteResult, battle.BlackWhiteOwnerId);
        holder.Perk = null;
        battle.Ships = battle.Ships.Select(s => s.Id == holder.Id ? s with { Perk = null } : s).ToList();
        var pickup = PerkPlacement.Respawn("cheat-death", state, dice);
        state.PerkPickups.Add(pickup);
        Log("perk", $"Ship {holder.Number} consumed Cheat Death. The perk reappeared in open water at {pickup.Q}, {pickup.R}.");
        battle.Status = "awaiting-roll";
        battle.WinnerId = null;
        battle.LosingPlayerId = null;
        battle.Message = $"{Name(loser)} lost the exchange, but ship {holder.Number} used Cheat Death. Roll the exchange again.";
        ActionClock();
        return true;
    }
    private bool ResolveOnlyLoss(string? result = null)
    {
        var battle = state.Combat;
        if (battle?.Status != "choose-loss") return false;
        var casualties = state.Ships.Where(s => s.OwnerId == battle.LosingPlayerId && battle.ParticipantShipIds.Contains(s.Id)).ToArray();
        if (casualties.Length != 1) return false;
        if (battle.Ships.Count == 0) SnapshotBattleShips(battle);
        var casualty = casualties[0];
        result ??= $"{Name(battle.WinnerId!)} won the exchange.";
        Log("casualty", $"Ship {casualty.Number} is the only eligible casualty; resolving automatically.");
        RemoveLoss(casualty.OwnerId, battle.Id, casualty.Id);
        var outcome = state.Ships.Contains(casualty) ? "was recruited by the Black Pearl" : "was lost";
        battle.Message = $"{result} Ship {casualty.Number} {outcome} automatically. {battle.Message}";
        return true;
    }
    private void RemoveLoss(string actor, string? combatId, string? shipId)
    {
        var battle = state.Combat;
        Require(battle is not null && battle.Id == combatId && battle.Status == "choose-loss" && battle.LosingPlayerId == actor, "Only the losing captain can choose the casualty.");
        var ship = Ship(shipId);
        Require(ship.OwnerId == actor && battle!.ParticipantShipIds.Contains(ship.Id), "Choose a participating ship from your own fleet.");
        var pearl = state.Ships.Any(s => s.OwnerId == battle!.WinnerId && s.Perk == "black-pearl" && battle.ParticipantShipIds.Contains(s.Id));
        var converted = false;
        if (pearl)
        {
            var draw = dice.Next(6);
            converted = draw == 0;
            Log("perk", $"Black Pearl conversion check: {draw + 1}/6 (1 recruits; 2–6 do not). {(converted ? "Ship recruited." : "No conversion.")}");
        }
        if (converted)
        {
            ship.OwnerId = battle!.WinnerId!;
            ship.ConvertedTurnNumber = state.TurnNumber;
            Log("perk", $"{Name(ship.OwnerId)} recruited ship {ship.Number} at its current hex. No action dice were added this round.");
        }
        else
        {
            state.Ships.Remove(ship);
            if (ship.Perk is not null)
            {
                state.PerkPickups.Add(new(ship.Perk, ship.Q, ship.R));
                Log("perk", $"{PerkName(ship.Perk)} dropped at {ship.Q}, {ship.R}.");
            }
            Log("casualty", $"{Name(actor)} lost ship {ship.Number}.");
        }
        battle!.ParticipantShipIds.Remove(ship.Id);
        var a = state.Ships.SingleOrDefault(s => s.Id == battle.TriggerShipId);
        var b = state.Ships.SingleOrDefault(s => s.Id == battle.OpponentShipId);
        if (a is not null && b is not null && Triggers(a, b, Board, state.Ports))
        {
            // Helpers are fixed for this triggering pair; their assistance never chains.
            battle.Status = "awaiting-roll"; battle.LosingPlayerId = null;
            battle.Message = "The triggering ships remain in combat. Roll the next exchange.";
        }
        else
        {
            battle.Status = "resolved";
            battle.Message = "The triggering encounter is resolved. Remaining encounters will be checked before sailing resumes.";
        }
        ActionClock();
    }
    private void Capture(Port port, string capturer)
    {
        var previous = port.OwnerId;
        port.OwnerId = capturer; port.DefenseWeakness = 0;
        var voided = state.Constructions.RemoveAll(b => b.PortId == port.Id);
        if (voided > 0) Log("construction", $"{voided} ship build(s) at {port.Name} were lost on capture.");
        if (previous is not null && !state.Ports.Any(p => p.OwnerId == previous))
        {
            foreach (var ship in state.Ships.Where(s => s.OwnerId == previous)) ship.OwnerId = capturer;
            Log("elimination", $"{Name(previous)} lost their final port. Their surviving ships now sail for {Name(capturer)}.");
        }
        TryFinishGame(keepBattle: true);
    }
    private bool TryFinishGame(bool keepBattle = false)
    {
        if (state.Phase is not ("playing" or "draft")) return false;
        // Unpicked captains are still competitors during the draft. Once play
        // begins, only ownership matters; neutral ports are never competitors.
        var remaining = state.Players.Where(p => !p.HasForfeited &&
            (state.Phase == "draft" || state.Ports.Any(port => port.OwnerId == p.Id))).ToArray();
        if (remaining.Length != 1) return false;
        var drafting = state.Phase == "draft";
        state.Phase = "finished"; state.WinnerId = remaining[0].Id;
        if (!keepBattle) state.Combat = null;
        state.CombatChoices.Clear();
        state.RemainingActions = 0; state.RemainingMovement = 0;
        state.IsBuildPhase = false; state.IsEndingRound = false; state.AvailableBuilds = 0;
        state.TurnEndsAt = null; state.ActionEndsAt = null;
        Log("victory", drafting
            ? $"{remaining[0].Name} is the last captain and wins Marauders!"
            : $"{remaining[0].Name} is the only captain with ports and wins Marauders!");
        SnapshotRound(isFinal: true);
        return true;
    }
    private void SettleActions()
    {
        if (state.Phase != "playing" || state.Combat is not null || state.CombatChoices.Count > 0 || state.IsBuildPhase) return;
        if ((state.RemainingActions == 0 && state.RemainingMovement == 0) || !state.Ships.Any(s => s.OwnerId == state.ActivePlayerId)) BeginBuild();
    }
    private void BeginBuild()
    {
        state.IsBuildPhase = true; state.RemainingActions = 0; state.RemainingMovement = 0;
        state.AvailableBuilds = FreeBuilds(state.ActivePlayerId!);
        ActionClock();
        Log("turn", $"{Name(state.ActivePlayerId!)} is choosing construction ({state.AvailableBuilds} available). ");
        if (state.AvailableBuilds == 0) FinishRound();
    }
    private void CompleteConstruction(string owner)
    {
        foreach (var build in state.Constructions.Where(b => b.OwnerId == owner && b.StartedTurnNumber < state.TurnNumber).ToArray())
        {
            build.RemainingOwnerTurns = Math.Max(0, build.RemainingOwnerTurns - 1);
            if (build.RemainingOwnerTurns > 0) continue;
            var occupied = state.Ships.Select(s => s.Hex).ToHashSet();
            if (state.Whirlpool is { } pair) { occupied.Add(pair.First); occupied.Add(pair.Second); }
            var hex = Board.SpawnHex(build.PortId, occupied);
            // Retain completed construction if no legal launch space is available.
            if (hex is null) continue;
            AddShip(owner, build.PortId, hex.Value);
            state.Constructions.Remove(build);
            Log("construction", $"{Name(owner)} launched a ship at {Port(build.PortId).Name}{(Board.InHarbor(hex.Value, build.PortId) ? "" : " into nearby open water")}; it can move next round.");
        }
    }
    private static string PerkName(string kind) => kind switch
    {
        "black-pearl" => "The Black Pearl", "glass-cannon" => "Glass Cannon", "loaded-dice" => "Loaded Dice",
        "mouth-to-feed" => "Mouth to Feed", "black-and-white" => "Black and White", "cheat-death" => "Cheat Death", _ => kind
    };
    private void FinishRound()
    {
        var owner = state.ActivePlayerId!;
        if (!state.IsEndingRound)
        {
            // This boundary can pause for launch battles and survive a restart.
            // Build assignment and progression must happen exactly once.
            state.IsEndingRound = true; state.IsBuildPhase = true;
            state.RemainingActions = 0; state.RemainingMovement = 0; state.AvailableBuilds = 0;
            var ports = state.Ports.Where(p => p.OwnerId == owner).ToArray();
            var unchosen = FreeBuilds(owner);
            for (var i = 0; i < unchosen && ports.Length > 0; i++)
            {
                var port = ports[dice.Next(ports.Length)];
                var ownerTurns = NewConstructionOwnerTurns;
                state.Constructions.Add(new() { OwnerId = owner, PortId = port.Id,
                    StartedTurnNumber = state.TurnNumber, RemainingOwnerTurns = ownerTurns });
                Log("construction", $"{Name(owner)} automatically started a ship at randomly selected {port.Name}; ready in {ownerTurns} owner rounds.");
            }
            CompleteConstruction(owner);
            RefreshEncounters();
        }
        if (state.Combat is not null || state.CombatChoices.Count > 0)
        {
            // Only the battle decision clock runs; the next turn has not begun.
            state.TurnEndsAt = null;
            ActionClock();
            return;
        }
        SnapshotRound();
        AdvanceWhirlpool();
        AdvanceTurn(owner);
    }
    private void AdvanceTurn(string owner)
    {
        var index = state.TurnOrder.IndexOf(owner);
        var next = Enumerable.Range(1, state.TurnOrder.Count).Select(i => state.TurnOrder[(index + i) % state.TurnOrder.Count]).First(id => state.Ports.Any(p => p.OwnerId == id));
        state.TurnNumber++;
        BeginTurn(next);
    }

    private void AdvanceWhirlpool()
    {
        if (state.Whirlpool is { } pair)
        {
            if (--pair.RemainingTurns == 0)
            {
                state.Whirlpool = null;
                Log("whirlpool", "The whirlpools faded. Ships remain at their current hexes.");
            }
            return;
        }
        if (dice.Next(1000) >= 100) return;
        var candidates = Board.Cells.Where(c => c.Terrain == "water" &&
            !state.Ships.Any(s => s.Hex == c.Hex) && !state.PerkPickups.Any(p => p.Q == c.Q && p.R == c.R)).Select(c => c.Hex).ToArray();
        var starts = candidates.Where(a => candidates.Any(b => a.DistanceTo(b) >= 10)).ToArray();
        if (starts.Length == 0) return;
        var first = starts[dice.Next(starts.Length)];
        var exits = candidates.Where(b => first.DistanceTo(b) >= 10).ToArray();
        state.Whirlpool = new() { First = first, Second = exits[dice.Next(exits.Length)],
            RemainingTurns = 2 * state.Players.Count(p => !p.HasForfeited && state.Ports.Any(port => port.OwnerId == p.Id)) };
        Log("whirlpool", $"Two whirlpools appeared at {first.Q}, {first.R} and {state.Whirlpool.Second.Q}, {state.Whirlpool.Second.R}, lasting {state.Whirlpool.RemainingTurns} captain turns.");
    }

    private void Forfeit(string actor)
    {
        var player = state.Players.Single(p => p.Id == actor);
        Require(!player.HasForfeited, "This captain has already left.");
        if (state.Phase == "finished") return;
        state.MapVotes.Remove(actor);
        if (state.Phase == "lobby")
        {
            state.Players.Remove(player);
            if (state.HostPlayerId == actor) state.HostPlayerId = state.Players.FirstOrDefault()?.Id;
            if (state.FirstPlayerId == actor) state.FirstPlayerId = state.HostPlayerId;
            InvalidateLobbyReadiness();
            Log("lobby", $"{player.Name} left the lobby.");
            return;
        }
        Require(state.Phase is "draft" or "playing", "Wait for the game to finish setting up.");
        player.HasForfeited = true;
        state.Ships.RemoveAll(s => s.OwnerId == actor);
        state.Constructions.RemoveAll(b => b.OwnerId == actor);
        foreach (var port in state.Ports.Where(p => p.OwnerId == actor))
        {
            port.OwnerId = null;
            port.DefenseWeakness = 0;
        }
        if (state.HostPlayerId == actor) state.HostPlayerId = state.Players.FirstOrDefault(p => !p.HasForfeited)?.Id;
        Log("forfeit", $"{player.Name} forfeited and left. Their ports are now neutral with full defense; their ships, carried perks, and construction vanished.");
        if (TryFinishGame()) return;
        if (state.Phase == "draft") { AdvanceDraft(); return; }
        var wasActive = state.ActivePlayerId == actor;
        var battle = state.Combat;
        if (wasActive || battle?.AttackerId == actor || battle?.DefenderId == actor)
        {
            state.Combat = null;
            Log("combat", "The pending battle was cleared after the forfeit; remaining encounters will be checked.");
        }
        else if (battle is not null) battle.SupportingPortIds.RemoveAll(id => !state.Ports.Any(p => p.Id == id));
        state.CombatChoices.Clear();
        if (wasActive) { SnapshotRound(); AdvanceWhirlpool(); AdvanceTurn(actor); }
        else
        {
            RefreshEncounters();
            RefreshBuildCapacity();
            if (state.IsEndingRound) FinishRound(); else SettleActions();
        }
    }
    private void SnapshotRound(bool isFinal = false) => state.RoundHistory.Add(new(
        state.TurnNumber, state.ActivePlayerId, now, isFinal,
        state.Players.Select(p => new TeamSnapshot(p.Id, state.Ships.Count(s => s.OwnerId == p.Id),
            state.Ports.Count(port => port.OwnerId == p.Id))).ToList()));
    private void BeginTurn(string owner)
    {
        state.ActivePlayerId = owner;
        state.RemainingActions = ActionCount(state.Ships.Count(s => s.OwnerId == owner));
        state.RemainingMovement = 0; state.LastRoll = null;
        state.IsBuildPhase = false; state.IsEndingRound = false; state.AvailableBuilds = 0;
        state.TurnEndsAt = now.AddSeconds(Math.Max(options.TurnSeconds, (state.RemainingActions + 1L) * options.ActionSeconds));
        ActionClock();
        Log("turn", $"{Name(owner)} begins round {state.TurnNumber} with {state.RemainingActions} action dice.");
        if (state.TurnNumber == 58)
            Log("construction", "Shipyard warning: starting in eight rounds, new construction will need 3 owner rounds. Existing construction will keep its timing.");
        else if (state.TurnNumber == 66)
            Log("construction", "Late-game shipyards are now active: new construction needs 3 owner rounds. Existing construction keeps its timing.");
        RefreshEncounters();
        SettleActions();
    }

    public bool Expire()
    {
        // Finish older saves that were waiting for the sole owner to capture
        // neutral ports, using the normal atomic persistence/broadcast path.
        if (state.Phase == "playing" && TryFinishGame()) return true;
        // Resume saves from the former manual setup flow through the store's
        // normal atomic commit and broadcast, without requiring a client action.
        if (state.Phase == "placement")
        {
            if (state.PerkPickups.Count == 0) RevealPerks();
            LaunchStartingFleets();
            return true;
        }
        if (state.Phase == "draft" && state.PerkPickups.Count == 0) { RevealPerks(); return true; }
        // Older saves can contain several options for the same forces.
        if (state.Phase == "playing" && HasTime && state.Combat is null && state.CombatChoices.Count > 0)
        {
            var count = state.CombatChoices.Count;
            RefreshEncounters(state.CombatChoices[0].TriggerShipId);
            if (state.Combat is not null || state.CombatChoices.Count != count) return true;
        }
        // Resume an older saved single-casualty choice without waiting for a captain.
        // Already expired rounds continue through the normal timeout path below.
        if (state.Phase == "playing" && HasTime && ResolveOnlyLoss()) return true;
        if (state.Phase != "playing" || HasTime) return false;
        Log("timeout", $"{Name(state.ActivePlayerId!)} ran out of time. The round is ending.");
        // Resolve mandatory battles with public server rolls and deterministic
        // casualty choices before using the normal construction/advance path.
        var exchanges = 0;
        var endingTurn = state.TurnNumber;
        while (state.Phase == "playing" && state.TurnNumber == endingTurn)
        {
            if (state.Combat is null && state.CombatChoices.Count == 0)
            {
                FinishRound();
                if (state.TurnNumber != endingTurn) return true;
            }
            if (++exchanges > 512)
            {
                ActionClock();
                if (!state.IsEndingRound) state.TurnEndsAt = now.AddSeconds(options.TurnSeconds);
                return true;
            }
            if (state.Combat is null) StartBattle(state.CombatChoices[0]);
            var battle = state.Combat!;
            if (battle.Status == "awaiting-roll") RollBattle(battle.Id);
            else if (battle.Status == "choose-loss")
            {
                var casualty = state.Ships.Where(s => s.OwnerId == battle.LosingPlayerId && battle.ParticipantShipIds.Contains(s.Id)).OrderBy(s => s.Id, StringComparer.Ordinal).First();
                RemoveLoss(battle.LosingPlayerId!, battle.Id, casualty.Id);
            }
            else { state.Combat = null; RefreshEncounters(); }
            if (state.Phase == "finished") return true;
        }
        return true;
    }
}
