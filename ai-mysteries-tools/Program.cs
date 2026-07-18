using AiMysteries.Api.Services;
using AiMysteries.Tools;
using Azure.Identity;
using Microsoft.Azure.Cosmos;

// Local content pipeline for the book API's Cosmos database. Never deployed — run it after
// `az login` (DefaultAzureCredential authenticates as you; you need the Cosmos "Data
// Contributor" role for the write paths: sync / seed / pull).
//
// Reconciliation is version-based. Every book carries a `version` (a UTC timestamp marking when
// its content last changed); the seeder stamps a fresh version whenever a book's content
// fingerprint no longer matches the one recorded in its meta.json. To decide what to update, the
// tool reads just the per-book versions from Cosmos (one lightweight manifest-only query) instead
// of loading every book's content, so the cost stays flat as books are added.
//
//   dotnet run --project ai-mysteries-tools -- sync      [options]   reconcile both ways by version
//   dotnet run --project ai-mysteries-tools -- seed      [options]   push newer local books -> Cosmos
//   dotnet run --project ai-mysteries-tools -- pull      [options]   pull newer Cosmos books -> local
//   dotnet run --project ai-mysteries-tools -- diff      [options]   compare versions, exit 1 on drift
//   dotnet run --project ai-mysteries-tools -- full-diff [options]   deep content compare, exit 1 on drift
//   dotnet run --project ai-mysteries-tools -- stats     [options]   report per-book random-reveal counts
//
// Options (fall back to env vars, then defaults):
//   --endpoint  <uri>   Cosmos account URI         (env COSMOS_ENDPOINT)            required
//   --database  <name>  database name              (env COSMOS_DATABASE)            default books
//   --container <name>  container name             (env COSMOS_CONTAINER)           default content
//   --content   <path>  Content root on disk       (env CONTENT_ROOT)               default ai-mysteries-api/Content
//   --force             (pull only) overwrite every local book regardless of version

var verb = args.FirstOrDefault()?.ToLowerInvariant().Replace('_', '-');
if (verb is not ("sync" or "seed" or "pull" or "diff" or "full-diff" or "stats"))
{
    Console.Error.WriteLine("Usage: sync | seed | pull | diff | full-diff | stats   [--endpoint <uri>] [--database <name>] [--container <name>] [--content <path>] [--force]");
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
        "sync" => await Sync(contentRoot, cosmosContainer),
        "seed" => await Seed(contentRoot, cosmosContainer),
        "pull" => await Pull(contentRoot, cosmosContainer, opts.ContainsKey("force")),
        "diff" => await Diff(contentRoot, cosmosContainer),
        "full-diff" => await FullDiff(contentRoot, cosmosContainer),
        "stats" => await Stats(cosmosContainer),
        _ => 2,
    };
}
catch (CosmosException ex)
{
    Console.Error.WriteLine($"Cosmos error ({(int)ex.StatusCode} {ex.StatusCode}): {ex.Message}");
    return 1;
}

