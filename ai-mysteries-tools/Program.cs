using AiMysteries.Api.Services;
using AiMysteries.Tools;
using Azure.Identity;
using Microsoft.Azure.Cosmos;

// Local content pipeline for the book API's Cosmos database. Never deployed — run it after
// `az login` (DefaultAzureCredential authenticates as you; you need the Cosmos "Data
// Contributor" role for seed/pull-write paths).
//
//   dotnet run --project ai-mysteries-tools -- seed   [options]   local files -> Cosmos
//   dotnet run --project ai-mysteries-tools -- pull   [options]   Cosmos -> local files
//   dotnet run --project ai-mysteries-tools -- diff   [options]   compare, exit 1 on drift
//
// Options (fall back to env vars, then defaults):
//   --endpoint  <uri>   Cosmos account URI         (env COSMOS_ENDPOINT)            required
//   --database  <name>  database name              (env COSMOS_DATABASE)            default books
//   --container <name>  container name             (env COSMOS_CONTAINER)           default content
//   --content   <path>  Content root on disk       (env CONTENT_ROOT)               default ai-mysteries-api/Content

var verb = args.FirstOrDefault()?.ToLowerInvariant();
if (verb is not ("seed" or "pull" or "diff"))
{
    Console.Error.WriteLine("Usage: seed | pull | diff   [--endpoint <uri>] [--database <name>] [--container <name>] [--content <path>]");
    return 2;
}

var opts = ParseOptions(args.Skip(1));
var contentRoot = Path.GetFullPath(opts.GetValueOrDefault("content")
    ?? Environment.GetEnvironmentVariable("CONTENT_ROOT")
    ?? Path.Combine("ai-mysteries-api", "Content"));
var database = opts.GetValueOrDefault("database") ?? Environment.GetEnvironmentVariable("COSMOS_DATABASE") ?? "books";
var container = opts.GetValueOrDefault("container") ?? Environment.GetEnvironmentVariable("COSMOS_CONTAINER") ?? "content";
var endpoint = opts.GetValueOrDefault("endpoint") ?? Environment.GetEnvironmentVariable("COSMOS_ENDPOINT");

if (string.IsNullOrWhiteSpace(endpoint))
{
    Console.Error.WriteLine("Cosmos endpoint required: pass --endpoint <uri> or set COSMOS_ENDPOINT.");
    return 2;
}

using var client = new CosmosClient(endpoint, new DefaultAzureCredential(), CosmosSetup.ClientOptions());
var cosmosContainer = client.GetContainer(database, container);

try
{
    return verb switch
    {
        "seed" => await Seed(contentRoot, cosmosContainer),
        "pull" => await Pull(contentRoot, cosmosContainer),
        "diff" => await Diff(contentRoot, cosmosContainer),
        _ => 2,
    };
}
catch (CosmosException ex)
{
    Console.Error.WriteLine($"Cosmos error ({(int)ex.StatusCode} {ex.StatusCode}): {ex.Message}");
    return 1;
}

// seed: local files -> Cosmos. Validates each book (dup-code check via BookStore.Build) before
// writing, upserts all docs, then deletes any Cosmos docs no longer present locally so the
// partition exactly mirrors the files.
static async Task<int> Seed(string contentRoot, Container container)
{
    var store = new CosmosStore(container);
    var books = new FileBookSource(contentRoot).LoadAll().ToList();
    Console.WriteLine($"Seeding {books.Count} book(s) from {contentRoot}");

    foreach (var raw in books)
    {
        BookStore.Build(raw); // throws on duplicate normalized code, missing data, etc.

        var docs = CosmosContent.ToDocuments(raw).ToList();
        var newIds = docs.Select(d => d.Id).ToHashSet(StringComparer.Ordinal);
        var existingIds = await store.ListIdsAsync(raw.Id);

        foreach (var doc in docs)
            await store.UpsertAsync(doc);

        var stale = existingIds.Where(id => !newIds.Contains(id)).ToList();
        foreach (var id in stale)
            await store.DeleteAsync(raw.Id, id);

        Console.WriteLine($"  \"{raw.Id}\": upserted {docs.Count} doc(s)" + (stale.Count > 0 ? $", deleted {stale.Count} stale" : ""));
    }

    Console.WriteLine("Seed complete.");
    return 0;
}

// pull: Cosmos -> local files. Overwrites the on-disk content for every book in the DB.
static async Task<int> Pull(string contentRoot, Container container)
{
    var books = new CosmosBookSource(container).LoadAll().ToList();
    Console.WriteLine($"Pulling {books.Count} book(s) into {contentRoot}");
    foreach (var raw in books)
    {
        ContentFiles.Write(contentRoot, raw);
        Console.WriteLine($"  \"{raw.Id}\": wrote {raw.Chapters.Count} chapter(s), {raw.Endings.Count} ending(s)");
    }
    Console.WriteLine("Pull complete.");
    await Task.CompletedTask;
    return 0;
}

// diff: compare local files vs Cosmos. Exit 1 on any drift.
static async Task<int> Diff(string contentRoot, Container container)
{
    var fileBooks = new FileBookSource(contentRoot).LoadAll().ToList();
    var cosmosBooks = new CosmosBookSource(container).LoadAll().ToList();
    Console.WriteLine("Comparing local files vs Cosmos:");
    var inSync = Differ.Compare(fileBooks, cosmosBooks);
    Console.WriteLine(inSync ? "In sync." : "DRIFT DETECTED.");
    await Task.CompletedTask;
    return inSync ? 0 : 1;
}

// Minimal "--key value" parser.
static Dictionary<string, string> ParseOptions(IEnumerable<string> args)
{
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    string? key = null;
    foreach (var a in args)
    {
        if (a.StartsWith("--")) key = a[2..];
        else if (key is not null) { map[key] = a; key = null; }
    }
    return map;
}
