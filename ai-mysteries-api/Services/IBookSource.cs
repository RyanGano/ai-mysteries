using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Source-agnostic, decomposed representation of one book — the raw data needed to build a Book.
// It mirrors the on-disk file layout (book.json / book/*.md, endings.json / endings/*.md,
// clues.json, xref-markers.json) so the same shape round-trips through both the File source and
// the Cosmos source. BookStore turns a RawBook into an immutable Book.
public sealed record RawBook(
    string Id,
    string? Title,
    IReadOnlyList<ChapterDto> Chapters,
    IReadOnlyList<Ending> Endings,
    IReadOnlyDictionary<string, ClueDto> Clues,
    IReadOnlyDictionary<string, XrefEntry> Xref);

// One ending's cross-reference placements. Keyed in RawBook.Xref by the ending's canonical
// (as-authored) code, matching the xref-markers.json shape.
public sealed record XrefEntry(string Slug, IReadOnlyList<XrefMarkerDto> Markers);

// Where book content comes from. FileBookSource reads Content/ on disk (dev + authoring);
// CosmosBookSource reads the Cosmos container (prod). Loaded once at startup, then cached.
public interface IBookSource
{
    IEnumerable<RawBook> LoadAll();
}
