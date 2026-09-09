using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/game")]
public sealed class GameController(GameStateStore store, GameHubNotifier notifier) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read() => Ok(await store.ReadAsync());

    [HttpPost("players"), Authorize, EnableRateLimiting("mutations")]
    public async Task<IActionResult> Join(JoinRequest request) => await Publish(await store.JoinAsync(Browser, request));

    [HttpPost("action"), Authorize, EnableRateLimiting("mutations")]
    public async Task<IActionResult> Act(GameCommand request) => await Publish(await store.ActAsync(Browser, request));

    [HttpPost("reset"), Authorize, EnableRateLimiting("reset"), RequestSizeLimit(4096)]
    public async Task<IActionResult> Reset(ResetRequest request) => await Publish(await store.ResetAsync(request));

    private string Browser => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private async Task<IActionResult> Publish(MutationResult result)
    {
        if (!result.Success) return StatusCode(result.StatusCode, new { error = result.Error });
        await notifier.GameUpdatedAsync(result.State!);
        return Ok(result.State);
    }
}
