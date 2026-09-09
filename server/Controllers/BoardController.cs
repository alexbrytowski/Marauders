using Microsoft.AspNetCore.Mvc;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/board")]
public sealed class BoardController(GameStateStore store) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read([FromQuery] string? mapId = null)
    {
        var map = MapCatalog.Find(mapId ?? (await store.ReadAsync()).MapId);
        return map is null ? NotFound(new { error = "That map is unavailable." })
            : Ok(new { id = map.Id, name = map.Name, version = map.Version, cells = map.Board.Cells });
    }
}
