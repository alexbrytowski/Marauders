using System.Security.Claims;
using System.Threading.RateLimiting;
using Marauders.Server;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOptions<GameOptions>().BindConfiguration("Game")
    .Validate(o => o.TurnSeconds >= 10 && o.ActionSeconds >= 5, "Game timers must be at least 10/5 seconds.").ValidateOnStart();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<IDice, ServerDice>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<GameStateStore>();
builder.Services.AddSingleton<GameHubNotifier>();
builder.Services.AddHostedService<TurnTimerService>();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
var dataDirectory = builder.Configuration["Game:DataDirectory"] ?? Path.Combine(builder.Environment.ContentRootPath, "data");
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(dataDirectory, "keys"))).SetApplicationName("Marauders");
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "Marauders.Browser";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(30);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("mutations", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.Configure<ForwardedHeadersOptions>(options => options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);
var app = builder.Build();
app.UseForwardedHeaders();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    // A custom header plus no cross-origin CORS permission prevents form/CSRF
    // mutations; SameSite cookies provide an additional browser boundary.
    if (context.Request.Method == "POST" && context.Request.Path.StartsWithSegments("/api") && context.Request.Headers["X-Marauders-Client"] != "web")
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { error = "Use the Marauders game client." }); return;
    }
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.MapHealthChecks("/api/health");
app.MapGet("/api/board", () => Results.Ok(new { version = BoardDefinition.Version, cells = BoardDefinition.Cells }));
app.MapGet("/api/game", async (GameStateStore store) => Results.Ok(await store.ReadAsync()));
app.MapGet("/api/session", async (HttpContext context, GameStateStore store) =>
{
    var browser = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (browser is null)
    {
        browser = Guid.NewGuid().ToString("N");
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, browser)], CookieAuthenticationDefaults.AuthenticationScheme);
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
    }
    return Results.Ok(new { playerId = await store.PlayerIdAsync(browser), canReset = app.Environment.IsDevelopment() });
});
static string Browser(HttpContext context) => context.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
static async Task<IResult> Publish(MutationResult result, GameHubNotifier notifier)
{
    if (!result.Success) return Results.Json(new { error = result.Error }, statusCode: result.StatusCode);
    await notifier.GameUpdatedAsync(result.State!);
    return Results.Ok(result.State);
}
var api = app.MapGroup("/api/game").RequireAuthorization().RequireRateLimiting("mutations");
api.MapPost("/players", async (JoinRequest request, HttpContext context, GameStateStore store, GameHubNotifier notifier)
    => await Publish(await store.JoinAsync(Browser(context), request), notifier));
api.MapPost("/action", async (GameCommand request, HttpContext context, GameStateStore store, GameHubNotifier notifier)
    => await Publish(await store.ActAsync(Browser(context), request), notifier));
if (app.Environment.IsDevelopment())
    api.MapPost("/reset", async (HttpContext context, GameStateStore store, GameHubNotifier notifier)
        => await Publish(await store.ResetAsync(Browser(context)), notifier));
app.MapHub<GameHub>("/hubs/game").RequireAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();

public partial class Program;
