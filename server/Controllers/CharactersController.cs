using Microsoft.AspNetCore.Mvc;

namespace Marauders.Server.Controllers;

[ApiController]
[Route("api/characters")]
public sealed class CharactersController(CharacterCatalog catalog) : ControllerBase
{
    [HttpGet]
    public IActionResult Read() => Ok(catalog.Profiles);
}
