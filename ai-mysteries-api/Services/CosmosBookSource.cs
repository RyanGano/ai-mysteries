using System.Net;
using Microsoft.Azure.Cosmos;

namespace AiMysteries.Api.Services;

// Reads book content from the Cosmos `content` container. Each book is one logical partition
// (/bookId), so a book loads in a single-partition query. Used in prod (ContentSource=Cosmos).
public sealed class CosmosBookSource : IBookSource
{
    private readonly Container _container;

    public CosmosBookSource(Container container) => _container = container;

    // BookStore builds once at startup, so blocking here is acceptable and keeps IBookSource sync.
    public IEnumerable<RawBook> LoadAll() => LoadAllAsync().GetAwaiter().GetResult();

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
}
