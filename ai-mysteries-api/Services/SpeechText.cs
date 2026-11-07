using System.Text;
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

    public static IReadOnlyList<string> MarkdownToChunks(string md) =>
        MarkdownToVoicedChunks(md).Select(c => c.Text).ToList();

    // The same chunks, each also cut into who speaks which part. `md` may carry {{say:...}}
    // speaker tags (see SpeakerTags): they are removed per paragraph before chunking, so the chunk
    // texts are exactly what the stripped body chunks to (the client highlights by them), and the
    // tags only decide which quoted spans belong to which speaker. Text outside quotes, and quotes
    // no tag covers, belong to the narrator (a null speaker).
    public static IReadOnlyList<VoicedChunk> MarkdownToVoicedChunks(string md)
    {
        var text = StripMarkdown(md);
        var chunks = new List<VoicedChunk>();
        foreach (var para in Regex.Split(text, @"\n\s*\n"))
        {
            var (p, switches) = StripTags(para);
            if (p.Length == 0) continue;
            ChunkParagraph(p, SpeakerPerChar(p, switches), chunks);
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

    // Remove the speaker tags from one paragraph and normalize its whitespace (as every paragraph
    // always was), returning the clean text plus where each tag's speaker takes over in it.
    private static (string Text, List<(int Index, string Speaker)> Switches) StripTags(string para)
    {
        var switches = new List<(int Index, string Speaker)>();
        var raw = para;
        if (SpeakerTags.HasTags(para))
        {
            var sb = new StringBuilder();
            var rawSwitches = new List<(int Index, string Speaker)>();
            var pos = 0;
            foreach (Match m in SpeakerTags.Token().Matches(para))
            {
                sb.Append(para, pos, m.Index - pos);
                rawSwitches.Add((sb.Length, m.Groups[1].Value));
                pos = m.Index + m.Length;
            }
            sb.Append(para, pos, para.Length - pos);
            raw = sb.ToString();

            // Carry each switch point through the whitespace collapse + trim below: a prefix
            // collapses to exactly the length it occupies in the collapsed whole.
            var collapsed = Regex.Replace(raw, @"\s+", " ");
            var lead = collapsed.Length - collapsed.TrimStart().Length;
            var cleanLength = collapsed.Trim().Length;
            foreach (var (index, speaker) in rawSwitches)
            {
                var at = Regex.Replace(raw[..index], @"\s+", " ").Length - lead;
                switches.Add((Math.Clamp(at, 0, cleanLength), speaker));
            }
        }
        return (Regex.Replace(raw, @"\s+", " ").Trim(), switches);
    }

    // Who speaks each character of a clean paragraph: a quoted span (straight or curly double
    // quotes, marks included) belongs to the speaker most recently tagged before its opening mark;
    // everything else is narration (null). An unclosed quote runs to the paragraph's end, the
    // fiction convention for speech that continues into the next paragraph.
    private static string?[] SpeakerPerChar(string p, List<(int Index, string Speaker)> switches)
    {
        var result = new string?[p.Length];
        if (switches.Count == 0) return result;

        string? tagged = null;
        string? quoteSpeaker = null;
        var inQuote = false;
        var next = 0;
        for (var i = 0; i < p.Length; i++)
        {
            while (next < switches.Count && switches[next].Index <= i) tagged = switches[next++].Speaker;
            var c = p[i];
            if (!inQuote && c is '"' or '“')
            {
                inQuote = true;
                quoteSpeaker = tagged;
                result[i] = quoteSpeaker;
            }
            else if (inQuote)
            {
                result[i] = quoteSpeaker;
                if (c is '"' or '”') inQuote = false;
            }
        }
        return result;
    }

    // Split one paragraph into speakable chunks at sentence boundaries, capped in length.
    private static void ChunkParagraph(string paragraph, string?[] speakers, List<VoicedChunk> output)
    {
        var sentences = Regex.Matches(paragraph, @"[^.!?]+[.!?]+[""')\]]*|\S[^.!?]*$")
            .Select(m => (Start: m.Index + (m.Value.Length - m.Value.TrimStart().Length), Text: m.Value.Trim()))
            .Where(s => s.Text.Length > 0)
            .ToList();
        if (sentences.Count == 0) sentences = [(0, paragraph)];

        var current = new List<(int Start, string Text)>();
        var length = 0;
        foreach (var s in sentences)
        {
            if (length > 0 && length + 1 + s.Text.Length > MaxChunkLength)
            {
                output.Add(ToChunk(current, speakers));
                current = [];
                length = 0;
            }
            length = length > 0 ? length + 1 + s.Text.Length : s.Text.Length;
            current.Add(s);
        }
        if (length > 0) output.Add(ToChunk(current, speakers));
    }

    // Join a chunk's sentences with single spaces (its text) and cut that text into runs of one
    // speaker each. A stretch with nothing speakable in it (a joining space, a full stop after a
    // closing quote) rides along with its neighbour rather than becoming a voice switch of its own.
    private static VoicedChunk ToChunk(List<(int Start, string Text)> sentences, string?[] speakers)
    {
        var text = string.Join(" ", sentences.Select(s => s.Text));

        var pieces = new List<(string? Speaker, StringBuilder Text)>();
        void Append(string? speaker, char c)
        {
            if (pieces.Count == 0 || pieces[^1].Speaker != speaker) pieces.Add((speaker, new StringBuilder()));
            pieces[^1].Text.Append(c);
        }
        for (var i = 0; i < sentences.Count; i++)
        {
            if (i > 0) Append(pieces[^1].Speaker, ' ');
            var (start, s) = sentences[i];
            for (var j = 0; j < s.Length; j++) Append(speakers[start + j], s[j]);
        }

        var runs = new List<SpeechRun>();
        foreach (var (speaker, sb) in pieces)
        {
            var t = sb.ToString();
            if (runs.Count > 0 && (runs[^1].Speaker == speaker || !t.Any(char.IsLetterOrDigit)))
                runs[^1] = runs[^1] with { Text = runs[^1].Text + t };
            else if (runs.Count == 1 && !runs[0].Text.Any(char.IsLetterOrDigit))
                runs[0] = new SpeechRun(speaker, runs[0].Text + t); // leading punctuation joins the first real run
            else
                runs.Add(new SpeechRun(speaker, t));
        }
        return new VoicedChunk(text, runs);
    }
}

// One spoken chunk: the text the client highlights, and the same text cut into single-speaker
// runs (concatenated in order, the runs are exactly `Text`).
public sealed record VoicedChunk(string Text, IReadOnlyList<SpeechRun> Runs);

// A stretch of a chunk spoken by one voice. `Speaker` is a `voices.cast` id, or null for the
// narrator.
public sealed record SpeechRun(string? Speaker, string Text);
