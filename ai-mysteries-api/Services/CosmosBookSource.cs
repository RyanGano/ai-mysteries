using System.Net;
using Microsoft.Azure.Cosmos;

namespace AiMysteries.Api.Services;

// Reads book content from the Cosmos `content` container. Each book is one logical partition
// (/bookId), so a book loads in a single-partition query. Used in prod (ContentSource=Cosmos).
public sealed class CosmosBookSource : IBookSource, IReadCountStore
{
    private readonly Container _container;

    public CosmosBookSource(Container container) => _container = container;

    // --- IReadCountStore: the one mutable, API-owned piece of book state (random-reveal counter).

    // All stored counts in one cross-partition query over the `stats` docs (one tiny doc per book).
    public IReadOnlyDictionary<string, long> LoadReadCounts()
    {
        var counts = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        var q = new QueryDefinition("SELECT c.bookId, c.readCount FROM c WHERE c.type = @t")
            .WithParameter("@t", CosmosContent.Stats);
        using var it = _container.GetItemQueryIterator<StatsRef>(q);
        while (it.HasMoreResults)
            foreach (var s in it.ReadNextAsync().GetAwaiter().GetResult())
                counts[s.BookId] = s.ReadCount ?? 0;
        return counts;
    }

    // Upsert one book's count into its own partition's `stats` doc. Deterministic id, so it
    // upserts in place. Never bumps the global content version, so the API's own writes don't
    // trigger a reload.
    public Task SaveReadCountAsync(string bookId, long count) =>
        _container.UpsertItemAsync(
            new ContentDoc { Id = CosmosContent.StatsId, BookId = bookId, Type = CosmosContent.Stats, ReadCount = count },
            new PartitionKey(bookId));

    // BookStore builds once at startup, so blocking here is acceptable and keeps IBookSource sync.
    public IEnumerable<RawBook> LoadAll() => LoadAllAsync().GetAwaiter().GetResult();

    // Load a single book's full content (one single-partition query). Used by the Tools sync to
    // pull only the book(s) that actually drifted, instead of LoadAll's whole-DB fetch.
    public RawBook LoadOne(string bookId) => LoadBookAsync(bookId).GetAwaiter().GetResult();

    // One point read of the version doc — the cheapest Cosmos op. Returns "0" before the first
    // seed has written the doc, so a freshly-loaded store reloads as soon as it appears.
    public string GetVersion()
    {
        try
        {
            var resp = _container.ReadItemAsync<VersionDoc>(
                CosmosContent.VersionId, new PartitionKey(CosmosContent.SystemPartition))
                .GetAwaiter().GetResult();
            return resp.Resource.Value.ToString();
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return "0";
        }
    }

    private async Task<List<RawBook>> LoadAllAsync()
    {
        var bookIds = new List<string>();
        var manifests = new QueryDefinition("SELECT c.bookId FROM c WHERE c.type = @t")
            .WithParameter("@t", CosmosContent.Manifest);
        using (var it = _container.GetItemQueryIterator<ManifestRef>(manifests))
        {
            while (it.HasMoreResults)
                foreach (var m in await it.ReadNextAsync())
                    bookIds.Add(m.BookId);
        }

        var books = new List<RawBook>();
        foreach (var id in bookIds)
            books.Add(await LoadBookAsync(id));
        return books;
    }

    private async Task<RawBook> LoadBookAsync(string bookId)
    {
        var docs = new List<ContentDoc>();
        var query = new QueryDefinition("SELECT * FROM c WHERE c.bookId = @id").WithParameter("@id", bookId);
        using var it = _container.GetItemQueryIterator<ContentDoc>(
            query,
            requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(bookId) });
        while (it.HasMoreResults)
            docs.AddRange(await it.ReadNextAsync());

        return CosmosContent.FromDocuments(bookId, docs);
    }

    private sealed record ManifestRef(string BookId);

    private sealed record StatsRef(string BookId, long? ReadCount);
}
