using System.Collections.Concurrent;
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

    // Live per-book random-reveal counter. Mutated on every /random hit (the one piece of runtime
    // book state), kept separate from the immutable _books so a content reload never resets it.
    // Seeded at startup from the IReadCountStore (if the source persists counts) so counting
    // resumes across restarts; each increment is written through to the store on the same request.
    private readonly ConcurrentDictionary<string, long> _readCounts;

    // Live per-book aggregate rating totals (thumbs up/down). Like _readCounts this is API-owned
    // runtime state kept apart from the immutable _books, seeded at startup from the IRatingStore
    // (when the source persists ratings) and written through on every change so a reload never
    // resets it.
    private readonly ConcurrentDictionary<string, (long Up, long Down)> _ratings;

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

        var initial = SafeLoadReadCounts();
        _readCounts = new ConcurrentDictionary<string, long>(initial, StringComparer.OrdinalIgnoreCase);

        var initialRatings = SafeLoadRatings();
        _ratings = new ConcurrentDictionary<string, (long Up, long Down)>(initialRatings, StringComparer.OrdinalIgnoreCase);
    }

    // The special ending fires exactly once per this many random reveals (a guaranteed 1-in-1000),
    // at the phase chosen by the book's SpecialEnding offset.
    private const long SpecialEndingPeriod = 1000;

    // The outcome of a random reveal: either a code to show, or Exhausted (the reader has already
    // seen every ordinary ending this session and the special cadence didn't fire).
    public readonly record struct RandomPick(string? Code, bool Exhausted)
    {
        public static RandomPick Of(string code) => new(code, false);
        public static readonly RandomPick ExhaustedPick = new(null, true);
    }

    // Pick the code for a random reveal. Increments the book's read counter (this is the "normal
    // randomized request" that advances the count — a specific code fetched via /endings/{code} is
    // a shared link and never lands here, so it doesn't move the counter) and writes the new count
    // through to the store on this same request, so it is durable immediately (no background timer
    // to miss on a throttled free-tier app). The counter advances on *every* reveal, even one that
    // ends up exhausted, because it is the special ending's clock: when the book has a special
    // ending and an authored offset, the reveal whose count sits at that offset within each
    // 1000-reveal block returns it (so SpecialEnding=246 -> reveals 246, 1246, 2246, …) — even if
    // the ordinary endings are all seen. Otherwise the weighted picker chooses an ordinary ending
    // the reader hasn't seen yet (`seenCodes`); when there are none left it returns Exhausted so the
    // caller can show the "found them all" end-state. This guarantees the special surfaces once in
    // every 1000 reveals.
    public async Task<RandomPick> PickRandomCodeAsync(
        Book book, string? excludeCode, IReadOnlyCollection<string> seenCodes, Random rng)
    {
        var count = _readCounts.AddOrUpdate(book.Id, 1, (_, v) => v + 1);

        if (_source is IReadCountStore sink)
        {
            try
            {
                await sink.SaveReadCountAsync(book.Id, count);
            }
            catch (Exception ex)
            {
                // Don't fail the reveal on a persistence hiccup — the in-memory count still
                // advances and the next reveal writes the newer value, so the store self-heals.
                _logger.LogWarning(ex, "Failed to persist read count for book {BookId}", book.Id);
            }
        }

        var offset = book.Selection.SpecialEnding;
        if (book.SpecialCode is { } special
            && offset > 0
            && count % SpecialEndingPeriod == offset % SpecialEndingPeriod)
            return RandomPick.Of(special);

        var picked = EndingSelector.PickCode(book, excludeCode, seenCodes, rng);
        return picked is null ? RandomPick.ExhaustedPick : RandomPick.Of(picked);
    }

    public bool TryGetBook(string bookId, out Book book) => _books.TryGetValue(bookId, out book!);

    // Every book's metadata, ordered by id, for the GET /api/books catalog endpoint. The live
    // rating totals are attached here (they're runtime state BookStore owns, not part of Book).
    public IReadOnlyList<BookMetaDto> AllMeta() =>
        _books.Values
            .OrderBy(b => b.Id, StringComparer.Ordinal)
            .Select(WithRatings)
            .ToList();

    // One book's metadata with its live rating totals attached, for GET /api/books/{bookId}.
    public bool TryGetMeta(string bookId, out BookMetaDto meta)
    {
        if (_books.TryGetValue(bookId, out var book))
        {
            meta = WithRatings(book);
            return true;
        }
        meta = default!;
        return false;
    }

    // Copy the book's content metadata with the live aggregate rating attached.
    private BookMetaDto WithRatings(Book book)
    {
        var (up, down) = GetRating(book.Id);
        return book.GetMeta() with { Ratings = new RatingsDto(up, down) };
    }

    // The current aggregate rating for a book: (0, 0) when nobody has rated it yet.
    public (long Up, long Down) GetRating(string bookId) =>
        _ratings.TryGetValue(bookId, out var r) ? r : (0, 0);

    // Apply a single reader's rating transition (from -> to, each "up"/"down"/null) to the book's
    // aggregate totals and return the new totals. The delta is applied atomically and clamped at
    // zero (a stale/duplicated client transition can never drive a total negative), then written
    // through to the store so it's durable before the response returns — the same write-through the
    // read counter uses, so a throttled free-tier app never loses ratings to a missed timer. A
    // persistence failure is logged and swallowed; the in-memory total still advances and the next
    // write re-persists, so the store self-heals.
    public async Task<(long Up, long Down)> ApplyRatingAsync(string bookId, string? from, string? to)
    {
        var upDelta = Delta(from, to, "up");
        var downDelta = Delta(from, to, "down");

        var updated = _ratings.AddOrUpdate(
            bookId,
            (Math.Max(0, upDelta), Math.Max(0, downDelta)),
            (_, cur) => (Math.Max(0, cur.Up + upDelta), Math.Max(0, cur.Down + downDelta)));

        if (_source is IRatingStore sink)
        {
            try
            {
                await sink.SaveRatingAsync(bookId, updated.Up, updated.Down);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist rating for book {BookId}", bookId);
            }
        }

        return updated;
    }

    // +1 if `bucket` is being added by this transition, -1 if removed, 0 otherwise.
    private static long Delta(string? from, string? to, string bucket) =>
        (string.Equals(to, bucket, StringComparison.Ordinal) ? 1 : 0)
        - (string.Equals(from, bucket, StringComparison.Ordinal) ? 1 : 0);

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

    // Seed the live counters from the persisted store, when the source has one. A read failure
    // just starts every book at 0 — counting still works, only the resume point is lost.
    private IReadOnlyDictionary<string, long> SafeLoadReadCounts()
    {
        if (_source is not IReadCountStore store)
            return new Dictionary<string, long>();
        try { return store.LoadReadCounts(); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Initial read-count load failed; counters start at 0");
            return new Dictionary<string, long>();
        }
    }

    // Seed the live rating totals from the persisted store, when the source has one. A read failure
    // just starts every book at (0, 0) — rating still works, only the resume point is lost.
    private IReadOnlyDictionary<string, (long Up, long Down)> SafeLoadRatings()
    {
        if (_source is not IRatingStore store)
            return new Dictionary<string, (long Up, long Down)>();
        try { return store.LoadRatings(); }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Initial rating load failed; totals start at (0, 0)");
            return new Dictionary<string, (long Up, long Down)>();
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
            raw.Clues.ToDictionary(kv => kv.Key, kv => kv.Value),
            raw.Glossary.Values.ToList());
    }
}
