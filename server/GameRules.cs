namespace Marauders.Server;

/// <summary>All rule decisions and random rolls live on the server. Each instance
/// operates on a private candidate state; a rejected command is never published.</summary>
public sealed class GameRules(GameState state, IDice dice, GameOptions options, DateTimeOffset now)
{
    public static int ActionCount(int ships) => ships == 0 ? 0 : ships / 4 + 1;
    public static readonly string[] Colors = ["#ed7866", "#69c5bc", "#b19bdf", "#e6be68"];
    public static readonly string[] Characters = ["navigator", "corsair", "privateer", "buccaneer"];
    private static void Require([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool condition, string error) { if (!condition) throw new RuleException(error); }
    private string Name(string id) => state.Players.FirstOrDefault(p => p.Id == id)?.Name ?? "Unclaimed port";
    private Ship Ship(string? id) => state.Ships.SingleOrDefault(s => s.Id == id) ?? throw new RuleException("That ship is no longer on the board.");
    private Port Port(string? id) => state.Ports.SingleOrDefault(p => p.Id == id) ?? throw new RuleException("Choose a port on the map.");
    private int Capacity(string id) => state.Ports.Count(p => p.OwnerId == id) * 2;
    private int FreeBuilds(string id) => Math.Max(0, Capacity(id) - state.Ships.Count(s => s.OwnerId == id) - state.Constructions.Count(b => b.OwnerId == id));
    private void Log(string kind, string message, Dictionary<string, List<int>>? rolls = null)
        => state.Events.Add(new(Guid.NewGuid().ToString("N"), now, state.TurnNumber, kind, message,
            rolls?.ToDictionary(p => p.Key, p => p.Value.ToList())));

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
        var player = new Player { Name = name, Color = request.Color, Character = request.Character };
        state.Players.Add(player);
        state.HostPlayerId ??= player.Id;
        Log("lobby", $"{name} joined the crew.");
        return player;
    }

