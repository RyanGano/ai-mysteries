using AiMysteries.Api.Services;
using Microsoft.Azure.Cosmos;

namespace AiMysteries.Tools;

// Write/admin helpers over the Cosmos `content` container for the seeder. Reads reuse the API's
// CosmosBookSource; this adds the upsert/delete/list the API itself never needs.
public sealed class CosmosStore
{
    private readonly Container _container;

    public CosmosStore(Container container) => _container = container;

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

    private sealed record IdOnly(string Id);
}
