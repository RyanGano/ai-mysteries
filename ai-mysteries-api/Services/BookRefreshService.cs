namespace AiMysteries.Api.Services;

// Periodically asks BookStore to re-check the source's content version and reload when a seed has
// bumped it. Registered only for the Cosmos source (File content is static for the process). The
// per-tick cost is one cheap version point read; a full reload happens only on a real change, so
// the cache serves every request locally between seeds. Interval comes from
// Content:RefreshIntervalSeconds (default 60, floored at 5).
public sealed class BookRefreshService : BackgroundService
{
    private readonly BookStore _store;
    private readonly ILogger<BookRefreshService> _logger;
    private readonly TimeSpan _interval;

    public BookRefreshService(BookStore store, IConfiguration config, ILogger<BookRefreshService> logger)
    {
        _store = store;
        _logger = logger;
        var seconds = Math.Max(config.GetValue("Content:RefreshIntervalSeconds", 60), 5);
        _interval = TimeSpan.FromSeconds(seconds);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Content refresh poller started (every {Interval})", _interval);
        using var timer = new PeriodicTimer(_interval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                _store.Refresh();
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown.
        }
    }
}
