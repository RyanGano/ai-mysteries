using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Source-agnostic, decomposed representation of one book — the raw data needed to build a Book.
// It mirrors the on-disk file layout (meta.json, book.json / book/*.md, endings.json /
// endings/*.md, clues.json, xref-markers.json) so the same shape round-trips through both the
// File source and the Cosmos source. BookStore turns a RawBook into an immutable Book.
//
// `Version` / `ContentHash` are operational bookkeeping used only by the Tools sync pipeline (not
// by the runtime API): `Version` is a UTC timestamp marking when the book's content last changed,
// `ContentHash` is the fingerprint of that content the version was stamped against. They are
// authored in meta.json (locally) / carried on the Cosmos manifest doc (Version only), and both
// are null for a book that hasn't been stamped yet. The runtime Book ignores them.
public sealed record RawBook(
    string Id,
    BookMeta Meta,
    IReadOnlyList<ChapterDto> Chapters,
    IReadOnlyList<Ending> Endings,
    IReadOnlyDictionary<string, ClueDto> Clues,
    IReadOnlyDictionary<string, XrefEntry> Xref,
    SelectionRules Selection,
    string? Version = null,
    string? ContentHash = null);

// Server-only rules for the weighted-random ending picker, authored per book (the `selection`
// key in meta.json / fields on the Cosmos manifest doc) so the API code knows nothing about any
// book's suspects, categories, or odds. Never map these into a DTO — they are spoilers.
//
// Categories are derived: an ending's category is its culprit-set size as a string ("1", "2",
// …), except a solo ending by `SentinelCulprit` (if set), which gets the dedicated "sentinel"
// category. `CategoryWeights` maps those category ids to relative weights; when empty, every
// category present in the book is equally likely. `SpecialEnding` is the **offset** (1–1000)
// within each fixed 1000-reveal block at which the book's `special: true` ending fires: the API
// tracks a per-book ReadCount over *random* reveals and short-circuits to the special ending when
// `readCount % 1000 == SpecialEnding` (so SpecialEnding=246 hits reveals 246, 1246, 2246, …; 1000
// maps to the block boundary 1000, 2000, …). This guarantees the special ending shows up exactly
// once in every 1000 reveals. 0 means the special ending is reachable only by entering its code.
// (This replaced the old probabilistic `specialEndingOdds` roll, which could in principle never
// hit; ReadCount also doubles as a per-book usage counter.)
public sealed record SelectionRules(
    string? SentinelCulprit,
    IReadOnlyDictionary<string, int> CategoryWeights,
    int SpecialEnding)
{
    // Inert defaults for a book that authors no rules: no sentinel, uniform categories, no
    // special cadence.
    public static SelectionRules Default { get; } = new(null, new Dictionary<string, int>(), 0);
}

// Persists the per-book random-reveal counter (ReadCount). Separate from IBookSource's content
// load because it is the one piece of book state mutated at runtime: the API increments a live
// in-memory count on every random reveal and a background flusher writes it back here. The Cosmos
// source persists it (one `stats` doc per book partition); the File source has no implementation
// (dev counts live only in memory). Kept out of the content fingerprint/sync entirely so runtime
// growth never looks like an authored content change.
public interface IReadCountStore
{
    // Current persisted counts, bookId -> count. Books with no stored count are simply absent
    // (treated as 0). Read once at startup to resume counting where the last process left off.
    IReadOnlyDictionary<string, long> LoadReadCounts();

    // Upsert one book's count. Called by the flusher only for books whose count changed.
    void SaveReadCount(string bookId, long count);
}

// All book-identifying content the front end renders — title, marketing copy, cover URL, the
// end-of-book payoff, share strings, and the special-ending reveal. Lives in the Cosmos manifest
// doc (authored locally as meta.json). The web app holds none of this; it fetches it per book so
// a new book is a data-only change. Contains no codes, culprits, or ending list (no spoilers).
public sealed record BookMeta(
    string Title,
    IReadOnlyList<string> Tags,
    string Published,
    int WordCount,
    IReadOnlyList<string> Summary,
    string CoverImage,
    string CoverAlt,
    string SecretBlurb,
    IReadOnlyList<string> Payoff,
    string CodePlaceholder,
    string ShareTitle,
    string ShareText,
    string SpecialShareText,
    SpecialReveal SpecialReveal)
{
    // Fallback used when a book has no meta.json / manifest fields yet: title = id, everything
    // else empty so the API and web still render without throwing.
    public static BookMeta Default(string bookId) => new(
        Title: bookId,
        Tags: Array.Empty<string>(),
        Published: "",
        WordCount: 0,
        Summary: Array.Empty<string>(),
        CoverImage: "",
        CoverAlt: "",
        SecretBlurb: "",
        Payoff: Array.Empty<string>(),
        CodePlaceholder: "",
        ShareTitle: bookId,
        ShareText: "",
        SpecialShareText: "",
        SpecialReveal: new SpecialReveal("", ""));
}

// The special-ending reveal overlay copy (e.g. "One in a thousand." / "You found it.").
public sealed record SpecialReveal(string Headline, string Sub);

// One ending's cross-reference placements. Keyed in RawBook.Xref by the ending's canonical
// (as-authored) code, matching the xref-markers.json shape.
public sealed record XrefEntry(string Slug, IReadOnlyList<XrefMarkerDto> Markers);

// Where book content comes from. FileBookSource reads Content/ on disk (dev + authoring);
// CosmosBookSource reads the Cosmos container (prod). Loaded once at startup, then cached by
// BookStore, which periodically re-checks GetVersion() and reloads when it changes.
public interface IBookSource
{
    IEnumerable<RawBook> LoadAll();

    // A cheap token for the current content version. BookStore polls this and only does a full
    // LoadAll when it differs from the cached value, so steady-state cost stays tiny. The Cosmos
    // source point-reads a single version doc that the seeder bumps on every real change; the
    // File source content is static for the process, so it returns a constant (no reload).
    string GetVersion();
}
