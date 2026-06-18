namespace AiMysteries.Api.Services;

// Periodically persists the live per-book random-reveal counters back to the source so counting
// resumes across restarts and the counts double as a usage signal. Registered only for the Cosmos
// source (File content has no persistence). The flush only writes books whose count moved since
// the last tick, so a quiet site makes no writes. Interval comes from Stats:FlushIntervalSeconds
// (default 60, floored at 5). A final flush runs on shutdown to save the last increments.
public sealed class StatsFlushService : BackgroundService
{
    private readonly BookStore _store;
    private readonly ILogger<StatsFlushService> _logger;
    private readonly TimeSpan _interval;

    public StatsFlushService(BookStore store, IConfiguration config, ILogger<StatsFlushService> logger)
    {
        _store = store;
        _logger = logger;
        var seconds = Math.Max(config.GetValue("Stats:FlushIntervalSeconds", 60), 5);
        _interval = TimeSpan.FromSeconds(seconds);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Read-count flusher started (every {Interval})", _interval);
        using var timer = new PeriodicTimer(_interval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                _store.FlushReadCounts();
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown — fall through to a final flush so we don't drop the last increments.
        }

        _store.FlushReadCounts();
    }
}