// sync: version-based reconciliation in both directions. For each book, compare the local version
// (freshly stamped if the content changed) against the Cosmos version: local newer -> push,
// Cosmos newer -> pull, equal -> skip. Bumps the global content version once if anything was
// pushed, so the running API reloads on its next poll.
static async Task<int> Sync(string contentRoot, Container container)
{
    var store = new CosmosStore(container);
    var source = new CosmosBookSource(container);

    var local = LoadAndStampLocal(contentRoot);
    var localById = local.ToDictionary(b => b.Id, StringComparer.OrdinalIgnoreCase);
    var cosmosVersions = await store.ListVersionsAsync();

    var ids = localById.Keys.Union(cosmosVersions.Keys, StringComparer.OrdinalIgnoreCase)
        .OrderBy(x => x, StringComparer.Ordinal);

    Console.WriteLine("Reconciling by version (local vs Cosmos):");
    int pushed = 0, pulled = 0, unchanged = 0;
    foreach (var id in ids)
    {
        var hasLocal = localById.TryGetValue(id, out var lb);
        var hasCosmos = cosmosVersions.TryGetValue(id, out var cv);

        if (hasLocal && !hasCosmos) { await Push(store, lb!); Console.WriteLine($"  \"{id}\": new -> pushed to Cosmos"); pushed++; continue; }
        if (!hasLocal && hasCosmos) { PullOne(contentRoot, source, id); Console.WriteLine($"  \"{id}\": Cosmos only -> pulled to disk"); pulled++; continue; }

        var cmp = LocalVersions.Compare(lb!.Version, cv);
        if (cmp > 0) { await Push(store, lb!); Console.WriteLine($"  \"{id}\": local newer -> pushed to Cosmos"); pushed++; }
        else if (cmp < 0) { PullOne(contentRoot, source, id); Console.WriteLine($"  \"{id}\": Cosmos newer -> pulled to disk"); pulled++; }
        else { Console.WriteLine($"  \"{id}\": in sync (v{cv})"); unchanged++; }
    }

    if (pushed > 0)
    {
        var v = await store.BumpVersionAsync();
        Console.WriteLine($"Content version is now {v} (API will reload on its next poll).");
    }
    Console.WriteLine($"Sync complete. {pushed} pushed, {pulled} pulled, {unchanged} unchanged.");
    return 0;
}

// seed: push only. Push every local book whose version is newer than Cosmos's (or missing there);
// never pulls. The documented go-live path. Warns if Cosmos is ahead of local for a book (use
// `pull`/`sync` to reconcile).
static async Task<int> Seed(string contentRoot, Container container)
{
    var store = new CosmosStore(container);
    var local = LoadAndStampLocal(contentRoot);
    var cosmosVersions = await store.ListVersionsAsync();

    Console.WriteLine($"Seeding from {contentRoot}:");
    int pushed = 0, skipped = 0;
    foreach (var book in local)
    {
        var hasCosmos = cosmosVersions.TryGetValue(book.Id, out var cv);
        var cmp = LocalVersions.Compare(book.Version, cv);
        if (!hasCosmos || cmp > 0)
        {
            await Push(store, book);
            Console.WriteLine($"  \"{book.Id}\": pushed (v{book.Version})");
            pushed++;
        }
        else if (cmp < 0)
        {
            Console.WriteLine($"  \"{book.Id}\": SKIPPED — Cosmos is newer (v{cv}); run pull/sync to reconcile");
            skipped++;
        }
        else { Console.WriteLine($"  \"{book.Id}\": up to date (v{cv})"); skipped++; }
    }

    if (pushed > 0)
    {
        var v = await store.BumpVersionAsync();
        Console.WriteLine($"Content version is now {v} (API will reload on its next poll).");
    }
    Console.WriteLine($"Seed complete. {pushed} pushed, {skipped} unchanged.");
    return 0;
}

// pull: Cosmos -> local files. By default only books whose Cosmos version is newer than the local
// copy (so local edits in progress aren't clobbered); --force overwrites every local book.
static async Task<int> Pull(string contentRoot, Container container, bool force)
{
    var store = new CosmosStore(container);
    var source = new CosmosBookSource(container);
    var localVersions = ReadLocalVersions(contentRoot);
    var cosmosVersions = await store.ListVersionsAsync();

    Console.WriteLine($"Pulling into {contentRoot}:");
    int pulled = 0, skipped = 0;
    foreach (var (id, cv) in cosmosVersions.OrderBy(k => k.Key, StringComparer.Ordinal))
    {
        var hasLocal = localVersions.TryGetValue(id, out var lv);
        if (force || !hasLocal || LocalVersions.Compare(cv, lv) > 0)
        {
            PullOne(contentRoot, source, id);
            Console.WriteLine($"  \"{id}\": pulled (v{cv})");
            pulled++;
        }
        else { Console.WriteLine($"  \"{id}\": local up to date"); skipped++; }
    }
    Console.WriteLine($"Pull complete. {pulled} pulled, {skipped} unchanged.");
    return 0;
}

