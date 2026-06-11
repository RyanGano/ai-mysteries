using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Loads and caches every book from the configured IBookSource at startup. Content is static at
// runtime, so this is a singleton built once. The source (disk vs Cosmos) is selected in
// Program.cs — BookStore itself doesn't care where the raw data came from.
public sealed class BookStore
{
    private readonly Dictionary<string, Book> _books = new(StringComparer.OrdinalIgnoreCase);

    public BookStore(IBookSource source, ILogger<BookStore> logger)
    {
        foreach (var raw in source.LoadAll())
        {
            var book = Build(raw);
            _books[raw.Id] = book;
            logger.LogInformation("Loaded book \"{BookId}\" ({Endings} endings)", raw.Id, book.Endings.Count);
        }

        if (_books.Count == 0)
            throw new InvalidOperationException("No books found from the configured content source");
    }

    public bool TryGetBook(string bookId, out Book book) => _books.TryGetValue(bookId, out book!);

    // Every book's metadata, ordered by id, for the GET /api/books catalog endpoint.
    public IReadOnlyList<BookMetaDto> AllMeta() =>
        _books.Values
            .OrderBy(b => b.Id, StringComparer.Ordinal)
            .Select(b => b.GetMeta())
            .ToList();

    // Turn the source-agnostic RawBook into the indexed, immutable Book. The xref map is keyed by
    // canonical code in RawBook; Book wants it keyed by normalized code. Public so the Tools
    // seeder can run the same validation (e.g. the duplicate-code check) before writing to Cosmos.
    public static Book Build(RawBook raw)
    {
        // When explicit category weights are authored, every non-special ending must land in a
        // positively-weighted category — otherwise it would be silently unreachable by the
        // random picker. Fail at startup, like the duplicate-code check.
        if (raw.Selection.CategoryWeights.Count > 0)
        {
            foreach (var e in raw.Endings.Where(e => !e.Special))
            {
                var cat = EndingSelector.CategoryOf(e, raw.Selection);
                if (raw.Selection.CategoryWeights.GetValueOrDefault(cat) <= 0)
                    throw new InvalidOperationException(
                        $"Book \"{raw.Id}\": ending \"{e.Slug}\" falls in category \"{cat}\", which has " +
                        "no positive weight in selection.categoryWeights — check meta.json");
            }
        }

        var markersByCode = raw.Xref.ToDictionary(
            kv => CodeNormalizer.Normalize(kv.Key),
            kv => kv.Value.Markers);

        return new Book(
            raw.Id,
            raw.Meta,
            raw.Selection,
            raw.Chapters.ToList(),
            raw.Endings.ToList(),
            markersByCode,
            raw.Clues.ToDictionary(kv => kv.Key, kv => kv.Value));
    }
}
