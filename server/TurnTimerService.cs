using Microsoft.AspNetCore.SignalR;

namespace Marauders.Server;

public sealed class TurnTimerService(GameStateStore store, IHubContext<GameHub> hub, ILogger<TurnTimerService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    var state = await store.ExpireTurnAsync();
                    if (state is not null) await hub.Clients.All.SendAsync("gameUpdated", state, stoppingToken);
                }
                catch (IOException error) { logger.LogError(error, "Could not persist turn timeout; it will be retried."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
