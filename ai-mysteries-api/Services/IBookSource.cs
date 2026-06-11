using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Source-agnostic, decomposed representation of one book — the raw data needed to build a Book.
// It mirrors the on-disk file layout (meta.json, book.json / book/*.md, endings.json /
// endings/*.md, clues.json, xref-markers.json) so the same shape round-trips through both the
// File source and the Cosmos source. BookStore turns a RawBook into an immutable Book.
public sealed record RawBook(
    string Id,
    BookMeta Meta,
    IReadOnlyList<ChapterDto> Chapters,
    IReadOnlyList<Ending> Endings,
    IReadOnlyDictionary<string, ClueDto> Clues,
    IReadOnlyDictionary<string, XrefEntry> Xref);

// All book-identifying content the front end renders — title, marketing copy, cover URL, the
// end-of-book payoff, share strings, and the special-ending reveal. Lives in the Cosmos manifest
// doc (authored locally as meta.json). The web app holds none of this; it fetches it per book so
// a new book is a data-only change. Contains no codes, culprits, or ending list (no spoilers).
public sealed record BookMeta(
    string Title,
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
// CosmosBookSource reads the Cosmos container (prod). Loaded once at startup, then cached.
public interface IBookSource
{
    IEnumerable<RawBook> LoadAll();
}