    public void Act(string playerId, GameCommand command)
    {
        Require(state.Players.Any(p => p.Id == playerId), "Spectators cannot control a captain.");
        if (state.Phase == "playing") Require(state.TurnEndsAt > now && state.ActionEndsAt > now, "The clock has expired. Wait for the next round.");
        if (command.Type == "start-draft") { StartDraft(playerId, command.FirstPlayerId); return; }
        if (command.Type == "draft") { Draft(playerId, command.PortId); return; }
        if (command.Type == "place") { Place(playerId, command); return; }
        if (command.Type == "finish-placement") { FinishPlacement(playerId); return; }
        Require(state.Phase == "playing" || (state.Phase == "finished" && command.Type == "continue-combat"), "The game is not in play.");
        if (command.Type == "remove-ship") { RemoveLoss(playerId, command.CombatId, command.ShipId); return; }
        Require(state.ActivePlayerId == playerId, "It is another captain's turn.");
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
                if (state.Phase == "playing") { RefreshEncounters(); SettleActions(); }
                break;
            case "roll-movement":
                Ready();
                Require(state.RemainingActions > 0 && state.RemainingMovement == 0, "Finish your current movement before using another die.");
                state.LastRoll = dice.Roll();
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
                Require(state.IsBuildPhase, "Construction starts at the end of your round.");
                var port = Port(command.PortId);
                Require(port.OwnerId == playerId, "Choose one of your own ports.");
                Require(FreeBuilds(playerId) > 0, "Your fleet and construction already fill your population cap.");
                state.Constructions.Add(new() { OwnerId = playerId, PortId = port.Id, StartedTurnNumber = state.TurnNumber });
                state.AvailableBuilds = FreeBuilds(playerId);
                Log("construction", $"{Name(playerId)} started a ship at {port.Name}; ready in two owner rounds.");
                break;
            default: throw new RuleException("Unknown game action.");
        }
    }

    private void StartDraft(string actor, string? first)
    {
        Require(state.Phase == "lobby" && state.Players.Count == 4, "Four captains must join before the draft.");
        Require(state.HostPlayerId == actor, "The host starts the draft.");
        var start = state.Players.FindIndex(p => p.Id == first);
        Require(start >= 0, "Choose which captain goes first.");
        state.TurnOrder = Enumerable.Range(0, 4).Select(i => state.Players[(start + i) % 4].Id).ToList();
        state.Phase = "draft"; state.ActivePlayerId = first;
        Log("draft", $"{Name(first!)} picks first. The port draft has begun.");
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
        if (state.DraftPickNumber == 12)
        {
            state.Phase = "placement"; state.ActivePlayerId = state.TurnOrder[0];
            Log("setup", "Place two ships in each owned port's dark-blue harbor.");
        }
        else state.ActivePlayerId = DraftPlayer(state.DraftPickNumber);
    }
    private void AddShip(string ownerId, string portId, Hex hex)
    {
        var number = state.Ships.Select(s => s.Number).DefaultIfEmpty(0).Max() + 1;
        state.Ships.Add(new() { OwnerId = ownerId, PortId = portId, Q = hex.Q, R = hex.R, Number = number });
    }
    private void Place(string actor, GameCommand command)
    {
        Require(state.Phase == "placement" && state.ActivePlayerId == actor, "Wait for your fleet placement turn.");
        var port = Port(command.PortId);
        Require(port.OwnerId == actor, "Choose one of your own ports.");
        Require(state.Ships.Count(s => s.PortId == port.Id) < 2, "This port already has its two starting ships.");
        Require(command.Q.HasValue && command.R.HasValue, "Choose a harbor hex.");
        var hex = new Hex(command.Q!.Value, command.R!.Value);
        Require(BoardDefinition.InHarbor(hex, port.Id), "Starting ships must be in that port's dark-blue water.");
        Require(!state.Ships.Any(s => s.Hex == hex), "A ship already occupies that hex.");
        AddShip(actor, port.Id, hex);
    }
    private void FinishPlacement(string actor)
    {
        Require(state.Phase == "placement" && state.ActivePlayerId == actor, "Wait for your fleet placement turn.");
        Require(state.Ports.Where(p => p.OwnerId == actor).All(p => state.Ships.Count(s => s.PortId == p.Id) == 2), "Place two ships at each of your three ports first.");
        state.PlacementDone.Add(actor);
        Log("setup", $"{Name(actor)} has deployed all six ships.");
        if (state.PlacementDone.Count < 4) state.ActivePlayerId = state.TurnOrder[state.PlacementDone.Count];
        else { state.Phase = "playing"; state.TurnNumber = 1; BeginTurn(state.TurnOrder[0]); }
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
        var path = BoardDefinition.FindPath(ship.Hex, new(command.Q!.Value, command.R!.Value), state.Ships.Where(s => s.Id != ship.Id).Select(s => s.Hex).ToHashSet());
        Require(path is not null && path.Count > 1 && path.Count - 1 <= state.RemainingMovement, "Choose a reachable empty water hex within your movement.");
        var moved = 0;
        foreach (var hex in path!.Skip(1))
        {
            var previousHarbor = BoardDefinition.Cell(ship.Hex)?.HarborId;
            ship.Q = hex.Q; ship.R = hex.R;
            state.RemainingMovement--; moved++;
            var harbor = BoardDefinition.Cell(hex)?.HarborId;
            if (harbor is not null && harbor != previousHarbor)
            {
                var port = Port(harbor);
                if (port.OwnerId == actor && port.DefenseWeakness > 0)
                {
                    port.DefenseWeakness = 0;
                    Log("port", $"An allied ship restored {port.Name}'s defense.");
                }
            }
            RefreshEncounters(ship.Id);
            if (state.Combat is not null || state.CombatChoices.Count > 0) break;
        }
        Log("movement", $"{Name(actor)} moved ship {ship.Number} {moved} hex{(moved == 1 ? "" : "es")}.");
        if (state.RemainingMovement == 0 && state.Combat is null && state.CombatChoices.Count == 0) ActionClock();
        SettleActions();
    }

    public static bool Triggers(Ship first, Ship second)
    {
        if (first.OwnerId == second.OwnerId) return false;
        var harbor = BoardDefinition.Cell(first.Hex)?.HarborId;
        return first.Hex.DistanceTo(second.Hex) == 1 || (harbor is not null && BoardDefinition.InHarbor(second.Hex, harbor));
    }
    private List<CombatChoice> Encounters(string? preferred = null)
    {
        var choices = new List<CombatChoice>();
        for (var i = 0; i < state.Ships.Count; i++)
            for (var j = i + 1; j < state.Ships.Count; j++)
            {
                var a = state.Ships[i]; var b = state.Ships[j];
                if (!Triggers(a, b)) continue;
                if (b.Id == preferred || (a.Id != preferred && b.OwnerId == state.ActivePlayerId)) (a, b) = (b, a);
                var harbor = BoardDefinition.Cell(a.Hex)?.HarborId;
                if (harbor is not null && !BoardDefinition.InHarbor(b.Hex, harbor)) harbor = null;
                choices.Add(new($"{a.Id}:{b.Id}", a.Id, b.Id, harbor));
            }
        return choices;
    }
    private void RefreshEncounters(string? preferred = null)
    {
        if (state.Phase != "playing" || state.Combat is not null) return;
        state.CombatChoices = Encounters(preferred);
        if (state.CombatChoices.Count == 1) StartBattle(state.CombatChoices[0]);
    }
    private IEnumerable<Ship> Helpers(Ship trigger) => state.Ships.Where(s => s.OwnerId == trigger.OwnerId && s.Hex.DistanceTo(trigger.Hex) <= 2);
    private void StartBattle(CombatChoice choice)
    {
        var a = Ship(choice.TriggerShipId); var b = Ship(choice.OpponentShipId);
        Require(Triggers(a, b), "That encounter is no longer pending.");
        var battle = new CombatState
        {
            TriggerShipId = a.Id, OpponentShipId = b.Id, AttackerId = a.OwnerId, DefenderId = b.OwnerId,
            PortId = choice.HarborId,
            ParticipantShipIds = Helpers(a).Concat(Helpers(b)).Select(s => s.Id).Distinct().ToList()
        };
        if (choice.HarborId is not null)
        {
            var port = Port(choice.HarborId);
            if (port.OwnerId == a.OwnerId || port.OwnerId == b.OwnerId) battle.SupportingPortIds.Add(port.Id);
        }
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
        Require(BoardDefinition.InHarbor(ship.Hex, port.Id), "Your attacking ship must be in the port's dark-blue harbor.");
        Require(Encounters().Count == 0, "Ship combat must be resolved before a port attack.");
        state.RemainingActions--;
        state.Combat = new()
        {
            Kind = "port", TriggerShipId = ship.Id, PortId = port.Id, AttackerId = actor,
            DefenderId = port.OwnerId ?? port.Id, ParticipantShipIds = Helpers(ship).Select(s => s.Id).ToList(),
            DefenseModifier = -port.DefenseWeakness
        };
        ActionClock();
        Log("combat", $"{Name(actor)} spent an action to attack {port.Name}.");
    }
    private void RollBattle(string? combatId)
    {
        var battle = state.Combat;
        Require(battle is not null && battle.Id == combatId && battle.Status == "awaiting-roll", "That battle is not awaiting a roll.");
        battle!.Round++;
        battle.Rolls = new() { [battle.AttackerId] = [], [battle.DefenderId] = [] };
        foreach (var id in battle.ParticipantShipIds)
        {
            var ship = Ship(id);
            battle.Rolls[ship.OwnerId].Add(dice.Roll());
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
            battle.Message = $"{Name(battle.WinnerId)} wins {Math.Max(a, b)} to {Math.Min(a, b)}. {Name(battle.LosingPlayerId)} must choose a participating ship to lose.";
        }
        Log("roll", battle.Message, battle.Rolls);
        ActionClock();
    }
    private void RemoveLoss(string actor, string? combatId, string? shipId)
    {
        var battle = state.Combat;
        Require(battle is not null && battle.Id == combatId && battle.Status == "choose-loss" && battle.LosingPlayerId == actor, "Only the losing captain can choose the casualty.");
        var ship = Ship(shipId);
        Require(ship.OwnerId == actor && battle!.ParticipantShipIds.Contains(ship.Id), "Choose a participating ship from your own fleet.");
        state.Ships.Remove(ship);
        battle!.ParticipantShipIds.Remove(ship.Id);
        Log("casualty", $"{Name(actor)} lost ship {ship.Number}.");
        var a = state.Ships.SingleOrDefault(s => s.Id == battle.TriggerShipId);
        var b = state.Ships.SingleOrDefault(s => s.Id == battle.OpponentShipId);
        if (a is not null && b is not null && Triggers(a, b))
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
        if (state.Ports.All(p => p.OwnerId == capturer))
        {
            state.Phase = "finished"; state.WinnerId = capturer;
            state.RemainingActions = 0; state.RemainingMovement = 0;
            state.TurnEndsAt = null; state.ActionEndsAt = null;
            Log("victory", $"{Name(capturer)} owns every port and wins Marauders!");
        }
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
            var hex = BoardDefinition.SpawnHex(build.PortId, state.Ships.Select(s => s.Hex).ToHashSet());
            // A completely full map is impossible at the 26-ship population cap,
            // but retain a completed build rather than losing it if data changes.
            if (hex is null) continue;
            AddShip(owner, build.PortId, hex.Value);
            state.Constructions.Remove(build);
            Log("construction", $"{Name(owner)} launched a ship at {Port(build.PortId).Name}{(BoardDefinition.InHarbor(hex.Value, build.PortId) ? "" : " into nearby open water")}; it can move next round.");
        }
    }
    private void FinishRound()
    {
        var owner = state.ActivePlayerId!;
        CompleteConstruction(owner);
        var index = state.TurnOrder.IndexOf(owner);
        var next = Enumerable.Range(1, 4).Select(i => state.TurnOrder[(index + i) % 4]).First(id => state.Ports.Any(p => p.OwnerId == id));
        state.TurnNumber++;
        BeginTurn(next);
    }
    private void BeginTurn(string owner)
    {
        state.ActivePlayerId = owner;
        state.RemainingActions = ActionCount(state.Ships.Count(s => s.OwnerId == owner));
        state.RemainingMovement = 0; state.LastRoll = null;
        state.IsBuildPhase = false; state.AvailableBuilds = 0;
        state.TurnEndsAt = now.AddSeconds(options.TurnSeconds);
        ActionClock();
        Log("turn", $"{Name(owner)} begins round {state.TurnNumber} with {state.RemainingActions} action dice.");
        RefreshEncounters();
        SettleActions();
    }

    public bool Expire()
    {
        if (state.Phase != "playing" || (state.TurnEndsAt > now && state.ActionEndsAt > now)) return false;
        Log("timeout", $"{Name(state.ActivePlayerId!)} ran out of time. The round is ending.");
        // Resolve mandatory battles with public server rolls and deterministic
        // casualty choices before using the normal construction/advance path.
        var exchanges = 0;
        while (state.Combat is not null || state.CombatChoices.Count > 0)
        {
            if (++exchanges > 512) { ActionClock(); state.TurnEndsAt = now.AddSeconds(options.TurnSeconds); return true; }
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
        FinishRound();
        return true;
    }
}
