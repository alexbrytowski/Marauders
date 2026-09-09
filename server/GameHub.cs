using Microsoft.AspNetCore.SignalR;

namespace Marauders.Server;

public sealed class GameHub : Hub;
public sealed class GameHubNotifier(IHubContext<GameHub> hub)
{
    public Task GameUpdatedAsync(GameState state) => hub.Clients.All.SendAsync("gameUpdated", state);
}
