using System.Net;
using AiMysteries.Api.Services;
using Microsoft.Azure.Cosmos;

namespace AiMysteries.Tools;

// Write/admin helpers over the Cosmos `content` container for the seeder. Reads reuse the API's
// CosmosBookSource; this adds the upsert/delete/list the API itself never needs.
public sealed class CosmosStore
{
    private readonly Container _container;

    public CosmosStore(Container container) => _container = container;

    // Every book's id + its sync version, read from the manifest docs only — one lightweight
    // query (no per-book content fetch), so the cost stays flat as books are added. A manifest
    // with no version yet (seeded before versioning existed) maps to null. This is what the sync
    // uses to decide per-book push/pull/skip.
    public async Task<Dictionary<string, string?>> ListVersionsAsync()
    {
        var versions = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        var q = new QueryDefinition("SELECT c.bookId, c.version FROM c WHERE c.type = @t")
            .WithParameter("@t", CosmosContent.Manifest);
        using var it = _container.GetItemQueryIterator<ManifestVersion>(q);
        while (it.HasMoreResults)
            foreach (var m in await it.ReadNextAsync())
                versions[m.BookId] = m.Version;
        return versions;
    }

    // Each book's id, title, and special-ending cadence, from the manifest docs only — one
    // lightweight query. Used by `stats` to label the read-count report.
    public async Task<List<ManifestSummary>> ListManifestSummariesAsync()
    {
        var rows = new List<ManifestSummary>();
        var q = new QueryDefinition("SELECT c.bookId, c.title, c.specialEnding FROM c WHERE c.type = @t")
            .WithParameter("@t", CosmosContent.Manifest);
        using var it = _container.GetItemQueryIterator<ManifestSummary>(q);
        while (it.HasMoreResults)
            foreach (var m in await it.ReadNextAsync())
                rows.Add(m);
        return rows;
    }

    // Each book's persisted random-reveal count, from the `stats` docs only. Books with no stats
    // doc yet are absent (treated as 0 by the caller).
    public async Task<Dictionary<string, long>> ListReadCountsAsync()
    {
        var counts = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        var q = new QueryDefinition("SELECT c.bookId, c.readCount FROM c WHERE c.type = @t")
            .WithParameter("@t", CosmosContent.Stats);
        using var it = _container.GetItemQueryIterator<StatsRow>(q);
        while (it.HasMoreResults)
            foreach (var s in await it.ReadNextAsync())
                counts[s.BookId] = s.ReadCount ?? 0;
        return counts;
    }

    // All document ids currently stored for a book (single-partition).
    public async Task<List<string>> ListIdsAsync(string bookId)
    {
        var ids = new List<string>();
        var q = new QueryDefinition("SELECT c.id FROM c WHERE c.bookId = @id").WithParameter("@id", bookId);
        using var it = _container.GetItemQueryIterator<IdOnly>(
            q, requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(bookId) });
        while (it.HasMoreResults)
            foreach (var d in await it.ReadNextAsync())
                ids.Add(d.Id);
        return ids;
    }

    public Task UpsertAsync(ContentDoc doc) =>
        _container.UpsertItemAsync(doc, new PartitionKey(doc.BookId));

    public Task DeleteAsync(string bookId, string id) =>
        _container.DeleteItemAsync<ContentDoc>(id, new PartitionKey(bookId));

    // Increment the global content version so the running API reloads on its next poll. Called by
    // seed only after a real change. Read-then-write is fine here — the seeder is single-runner.
    public async Task<long> BumpVersionAsync()
    {
        long current = 0;
        try
        {
            var resp = await _container.ReadItemAsync<VersionDoc>(
                CosmosContent.VersionId, new PartitionKey(CosmosContent.SystemPartition));
            current = resp.Resource.Value;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            // First seed — start the counter at 0 and bump to 1 below.
        }

        var next = current + 1;
        await _container.UpsertItemAsync(
            new VersionDoc { Value = next }, new PartitionKey(CosmosContent.SystemPartition));
        return next;
    }

    private sealed record IdOnly(string Id);

    private sealed record ManifestVersion(string BookId, string? Version);

    private sealed record StatsRow(string BookId, long? ReadCount);

    public sealed record ManifestSummary(string BookId, string? Title, int? SpecialEnding);
}