// diff: cheap version comparison (one manifest-only query, no content fetch). Reports the action
// each out-of-sync book needs and exits 1 on any drift — the default pre-deploy check.
static async Task<int> Diff(string contentRoot, Container container)
{
    var store = new CosmosStore(container);
    var cosmosVersions = await store.ListVersionsAsync();
    var localById = new FileBookSource(contentRoot).LoadAll()
        .ToDictionary(b => b.Id, LocalVersions.Resolve, StringComparer.OrdinalIgnoreCase);

    var ids = localById.Keys.Union(cosmosVersions.Keys, StringComparer.OrdinalIgnoreCase)
        .OrderBy(x => x, StringComparer.Ordinal);

    Console.WriteLine("Comparing versions (local vs Cosmos):");
    var drift = false;
    foreach (var id in ids)
    {
        var hasLocal = localById.TryGetValue(id, out var lr);
        var hasCosmos = cosmosVersions.TryGetValue(id, out var cv);

        if (hasLocal && !hasCosmos) { Console.WriteLine($"  - \"{id}\": local only -> needs push"); drift = true; continue; }
        if (!hasLocal && hasCosmos) { Console.WriteLine($"  - \"{id}\": Cosmos only -> needs pull"); drift = true; continue; }

        var cmp = LocalVersions.Compare(lr.Version, cv);
        var pending = lr.Modified ? " [local modified since last stamp]" : "";
        if (cmp > 0) { Console.WriteLine($"  - \"{id}\": local newer -> needs push{pending}"); drift = true; }
        else if (cmp < 0) { Console.WriteLine($"  - \"{id}\": Cosmos newer -> needs pull"); drift = true; }
        else Console.WriteLine($"  - \"{id}\": in sync (v{cv})");
    }

    Console.WriteLine(drift ? "OUT OF SYNC." : "In sync.");
    return drift ? 1 : 0;
}

// full-diff: deep, field-by-field content comparison (loads every book from both sides). Slower
// and chattier than `diff`, but catches a version that was never bumped or a Cosmos doc edited out
// of band. Exit 1 on any content drift.
static async Task<int> FullDiff(string contentRoot, Container container)
{
    var fileBooks = new FileBookSource(contentRoot).LoadAll().ToList();
    var cosmosBooks = new CosmosBookSource(container).LoadAll().ToList();
    Console.WriteLine("Comparing full content (local vs Cosmos):");
    var inSync = Differ.Compare(fileBooks, cosmosBooks);
    Console.WriteLine(inSync ? "In sync." : "DRIFT DETECTED.");
    await Task.CompletedTask;
    return inSync ? 0 : 1;
}

// stats: read-only usage report. Prints each book's special-ending cadence and how many random
// reveals it has served (the API's live ReadCount, persisted to Cosmos). Answers "is anyone using
// the site, and which stories do they prefer?" without touching content.
static async Task<int> Stats(Container container)
{
    var store = new CosmosStore(container);
    var manifests = await store.ListManifestSummariesAsync();
    var counts = await store.ListReadCountsAsync();

    var rows = manifests
        .Select(m => (Title: m.Title ?? m.BookId, m.SpecialEnding, Reads: counts.GetValueOrDefault(m.BookId)))
        .OrderByDescending(r => r.Reads)
        .ThenBy(r => r.Title, StringComparer.Ordinal)
        .ToList();

    var titleWidth = Math.Max(10, rows.Count == 0 ? 0 : rows.Max(r => r.Title.Length));
    Console.WriteLine($"| {"Book Title".PadRight(titleWidth)} | SpecialEnding | Random reveals |");
    Console.WriteLine($"|-{new string('-', titleWidth)}-|---------------|----------------|");
    foreach (var r in rows)
    {
        var cadence = r.SpecialEnding is > 0 ? $"every {r.SpecialEnding}" : "code only";
        Console.WriteLine($"| {r.Title.PadRight(titleWidth)} | {cadence,-13} | {r.Reads,14} |");
    }
    Console.WriteLine($"Total random reveals across {rows.Count} book(s): {rows.Sum(r => r.Reads)}.");
    return 0;
}

