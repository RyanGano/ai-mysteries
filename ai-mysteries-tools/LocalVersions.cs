using System.Text.Json;
using System.Text.Json.Nodes;
using AiMysteries.Api.Services;

namespace AiMysteries.Tools;

// Resolves and persists a book's local sync version in meta.json. The version is a UTC timestamp
// recording when the book's content last changed; it is paired with a content fingerprint
// (contentHash) so a modification is detected automatically — when the current fingerprint no
// longer matches the recorded one, the book counts as modified and gets a fresh timestamp. This
// is the "when a book is modified, bump the version" rule, done entirely from local files (no
// Cosmos call), so the version is trustworthy before the sync ever talks to the database.
public static class LocalVersions
{
    // ISO-8601 UTC, second precision — lexically and chronologically sortable.
    public const string Format = "yyyy-MM-ddTHH:mm:ssZ";

    // The effective version of a local book: its recorded version if the content still matches the
    // recorded fingerprint, otherwise a fresh "now" stamp. `Modified` is true when the book has
    // changed since it was last stamped (or was never stamped).
    public readonly record struct Resolved(string Version, string Hash, bool Modified);

    public static Resolved Resolve(RawBook book)
    {
        var hash = Differ.Fingerprint(book);
        if (!string.IsNullOrEmpty(book.Version) && book.ContentHash == hash)
            return new Resolved(book.Version!, hash, Modified: false);
        return new Resolved(DateTime.UtcNow.ToString(Format), hash, Modified: true);
    }

    // Write `version` + `contentHash` into the book's meta.json in place, leaving every other field
    // (and the author's formatting of those fields) untouched. Creates the file if absent.
    public static void Stamp(string contentRoot, string bookId, string version, string hash)
    {
        var path = Path.Combine(contentRoot, bookId, "meta.json");
        var obj = File.Exists(path)
            ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject ?? new JsonObject()
            : new JsonObject();
        obj["version"] = version;
        obj["contentHash"] = hash;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    // Order two version timestamps: <0 if a is older than b, 0 if equal, >0 if a is newer. Parses
    // them as instants; an unparseable/absent value sorts oldest so a real timestamp always wins.
    public static int Compare(string? a, string? b)
    {
        var pa = Parse(a);
        var pb = Parse(b);
        return pa.CompareTo(pb);
    }

    private static DateTimeOffset Parse(string? v) =>
        DateTimeOffset.TryParse(
            v, null, System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
            out var dt)
            ? dt
            : DateTimeOffset.MinValue;
}
