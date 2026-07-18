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
    // never coexist in one doc). manifest also carries reading order + the rest of the book's
    // BookMeta (marketing copy, cover URL, payoff, share strings, special-reveal copy).
    public string? Title { get; set; }
    public List<string>? ChapterOrder { get; set; }

    // manifest only — sync-pipeline version (UTC timestamp marking when this book's content last
    // changed). Read cheaply by the Tools sync to decide per-book push/pull/skip without loading
    // any book content; the runtime API ignores it (it reloads off the global VersionDoc).
    public string? Version { get; set; }

    // manifest only — BookMeta fields (flat, matching this doc's type-specific field convention).
    public List<string>? Tags { get; set; }
    public string? Published { get; set; }
    public int? WordCount { get; set; }
    public List<string>? Summary { get; set; }
    public string? CoverImage { get; set; }
    public string? CoverAlt { get; set; }
    public string? SecretBlurb { get; set; }
    public List<string>? Payoff { get; set; }
    public string? CodePlaceholder { get; set; }
    public string? ShareTitle { get; set; }
    public string? ShareText { get; set; }
    public string? SpecialShareText { get; set; }
    public string? SpecialRevealHeadline { get; set; }
    public string? SpecialRevealSub { get; set; }
    public string? NarrationGender { get; set; }
    public Dictionary<string, string>? Pronunciations { get; set; }
    public List<ShopItemDto>? ShopItems { get; set; }

    // manifest only — server-side selection rules (see SelectionRules). Read by the API for
    // the random picker; never mapped into any response DTO.
    public string? SentinelCulprit { get; set; }
    public Dictionary<string, int>? CategoryWeights { get; set; }
    public int? SpecialEnding { get; set; }

    // stats only — the per-book random-reveal counter. Lives in its own `stats` doc (one per book
    // partition), written by the API and never by the seeder, so re-seeding a book's content never
    // resets the count and the count never participates in the content fingerprint/sync.
    public long? ReadCount { get; set; }

    // ratings only — the per-book aggregate thumbs-up/down totals. Lives in its own `ratings` doc
    // (one per book partition), API-owned exactly like `stats`: never emitted or deleted by the
    // seeder and never part of the content fingerprint/sync. Kept in a separate doc from `stats` so
    // the two independent write-through upserts never clobber each other's fields.
    public long? RatingUp { get; set; }
    public long? RatingDown { get; set; }

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

    // glossary — one unfamiliar-word definition (see GlossaryEntryDto). `GlossaryKey` is the
    // stable entry key from glossary.json.
    public string? GlossaryKey { get; set; }
    public string? Term { get; set; }
    public string? Definition { get; set; }
    public List<string>? Aliases { get; set; }
}

// The single global content-version doc. Lives in its own partition (not any book's), so the API
// reads it with one cheap point read that never touches a book partition, and book/manifest
// queries never see it. The seeder bumps Value on every real content change; the API reloads when
// the value it last saw no longer matches.
public sealed class VersionDoc
{
    public string Id { get; set; } = CosmosContent.VersionId;
    public string BookId { get; set; } = CosmosContent.SystemPartition;
    public string Type { get; set; } = CosmosContent.VersionType;
    public long Value { get; set; }
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
    public const string Glossary = "glossary";

    // The per-book runtime stats doc (random-reveal counter). One per book partition, owned by the
    // API — the seeder never emits it (so ToDocuments below omits it) and Push must not delete it.
    public const string Stats = "stats";
    public const string StatsId = "stats";

    // The per-book runtime ratings doc (aggregate thumbs up/down). Same ownership rules as `stats`:
    // API-owned, never emitted or deleted by the seeder, out of the content fingerprint/sync.
    public const string Ratings = "ratings";
    public const string RatingsId = "ratings";

    // The content-version doc (see VersionDoc) and the dedicated partition it lives in. The
    // partition holds no book content, so it stays out of every per-book query.
    public const string SystemPartition = "_system";
    public const string VersionId = "version";
    public const string VersionType = "version";

    // Deterministic ids so re-seeding upserts in place rather than duplicating.
    public static string ChapterId(string slug) => $"chapter:{slug}";
    public static string EndingId(string slug) => $"ending:{slug}";
    public static string ClueId(string clueId) => $"clue:{clueId}";
    public static string XrefId(string code) => $"xref:{code}";
    public static string GlossaryId(string key) => $"glossary:{key}";

