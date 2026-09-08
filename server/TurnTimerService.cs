using Microsoft.AspNetCore.SignalR;

namespace Marauders.Server;

public sealed class TurnTimerService(GameStateStore store, IHubContext<GameHub> hub) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var state = await store.ExpireTurnAsync();
            if (state is not null) await hub.Clients.All.SendAsync("gameUpdated", state, stoppingToken);
        }
    }
}
