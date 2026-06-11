using System.Text.Json;
using AiMysteries.Api.Services;

namespace AiMysteries.Tools;

// Compares the local-file books against the Cosmos books and reports any drift. Order- and
// formatting-independent: each book is flattened into a map of logical-key -> canonical JSON,
// then the two maps are compared key by key, including the book-level metadata (meta.json /
// manifest). Returns true when everything is in sync.
public static class Differ
{
    private static readonly JsonSerializerOptions Canon = new(JsonSerializerDefaults.Web);

    public static bool Compare(IReadOnlyList<RawBook> file, IReadOnlyList<RawBook> cosmos)
    {
        var fileById = file.ToDictionary(b => b.Id, StringComparer.OrdinalIgnoreCase);
        var cosmosById = cosmos.ToDictionary(b => b.Id, StringComparer.OrdinalIgnoreCase);

        var allIds = fileById.Keys.Union(cosmosById.Keys, StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.Ordinal);

        var inSync = true;
        foreach (var id in allIds)
        {
            if (!cosmosById.ContainsKey(id)) { Console.WriteLine($"  - book \"{id}\": in local files, MISSING from Cosmos"); inSync = false; continue; }
            if (!fileById.ContainsKey(id)) { Console.WriteLine($"  - book \"{id}\": in Cosmos, MISSING from local files"); inSync = false; continue; }
            inSync &= CompareBook(id, fileById[id], cosmosById[id]);
        }

        return inSync;
    }

    private static bool CompareBook(string id, RawBook file, RawBook cosmos)
    {
        var f = Index(file);
        var c = Index(cosmos);
        var keys = f.Keys.Union(c.Keys, StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal);

        var diffs = new List<string>();
        foreach (var key in keys)
        {
            var hasF = f.TryGetValue(key, out var fv);
            var hasC = c.TryGetValue(key, out var cv);
            if (hasF && !hasC) diffs.Add($"      {key}: only in local files");
            else if (!hasF && hasC) diffs.Add($"      {key}: only in Cosmos");
            else if (fv != cv) diffs.Add($"      {key}: differs");
        }

        if (diffs.Count == 0)
        {
            Console.WriteLine($"  - book \"{id}\": in sync ({f.Count} items)");
            return true;
        }

        Console.WriteLine($"  - book \"{id}\": {diffs.Count} difference(s):");
        foreach (var d in diffs) Console.WriteLine(d);
        return false;
    }

    // Flatten a book into logical-key -> canonical JSON, including the book-level metadata.
    private static Dictionary<string, string> Index(RawBook b)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        map["manifest:meta"] = JsonSerializer.Serialize(b.Meta, Canon);
        // Weights are key-ordered so File vs Cosmos dictionary ordering can't cause false drift.
        map["manifest:selection"] = JsonSerializer.Serialize(new
        {
            b.Selection.SentinelCulprit,
            CategoryWeights = b.Selection.CategoryWeights
                .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                .ToDictionary(kv => kv.Key, kv => kv.Value),
            b.Selection.SpecialEndingOdds,
        }, Canon);
        foreach (var ch in b.Chapters)
            map[$"chapter:{ch.Slug}"] = JsonSerializer.Serialize(new { ch.Slug, ch.Title, ch.Body }, Canon);
        foreach (var e in b.Endings)
            map[$"ending:{e.Slug}"] = JsonSerializer.Serialize(new { e.Code, e.Culprits, e.Title, e.Special, e.Slug, e.Body }, Canon);
        foreach (var (cid, clue) in b.Clues)
            map[$"clue:{cid}"] = JsonSerializer.Serialize(clue, Canon);
        foreach (var (code, x) in b.Xref)
            map[$"xref:{code}"] = JsonSerializer.Serialize(new { x.Slug, x.Markers }, Canon);
        return map;
    }
}
