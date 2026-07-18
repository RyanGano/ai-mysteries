using System.Text.RegularExpressions;

namespace AiMysteries.Api.Services;

// Turns a chapter/ending Markdown body into the ordered list of spoken chunks the read-aloud
// audio is synthesized from. This is the server-side twin of the web's lib/tts.ts
// markdownToSpeech — the chunk list it produces is the source of truth for audio tracks (the
// manifest ships these exact strings back to the client for the follow-along highlight), so the
// split rules only need to stay stable, not byte-identical with the client fallback.
public static partial class SpeechText
{
    // Cap one chunk at roughly a sentence or two: short pieces synthesize fast (low first-listen
    // latency), sit far under the Speech API's 10-minute per-request ceiling, and give the
    // follow-along highlight sentence-level granularity.
    private const int MaxChunkLength = 240;

    public static IReadOnlyList<string> MarkdownToChunks(string md)
    {
        var text = StripMarkdown(md);
        var chunks = new List<string>();
        foreach (var para in Regex.Split(text, @"\n\s*\n"))
        {
            var p = Regex.Replace(para, @"\s+", " ").Trim();
            if (p.Length == 0) continue;
            ChunkParagraph(p, chunks);
        }
        return chunks;
    }

    // Strip Markdown down to spoken prose: drop syntax, keep the words.
    private static string StripMarkdown(string md)
    {
        var s = md;
        s = Regex.Replace(s, @"```[\s\S]*?```", " ");                 // fenced code
        s = Regex.Replace(s, @"`([^`]*)`", "$1");                     // inline code
        s = Regex.Replace(s, @"!\[[^\]]*\]\([^)]*\)", " ");           // images
        s = Regex.Replace(s, @"\[([^\]]*)\]\([^)]*\)", "$1");         // links -> link text
        s = Regex.Replace(s, @"^\s{0,3}#{1,6}\s+", "", RegexOptions.Multiline);   // ATX headings
        s = Regex.Replace(s, @"^\s{0,3}>\s?", "", RegexOptions.Multiline);        // blockquotes
        s = Regex.Replace(s, @"^\s*[-*+]\s+", "", RegexOptions.Multiline);        // bullet lists
        s = Regex.Replace(s, @"^\s*\d+\.\s+", "", RegexOptions.Multiline);        // ordered lists
        s = Regex.Replace(s, @"^\s*([-*_])(?:\s*\1){2,}\s*$", " ", RegexOptions.Multiline); // rules
        s = Regex.Replace(s, @"(\*\*|__)(.*?)\1", "$2");              // bold
        s = Regex.Replace(s, @"(\*|_)(.*?)\1", "$2");                 // italic
        s = s.Replace("|", " ");                                       // table pipes
        s = Regex.Replace(s, @"\{\{xref:[^}]*\}\}", " ");             // stray cross-reference token
        return s;
    }

    // Split one paragraph into speakable chunks at sentence boundaries, capped in length.
    private static void ChunkParagraph(string paragraph, List<string> output)
    {
        var sentences = Regex.Matches(paragraph, @"[^.!?]+[.!?]+[""')\]]*|\S[^.!?]*$")
            .Select(m => m.Value.Trim())
            .Where(s => s.Length > 0)
            .ToList();
        if (sentences.Count == 0) sentences = [paragraph];

        var current = "";
        foreach (var s in sentences)
        {
            if (current.Length > 0 && current.Length + 1 + s.Length > MaxChunkLength)
            {
                output.Add(current);
                current = s;
            }
            else
            {
                current = current.Length > 0 ? $"{current} {s}" : s;
            }
        }
        if (current.Length > 0) output.Add(current);
    }
}
