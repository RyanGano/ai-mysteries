namespace AiMysteries.Api.Models;

// Wire shapes returned by the API. Property names serialize to camelCase (minimal API web
// defaults), matching the field names the web client already used when this data was bundled.

public record TocEntryDto(string Slug, string Title);

public record ChapterRefDto(string Slug, string Title);

public record ChapterDto(string Slug, string Title, string Body);

public record ChapterNavDto(
    ChapterDto Chapter,
    ChapterRefDto? Prev,
    ChapterRefDto? Next,
    bool IsFirst,
    bool IsLast);

// One foreshadowing glyph placement inside an ending body. Same fields as the old
// xref-markers.ts XrefMarker.
public record XrefMarkerDto(string ClueId, int Index, string Snippet);

// A manuscript passage shown in the binoculars popover. Same fields as the old clues.ts Clue.
// Doubles as the storage shape loaded from clues.json.
public record ClueDto(string ChapterSlug, string ChapterTitle, string[] Passages, string[] Fragments);

// The single ending the reader is currently viewing. Carries only its own markers and the
// clues those markers reference — never a cross-ending index.
public record EndingDto(
    string Code,
    string Title,
    IReadOnlyList<string> Culprits,
    bool Special,
    string Body,
    IReadOnlyList<XrefMarkerDto> Markers,
    IReadOnlyDictionary<string, ClueDto> Clues);

public record RandomCodeDto(string Code);

public record ExistsDto(bool Exists);
