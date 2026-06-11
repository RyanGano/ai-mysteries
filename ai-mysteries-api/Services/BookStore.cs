using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Loads and caches every book from the configured IBookSource at startup. Content is static at
// runtime, so this is a singleton built once. The source (disk vs Cosmos) is selected in
// Program.cs — BookStore itself doesn't care where the raw data came from.
public sealed class BookStore
{
    private readonly IBookSource _source;
    private readonly ILogger<BookStore> _logger;
    private readonly object _refreshLock = new();

    // Swapped atomically by Refresh(): readers grab the reference once, so an in-flight reload
    // never exposes a half-built dictionary. Marked volatile so a swap on the poller thread is
    // visible to request threads.
    private volatile IReadOnlyDictionary<string, Book> _books;

    // The source version the cached _books were built from. Only the poller thread touches it.
    private string _version;

    public BookStore(IBookSource source, ILogger<BookStore> logger)
    {
        _source = source;
        _logger = logger;
        _books = Load(source, logger);
        _version = SafeGetVersion();
    }

    public bool TryGetBook(string bookId, out Book book) => _books.TryGetValue(bookId, out book!);

    // Every book's metadata, ordered by id, for the GET /api/books catalog endpoint.
    public IReadOnlyList<BookMetaDto> AllMeta() =>
        _books.Values
            .OrderBy(b => b.Id, StringComparer.Ordinal)
            .Select(b => b.GetMeta())
            .ToList();

    // Cheap version check first; only a changed version triggers a full reload + atomic swap. On
    // any failure the cached content is kept serving, so a transient source hiccup can't take the
    // catalog down. Called on a timer by BookRefreshService.
    public void Refresh()
    {
        string version;
        try
        {
            version = _source.GetVersion();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Content version check failed; keeping cached content");
            return;
        }

        if (version == _version)
            return;

        lock (_refreshLock)
        {
            if (version == _version)
                return;

            try
            {
                var books = Load(_source, _logger);
                _books = books;          // atomic reference swap — readers see old or new, never partial
                _version = version;
                _logger.LogInformation(
                    "Reloaded content to version {Version} ({Count} book(s))", version, books.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Content reload to version {Version} failed; keeping cached content", version);
            }
        }
    }

    // Build the full book index from the source. Used at startup and on every reload.
    private static IReadOnlyDictionary<string, Book> Load(IBookSource source, ILogger logger)
    {
        var books = new Dictionary<string, Book>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in source.LoadAll())
        {
            var book = Build(raw);
            books[raw.Id] = book;
            logger.LogInformation("Loaded book \"{BookId}\" ({Endings} endings)", raw.Id, book.Endings.Count);
        }

        if (books.Count == 0)
            throw new InvalidOperationException("No books found from the configured content source");

        return books;
    }

    // Never let a version-read failure abort startup — fall back to a sentinel so the first poll
    // detects the real version and reloads.
    private string SafeGetVersion()
    {
        try { return _source.GetVersion(); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Initial content version read failed; will retry on next refresh");
            return "";
        }
    }

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
