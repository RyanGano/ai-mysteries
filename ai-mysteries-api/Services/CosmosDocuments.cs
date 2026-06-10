using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// One document in the Cosmos `content` container (partition key /bookId). A single shape
// discriminated by `Type`; only the fields relevant to that type are populated. Property names
// serialize to camelCase (the CosmosClient is configured with a web-defaults serializer), so
// `Id` -> "id" (Cosmos's required key) and `BookId` -> "bookId" (the partition key path).
public sealed class ContentDoc
{
    public string Id { get; set; } = "";
    public string BookId { get; set; } = "";
    public string Type { get; set; } = "";

    // manifest / chapter / ending share `Title` (book title / chapter title / ending title —
    // never coexist in one doc). manifest also carries reading order.
    public string? Title { get; set; }
    public List<string>? ChapterOrder { get; set; }

    // chapter / ending / xref
    public string? Slug { get; set; }
    public string? Body { get; set; }

    // ending / xref
    public string? Code { get; set; }

    // ending
    public List<string>? Culprits { get; set; }
    public bool Special { get; set; }

    // clue
    public string? ClueKey { get; set; }
    public string? ChapterSlug { get; set; }
    public string? ChapterTitle { get; set; }
    public List<string>? Passages { get; set; }
    public List<string>? Fragments { get; set; }

    // xref
    public List<XrefMarkerDto>? Markers { get; set; }
}

// Maps RawBook <-> Cosmos documents. Shared by CosmosBookSource (read) and the Tools seeder
// (write) so there is exactly one storage contract.
public static class CosmosContent
{
    public const string Manifest = "manifest";
    public const string Chapter = "chapter";
    public const string Ending = "ending";
    public const string Clue = "clue";
    public const string Xref = "xref";

    // Deterministic ids so re-seeding upserts in place rather than duplicating.
    public static string ChapterId(string slug) => $"chapter:{slug}";
    public static string EndingId(string slug) => $"ending:{slug}";
    public static string ClueId(string clueId) => $"clue:{clueId}";
    public static string XrefId(string code) => $"xref:{code}";

    // Decompose a RawBook into its Cosmos documents.
    public static IEnumerable<ContentDoc> ToDocuments(RawBook raw)
    {
        yield return new ContentDoc
        {
            Id = Manifest,
            BookId = raw.Id,
            Type = Manifest,
            Title = raw.Title ?? raw.Id,
            ChapterOrder = raw.Chapters.Select(c => c.Slug).ToList(),
        };

        foreach (var c in raw.Chapters)
            yield return new ContentDoc
            {
                Id = ChapterId(c.Slug), BookId = raw.Id, Type = Chapter,
                Slug = c.Slug, Title = c.Title, Body = c.Body,
            };

        foreach (var e in raw.Endings)
            yield return new ContentDoc
            {
                Id = EndingId(e.Slug), BookId = raw.Id, Type = Ending,
                Slug = e.Slug, Code = e.Code, Culprits = e.Culprits.ToList(),
                Title = e.Title, Special = e.Special, Body = e.Body,
            };

        foreach (var (id, clue) in raw.Clues)
            yield return new ContentDoc
            {
                Id = ClueId(id), BookId = raw.Id, Type = Clue,
                ClueKey = id, ChapterSlug = clue.ChapterSlug, ChapterTitle = clue.ChapterTitle,
                Passages = clue.Passages.ToList(), Fragments = clue.Fragments.ToList(),
            };

        foreach (var (code, x) in raw.Xref)
            yield return new ContentDoc
            {
                Id = XrefId(code), BookId = raw.Id, Type = Xref,
                Code = code, Slug = x.Slug, Markers = x.Markers.ToList(),
            };
    }

    // Reassemble a RawBook from one book's documents. Chapter order comes from the manifest;
    // endings / clues / xref are sorted deterministically so File and Cosmos round-trips match.
    public static RawBook FromDocuments(string bookId, IEnumerable<ContentDoc> docs)
    {
        var list = docs.ToList();
        var manifest = list.FirstOrDefault(d => d.Type == Manifest)
            ?? throw new InvalidOperationException($"Book \"{bookId}\" has no manifest document");
        var order = manifest.ChapterOrder ?? new List<string>();

        var chaptersBySlug = list.Where(d => d.Type == Chapter)
            .ToDictionary(d => d.Slug!, d => new ChapterDto(d.Slug!, d.Title!, d.Body!));
        var chapters = order.Select(s => chaptersBySlug[s]).ToList();

        var endings = list.Where(d => d.Type == Ending)
            .OrderBy(d => d.Slug, StringComparer.Ordinal)
            .Select(d => new Ending(d.Code!, d.Culprits ?? new List<string>(), d.Title!, d.Special, d.Slug!, d.Body!))
            .ToList();

        var clues = list.Where(d => d.Type == Clue)
            .OrderBy(d => d.ClueKey, StringComparer.Ordinal)
            .ToDictionary(
                d => d.ClueKey!,
                d => new ClueDto(d.ChapterSlug!, d.ChapterTitle!, (d.Passages ?? new()).ToArray(), (d.Fragments ?? new()).ToArray()));

        var xref = list.Where(d => d.Type == Xref)
            .OrderBy(d => d.Code, StringComparer.Ordinal)
            .ToDictionary(d => d.Code!, d => new XrefEntry(d.Slug!, d.Markers ?? new List<XrefMarkerDto>()));

        return new RawBook(bookId, manifest.Title, chapters, endings, clues, xref);
    }
}
