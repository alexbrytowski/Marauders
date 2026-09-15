using System.Security.Claims;
using System.Threading.RateLimiting;
using Marauders.Server;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);
// Railway supplies PORT; bind the public-facing container interface explicitly.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } portValue)
{
    if (!int.TryParse(portValue, out var port) || port is < 1 or > 65535)
        throw new InvalidOperationException("PORT must be an integer between 1 and 65535.");
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}
builder.Services.AddOptions<GameOptions>().BindConfiguration("Game")
    .Validate(o => o.TurnSeconds >= 10 && o.ActionSeconds >= 5, "Game timers must be at least 10/5 seconds.")
    .Validate(o => o.StartingRound is >= 1 and <= 100_000, "Game__StartingRound must be between 1 and 100000.")
    .Validate(o => o.ResetPassword is null || o.ResetPassword.Length is >= 12 and <= 1024, "The reset password must contain 12–1024 characters when configured.").ValidateOnStart();
builder.Services.AddOptions<GameOptions>()
    .Validate(o => builder.Environment.IsDevelopment() || o.StartingRound == 1, "Game__StartingRound can only skip rounds in Development.")
    .Validate(o => builder.Environment.IsDevelopment() || !string.IsNullOrWhiteSpace(o.ResetPassword), "A production server requires Game__ResetPassword so its reset control is available.")
    .Validate(o => builder.Environment.IsDevelopment() || o.TrustForwardedHeaders, "A production server requires Game__TrustForwardedHeaders=true behind its trusted HTTPS proxy.");
builder.Services.AddControllers();
builder.Services.AddSingleton<CharacterCatalog>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<IDice, ServerDice>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<GameStateStore>();
builder.Services.AddSingleton<GameHubNotifier>();
builder.Services.AddHostedService<TurnTimerService>();
builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddHttpsRedirection(options => options.HttpsPort = 443);
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
    // Key by remote IP, not disposable browser cookies, to bound password guesses.
    options.AddPolicy("reset", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("mutations", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Railway terminates public HTTPS before this single container. The explicit
    // production opt-in above prevents accepting spoofed forwarding headers on a
    // server exposed directly to the internet.
    if (!builder.Environment.IsDevelopment())
    {
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
    }
});
var app = builder.Build();
app.UseForwardedHeaders();
app.UseExceptionHandler();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    // Railway's readiness probe uses internal HTTP, without a forwarded scheme.
    app.UseWhen(context => context.Request.Path != "/api/health", branch => branch.UseHttpsRedirection());
}
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
app.MapControllers();
app.MapHub<GameHub>("/hubs/game").RequireAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();

public partial class Program;
