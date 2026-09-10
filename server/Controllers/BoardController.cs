using Microsoft.AspNetCore.Mvc;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/board")]
public sealed class BoardController(GameStateStore store) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Read([FromQuery] string? mapId = null, [FromQuery] string? version = null)
    {
        var game = await store.ReadAsync();
        var map = MapCatalog.Find(mapId ?? game.MapId);
        if (map is null) return NotFound(new { error = "That map is unavailable." });
        try
        {
            var board = MapCatalog.Resolve(map.Id, version ?? (mapId is null ? game.BoardVersion : map.Version));
            return Ok(new { id = map.Id, name = MapCatalog.Name(map.Id, board.Version), version = board.Version, cells = board.Cells });
        }
        catch (RuleException error) { return NotFound(new { error = error.Message }); }
    }
}
