using System.Text.RegularExpressions;

namespace AiMysteries.Api.Services;

// Inline dialogue speaker tags for multi-voice read-aloud: `{{say:<speaker-id>}}`, written at the
// start of a paragraph (the paragraph's quoted spans are that speaker's) or right before a quote
// (switches the speaker from that quote on). The ids name entries in the book's `voices.cast`.
//
// Tags are audio-only markup. Book strips them once at load, so no endpoint, glossary underline
// or cross-reference offset ever sees one; only AudioService reads the tagged text. The Node
// scripts that read chapter/ending files directly strip them with scripts/lib/speaker-tags.cjs,
// which must keep the exact same pattern so xref offsets line up.
public static partial class SpeakerTags
{
    // Any say-token (well-formed or not) plus the spaces/tabs right after it, so a tag written as
    // `{{say:x}} "Hi"` leaves no stray space behind. Newlines are left alone: they may be a
    // paragraph break.
    [GeneratedRegex(@"\{\{say:([^}]*)\}\}[ \t]*")]
    public static partial Regex Token();

    // A well-formed speaker id: kebab case, like the glossary keys.
    [GeneratedRegex(@"^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    public static partial Regex ValidId();

    public static bool HasTags(string text) => text.Contains("{{say:", StringComparison.Ordinal);

    public static string Strip(string text) => HasTags(text) ? Token().Replace(text, "") : text;

    // Every speaker id the text tags, in order of first use.
    public static IEnumerable<string> Ids(string text) =>
        Token().Matches(text).Select(m => m.Groups[1].Value).Distinct();
}
