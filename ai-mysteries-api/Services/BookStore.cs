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

    // Turn the source-agnostic RawBook into the indexed, immutable Book. The xref map is keyed by
    // canonical code in RawBook; Book wants it keyed by normalized code. Public so the Tools
    // seeder can run the same validation (e.g. the duplicate-code check) before writing to Cosmos.
    public static Book Build(RawBook raw)
    {
        var markersByCode = raw.Xref.ToDictionary(
            kv => CodeNormalizer.Normalize(kv.Key),
            kv => kv.Value.Markers);

        return new Book(
            raw.Id,
            raw.Chapters.ToList(),
            raw.Endings.ToList(),
            markersByCode,
            raw.Clues.ToDictionary(kv => kv.Key, kv => kv.Value));
    }
}
