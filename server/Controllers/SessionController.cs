using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/session")]
public sealed class SessionController(GameStateStore store, IOptions<GameOptions> options) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read()
    {
        var browser = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (browser is null)
        {
            browser = Guid.NewGuid().ToString("N");
            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, browser)], CookieAuthenticationDefaults.AuthenticationScheme);
            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
        }
        return Ok(new { playerId = await store.PlayerIdAsync(browser), canReset = !string.IsNullOrEmpty(options.Value.ResetPassword) });
    }
}
