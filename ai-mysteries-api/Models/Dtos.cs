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

// All book-identifying content the front end renders, served by GET /api/books (list) and
// GET /api/books/{bookId} (single). Carries no codes/culprits/ending list — no spoilers.
public record BookMetaDto(
    string Id,
    string Title,
    IReadOnlyList<string> Tags,
    string Published,
    int WordCount,
    string ReadingTime,
    IReadOnlyList<string> Summary,
    string CoverImage,
    string CoverAlt,
    string SecretBlurb,
    IReadOnlyList<string> Payoff,
    string CodePlaceholder,
    string ShareTitle,
    string ShareText,
    string SpecialShareText,
    SpecialRevealDto SpecialReveal,
    // Slug of the book's first chapter, so the catalog can deep-link straight into the reading
    // (the per-book landing page is the share target; the catalog card skips it). Empty if the
    // book has no chapters.
    string FirstChapterSlug,
    // Protagonist gender ("male"/"female", or "" when unknown), so the web read-aloud feature can
    // pick a matching text-to-speech voice.
    string NarrationGender);

public record SpecialRevealDto(string Headline, string Sub);
