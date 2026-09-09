using Microsoft.AspNetCore.Mvc;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/maps")]
public sealed class MapsController : ControllerBase
{
    [HttpGet]
    public IActionResult Read() => Ok(MapCatalog.All);
}
