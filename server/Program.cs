using Marauders.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddSingleton<GameStateStore>();
builder.Services.AddSingleton<GameHubNotifier>();
builder.Services.AddHostedService<TurnTimerService>();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
var app = builder.Build();
app.UseCors();
app.MapGet("/api/board-image", (IHostEnvironment environment) =>
{
    var imagePath = Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "Original Marauders Board.jpeg"));
    return File.Exists(imagePath) ? Results.File(imagePath, "image/jpeg") : Results.NotFound();
});
app.MapGet("/api/game", (GameStateStore store) => Results.Ok(store.Read()));
app.MapPost("/api/game/reset", async (GameStateStore store, GameHubNotifier notifier) =>
{
    var state = await store.ResetAsync();
    await notifier.GameUpdatedAsync(state);
    return Results.Ok(state);
});
app.MapPost("/api/game/players", async (AddPlayerRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.AddPlayerAsync(request.Name, request.Color);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/start-draft", async (GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.StartDraftAsync();
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/draft", async (DraftPortRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.DraftPortAsync(request.PlayerId, request.PortId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/roll-movement", async (PlayerRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.RollMovementAsync(request.PlayerId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/end-turn", async (PlayerRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.EndTurnAsync(request.PlayerId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/move", async (MoveRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.MoveShipAsync(request.PlayerId, request.ShipId, request.Q, request.R);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/combat/roll", async (CombatRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.RollCombatAsync(request.PlayerId, request.CombatId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/combat/remove-ship", async (CombatLossRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.RemoveCombatShipAsync(request.PlayerId, request.CombatId, request.ShipId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/attack-port", async (PortAttackRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.AttackPortAsync(request.PlayerId, request.ShipId, request.PortId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapPost("/api/game/start-construction", async (ConstructionRequest request, GameStateStore store, GameHubNotifier notifier) =>
{
    var result = await store.StartConstructionAsync(request.PlayerId, request.PortId);
    if (!result.Success) return Results.BadRequest(new { error = result.Error });
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
});
app.MapHub<GameHub>("/hubs/game");
app.Run();

public record AddPlayerRequest(string Name, string Color);
public record DraftPortRequest(string PlayerId, string PortId);
public record PlayerRequest(string PlayerId);
public record MoveRequest(string PlayerId, string ShipId, int Q, int R);
public record CombatRequest(string PlayerId, string CombatId);
public record CombatLossRequest(string PlayerId, string CombatId, string ShipId);
public record PortAttackRequest(string PlayerId, string ShipId, string PortId);
public record ConstructionRequest(string PlayerId, string PortId);
