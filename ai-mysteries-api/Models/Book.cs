using AiMysteries.Api.Services;

namespace AiMysteries.Api.Models;

// One book's content, fully loaded and indexed in memory. Immutable after construction.
public sealed class Book
{
    public string Id { get; }
    public BookMeta Meta { get; }

    // Server-only rules for the random-ending picker. Never expose via a DTO (spoilers) —
    // GetMeta() intentionally doesn't map it.
    public SelectionRules Selection { get; }

    private readonly List<ChapterDto> _chapters;
    private readonly Dictionary<string, int> _chapterIndex;

    private readonly Dictionary<string, Ending> _endingsByCode; // keyed by normalized code
    private readonly Dictionary<string, IReadOnlyList<XrefMarkerDto>> _markersByCode; // normalized code
    private readonly Dictionary<string, ClueDto> _clues; // keyed by clue id

    // Unfamiliar-word definitions, pre-sorted by term for the GET /glossary payload. Spoiler-free
    // book-level data, so serving the whole list at once is fine (unlike endings/clues).
    private readonly IReadOnlyList<GlossaryEntryDto> _glossary;

    // The as-authored bodies of chapters/endings that carry {{say:...}} speaker tags, keyed
    // "chapter:<slug>" / "ending:<slug>". Everything else in the Book holds the tag-free text.
    private readonly Dictionary<string, string> _taggedBodies = new();

    public IReadOnlyList<Ending> Endings { get; }

    // The book's special (`special: true`) ending code, or null if it has none. Surfaced on the
    // ReadCount offset (see BookStore.PickRandomCodeAsync) or by entering the code.
    public string? SpecialCode { get; }

    public Book(
        string id,
        BookMeta meta,
        SelectionRules selection,
        List<ChapterDto> chapters,
        List<Ending> endings,
        Dictionary<string, IReadOnlyList<XrefMarkerDto>> markersByNormalizedCode,
        Dictionary<string, ClueDto> clues,
        IReadOnlyCollection<GlossaryEntryDto> glossary)
    {
        Id = id;
        Meta = meta;
        Selection = selection;
        // Speaker tags are read-aloud markup only. Strip them here, once, so every endpoint, the
        // glossary underline and the xref offsets see clean prose; AudioService reads the tagged
        // originals through TaggedChapterBody / TaggedEndingBody.
        _chapters = chapters.Select(c => c with { Body = Untag($"chapter:{c.Slug}", c.Body) }).ToList();
        endings = endings.Select(e => e with { Body = Untag($"ending:{e.Slug}", e.Body) }).ToList();
        _chapterIndex = new Dictionary<string, int>();
        for (var i = 0; i < chapters.Count; i++) _chapterIndex[chapters[i].Slug] = i;

        Endings = endings;
        _endingsByCode = new Dictionary<string, Ending>();
        foreach (var e in endings)
        {
            var key = CodeNormalizer.Normalize(e.Code);
            if (!_endingsByCode.TryAdd(key, e))
                throw new InvalidOperationException(
                    $"Duplicate normalized code \"{key}\" in book \"{id}\" — check endings.json");
        }

        _markersByCode = markersByNormalizedCode;
        _clues = clues;
        _glossary = glossary.OrderBy(g => g.Term, StringComparer.OrdinalIgnoreCase).ToList();

        SpecialCode = endings.FirstOrDefault(e => e.Special)?.Code;
    }

    private string Untag(string key, string body)
    {
        if (!SpeakerTags.HasTags(body)) return body;
        _taggedBodies[key] = body;
        return SpeakerTags.Strip(body);
    }

    // The body as authored, speaker tags included — for read-aloud synthesis only, never a reader.
    public string TaggedChapterBody(ChapterDto chapter) =>
        _taggedBodies.GetValueOrDefault($"chapter:{chapter.Slug}") ?? chapter.Body;

    public string TaggedEndingBody(Ending ending) =>
        _taggedBodies.GetValueOrDefault($"ending:{ending.Slug}") ?? ending.Body;

    public BookMetaDto GetMeta() => new(
        Id,
        Meta.Title,
        Meta.Tags,
        Meta.Published,
        Meta.WordCount,
        ReadingTime.Estimate(Meta.WordCount),
        Meta.Summary,
        Meta.CoverImage,
        Meta.CoverAlt,
        Meta.SecretBlurb,
        Meta.Payoff,
        Meta.CodePlaceholder,
        Meta.ShareTitle,
        Meta.ShareText,
        Meta.SpecialShareText,
        new SpecialRevealDto(Meta.SpecialReveal.Headline, Meta.SpecialReveal.Sub),
        _chapters.Count > 0 ? _chapters[0].Slug : string.Empty,
        Meta.NarrationGender,
        Meta.ShopItems,
        // Placeholder — BookStore overrides this with the live rating totals (which are runtime
        // state it owns, not part of the immutable Book).
        new RatingsDto(0, 0));

    public IReadOnlyList<TocEntryDto> GetToc() =>
        _chapters.Select(c => new TocEntryDto(c.Slug, c.Title)).ToList();

    public bool TryGetChapterNav(string slug, out ChapterNavDto nav)
    {
        nav = default!;
        if (!_chapterIndex.TryGetValue(slug, out var i)) return false;
        ChapterRefDto? Ref(int j) =>
            j >= 0 && j < _chapters.Count ? new ChapterRefDto(_chapters[j].Slug, _chapters[j].Title) : null;
        nav = new ChapterNavDto(
            _chapters[i],
            Ref(i - 1),
            Ref(i + 1),
            i == 0,
            i == _chapters.Count - 1);
        return true;
    }

    public bool CodeExists(string code) =>
        _endingsByCode.ContainsKey(CodeNormalizer.Normalize(code));

    public bool TryGetEnding(string code, out Ending ending) =>
        _endingsByCode.TryGetValue(CodeNormalizer.Normalize(code), out ending!);

    // Build the wire payload for a single ending: its body, its own markers, and only the
    // clues those markers reference.
    public bool TryGetEndingDto(string code, out EndingDto dto)
    {
        dto = default!;
        if (!TryGetEnding(code, out var e)) return false;
        var canonical = CodeNormalizer.Normalize(e.Code);
        var markers = _markersByCode.GetValueOrDefault(canonical) ?? Array.Empty<XrefMarkerDto>();
        var clues = new Dictionary<string, ClueDto>();
        foreach (var m in markers)
            if (!clues.ContainsKey(m.ClueId) && _clues.TryGetValue(m.ClueId, out var c))
                clues[m.ClueId] = c;
        dto = new EndingDto(e.Code, e.Title, e.Culprits, e.Special, e.Body, markers, clues);
        return true;
    }

    public bool TryGetClue(string id, out ClueDto clue) => _clues.TryGetValue(id, out clue!);

    // The whole glossary, sorted by term. Empty list for books that author none.
    public IReadOnlyList<GlossaryEntryDto> GetGlossary() => _glossary;
}