    // Decompose a RawBook into its Cosmos documents.
    public static IEnumerable<ContentDoc> ToDocuments(RawBook raw)
    {
        var m = raw.Meta;
        yield return new ContentDoc
        {
            Id = Manifest,
            BookId = raw.Id,
            Type = Manifest,
            Version = raw.Version,
            Title = m.Title,
            Tags = m.Tags.ToList(),
            Published = m.Published,
            WordCount = m.WordCount,
            ChapterOrder = raw.Chapters.Select(c => c.Slug).ToList(),
            Summary = m.Summary.ToList(),
            CoverImage = m.CoverImage,
            CoverAlt = m.CoverAlt,
            SecretBlurb = m.SecretBlurb,
            Payoff = m.Payoff.ToList(),
            CodePlaceholder = m.CodePlaceholder,
            ShareTitle = m.ShareTitle,
            ShareText = m.ShareText,
            SpecialShareText = m.SpecialShareText,
            SpecialRevealHeadline = m.SpecialReveal.Headline,
            SpecialRevealSub = m.SpecialReveal.Sub,
            NarrationGender = m.NarrationGender,
            Pronunciations = m.Pronunciations.Count > 0
                ? m.Pronunciations
                    .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                    .ToDictionary(kv => kv.Key, kv => kv.Value)
                : null,
            ShopItems = m.ShopItems.Count > 0 ? m.ShopItems.ToList() : null,
            SentinelCulprit = raw.Selection.SentinelCulprit,
            CategoryWeights = raw.Selection.CategoryWeights.Count > 0
                ? new Dictionary<string, int>(raw.Selection.CategoryWeights)
                : null,
            SpecialEnding = raw.Selection.SpecialEnding,
        };
        // Note: no `stats`/`ratings` docs here — those runtime totals are API-owned and must
        // survive re-seeds, so the seeder neither emits nor deletes them.

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

        foreach (var (key, g) in raw.Glossary)
            yield return new ContentDoc
            {
                Id = GlossaryId(key), BookId = raw.Id, Type = Glossary,
                GlossaryKey = key, Term = g.Term, Definition = g.Definition, Aliases = g.Aliases.ToList(),
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

        var fallback = BookMeta.Default(bookId);
        var meta = new BookMeta(
            Title: manifest.Title ?? fallback.Title,
            Tags: manifest.Tags ?? fallback.Tags.ToList(),
            Published: manifest.Published ?? fallback.Published,
            WordCount: manifest.WordCount ?? fallback.WordCount,
            Summary: manifest.Summary ?? fallback.Summary.ToList(),
            CoverImage: manifest.CoverImage ?? fallback.CoverImage,
            CoverAlt: manifest.CoverAlt ?? fallback.CoverAlt,
            SecretBlurb: manifest.SecretBlurb ?? fallback.SecretBlurb,
            Payoff: manifest.Payoff ?? fallback.Payoff.ToList(),
            CodePlaceholder: manifest.CodePlaceholder ?? fallback.CodePlaceholder,
            ShareTitle: manifest.ShareTitle ?? manifest.Title ?? fallback.ShareTitle,
            ShareText: manifest.ShareText ?? fallback.ShareText,
            SpecialShareText: manifest.SpecialShareText ?? fallback.SpecialShareText,
            SpecialReveal: new SpecialReveal(
                manifest.SpecialRevealHeadline ?? "",
                manifest.SpecialRevealSub ?? ""),
            NarrationGender: manifest.NarrationGender ?? fallback.NarrationGender,
            Pronunciations: manifest.Pronunciations is { } prons
                ? prons.OrderBy(kv => kv.Key, StringComparer.Ordinal).ToDictionary(kv => kv.Key, kv => kv.Value)
                : fallback.Pronunciations,
            ShopItems: manifest.ShopItems ?? fallback.ShopItems.ToList());

        var selection = new SelectionRules(
            manifest.SentinelCulprit,
            manifest.CategoryWeights ?? new Dictionary<string, int>(),
            manifest.SpecialEnding ?? 0);

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

        var glossary = list.Where(d => d.Type == Glossary)
            .OrderBy(d => d.GlossaryKey, StringComparer.Ordinal)
            .ToDictionary(
                d => d.GlossaryKey!,
                d => new GlossaryEntryDto(d.Term ?? d.GlossaryKey!, d.Definition ?? "", d.Aliases ?? new List<string>()));

        // ContentHash isn't stored in Cosmos (the sync only needs the timestamp for direction);
        // it's recomputed locally when a book is pulled to disk.
        return new RawBook(bookId, meta, chapters, endings, clues, xref, glossary, selection, manifest.Version);
    }
}
