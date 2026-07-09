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

// One glossary entry: an unfamiliar word or phrase from the book's prose with a plain-language,
// spoiler-free definition. Served whole per book by GET /api/books/{bookId}/glossary; the web
// underlines the first occurrence per chapter/ending and shows the definition in a popover.
// Doubles as the storage shape loaded from glossary.json. `Term` is the exact word to match
// (case-insensitive, word boundaries); `Aliases` covers plurals and variant forms.
public record GlossaryEntryDto(string Term, string Definition, IReadOnlyList<string> Aliases);

// One "from the story" shop item shown on the book's landing page. The web builds the Amazon
// link itself: a product page when `Asin` is set, otherwise a search for `Search`. `Note` is an
// optional in-world aside ("like the one on Bea's counter"). All book data, never code.
public record ShopItemDto(string Label, string Note, string Search, string Asin);

// The result of a random reveal: a code to show, or Exhausted=true when the reader has already
// seen every ordinary ending this session (Code is null then).
public record RandomCodeDto(string? Code, bool Exhausted = false);

// Body of POST /endings/random. `ExcludeCode` is the currently shown ending (soft combo de-dup);
// `Seen` is every ending code the reader has been shown this session, excluded so a session never
// repeats an ending. Sent in the body (not the query string) so the codes never land in access logs.
public record RandomRequest(string? ExcludeCode, string[]? Seen);

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
    string NarrationGender,
    // Curated "from the story" Amazon items for the landing-page shelf. Empty for books without one.
    IReadOnlyList<ShopItemDto> ShopItems);

public record SpecialRevealDto(string Headline, string Sub);