// Load every local book, validate it (dup-code / weight checks via BookStore.Build), and resolve
// its version: if the content fingerprint no longer matches the one recorded in meta.json, stamp a
// fresh UTC timestamp + fingerprint to disk before returning. The returned RawBooks carry the
// resolved version so the caller can compare and push without re-reading.
static List<RawBook> LoadAndStampLocal(string contentRoot)
{
    var books = new FileBookSource(contentRoot).LoadAll().ToList();
    foreach (var raw in books)
        BookStore.Build(raw); // throws on duplicate normalized code, missing data, etc.

    var stamped = new List<RawBook>(books.Count);
    foreach (var raw in books)
    {
        var r = LocalVersions.Resolve(raw);
        if (r.Modified)
        {
            LocalVersions.Stamp(contentRoot, raw.Id, r.Version, r.Hash);
            Console.WriteLine($"  stamped \"{raw.Id}\" -> version {r.Version} (content changed)");
        }
        stamped.Add(raw with { Version = r.Version, ContentHash = r.Hash });
    }
    return stamped;
}

// Push one book's documents to Cosmos: upsert every current doc (the manifest carries the version)
// and delete any stale doc that no longer exists locally.
static async Task Push(CosmosStore store, RawBook book)
{
    var docs = CosmosContent.ToDocuments(book).ToList();
    var newIds = docs.Select(d => d.Id).ToHashSet(StringComparer.Ordinal);
    var existingIds = await store.ListIdsAsync(book.Id);

    foreach (var doc in docs)
        await store.UpsertAsync(doc);

    // Delete stale docs that no longer exist locally — but never the API-owned runtime docs (the
    // `stats` read counter and the `ratings` totals), which ToDocuments deliberately doesn't emit.
    // Removing them would reset the count / ratings on every seed.
    foreach (var id in existingIds.Where(id =>
        !newIds.Contains(id) && id != CosmosContent.StatsId && id != CosmosContent.RatingsId))
        await store.DeleteAsync(book.Id, id);
}

// Pull one book from Cosmos to disk, recording its content fingerprint (and a version if the
// Cosmos copy never had one) so the next sync sees the local copy as in sync.
static void PullOne(string contentRoot, CosmosBookSource source, string bookId)
{
    var book = source.LoadOne(bookId);
    book = book with
    {
        Version = string.IsNullOrEmpty(book.Version) ? DateTime.UtcNow.ToString(LocalVersions.Format) : book.Version,
        ContentHash = Differ.Fingerprint(book),
    };
    ContentFiles.Write(contentRoot, book);
}

// Best-effort local versions for `pull` (which may run with no/partial local content): resolved
// effective version per book, empty when the content root is absent.
static Dictionary<string, string> ReadLocalVersions(string contentRoot)
{
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    if (!Directory.Exists(contentRoot))
        return map;
    foreach (var raw in new FileBookSource(contentRoot).LoadAll())
        map[raw.Id] = LocalVersions.Resolve(raw).Version;
    return map;
}

// Minimal "--key value" / "--flag" parser. A "--key" followed by a non-"--" token captures that
// value; otherwise it's a boolean flag (value "").
static Dictionary<string, string> ParseOptions(IEnumerable<string> args)
{
    var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    var list = args.ToList();
    for (var i = 0; i < list.Count; i++)
    {
        if (!list[i].StartsWith("--")) continue;
        var key = list[i][2..];
        if (i + 1 < list.Count && !list[i + 1].StartsWith("--")) { map[key] = list[i + 1]; i++; }
        else map[key] = "";
    }
    return map;
}
