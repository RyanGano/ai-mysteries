using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using AiMysteries.Api.Models;
using Azure.Core;
using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace AiMysteries.Api.Services;

// Bound from the "Audio" config section. Leaving SpeechEndpoint/SpeechResourceId/BlobContainerUrl
// empty disables the whole feature (the audio endpoints 404 and the web falls back to the
// browser's built-in speech). None of these values are secrets — auth is DefaultAzureCredential
// (managed identity in prod, `az login` locally), same as Cosmos.
public sealed record AudioConfig
{
    // The Speech resource's custom-subdomain endpoint, e.g. https://<name>.cognitiveservices.azure.com/.
    // A custom subdomain (not the regional endpoint) is required for Entra ID auth.
    public string SpeechEndpoint { get; init; } = "";

    // Full ARM resource id of the Speech resource — Entra auth for the TTS REST API wants the
    // token in the form "aad#<resourceId>#<entraAccessToken>".
    public string SpeechResourceId { get; init; } = "";

    // Public-read blob container the synthesized chunks are cached in, e.g.
    // https://<account>.blob.core.windows.net/audio. Cached chunks are served straight from here
    // (the API answers with a redirect), keeping audio bandwidth off the free-tier App Service.
    public string BlobContainerUrl { get; init; } = "";

    // Neural voices by protagonist gender (BookMeta.narrationGender). Site chrome, not book data —
    // the per-book input is the gender, these just map it to a concrete voice.
    public string MaleVoice { get; init; } = "en-US-AndrewMultilingualNeural";
    public string FemaleVoice { get; init; } = "en-US-AvaMultilingualNeural";
    public string DefaultVoice { get; init; } = "en-US-AvaMultilingualNeural";

    // Voice alias (e.g. "female-us-1") -> Azure neural voice name, for book voice casts. Site chrome:
    // books only ever name the alias, so a retired Azure voice is fixed here, once, for every book.
    // Seeded in appsettings.json; see VoiceAliases for the add-or-remap-only rule.
    public Dictionary<string, string> VoiceAliases { get; init; } = new();

    public string OutputFormat { get; init; } = "audio-24khz-96kbitrate-mono-mp3";
}

// One synthesizable text (a chapter or an ending) broken into its spoken chunks. The hash names
// the blob folder, so an edit to the text (or a voice change) automatically points at fresh
// blobs — stale audio can never be served for updated prose. `Pronunciations` holds only the
// book's hints whose word actually occurs in this track (and participates in the hash the same
// way, so adding a hint re-synthesizes just the tracks it touches). `VoiceRuns` is set only for a
// book with a voice cast: per chunk, which voice speaks which stretch of it. A book without a cast
// leaves it null and speaks every chunk in the single `Voice`, exactly as before casts existed.
public sealed record AudioTrack(
    string Hash,
    string Voice,
    IReadOnlyList<string> Chunks,
    IReadOnlyDictionary<string, string> Pronunciations,
    IReadOnlyList<IReadOnlyList<VoiceRun>>? VoiceRuns = null);

// One stretch of a chunk and the cast voice that speaks it.
public sealed record VoiceRun(VoiceSpec Voice, string Text);

// Result of a chunk request: a public blob URL to redirect to (cache hit), or the freshly
// synthesized bytes (cache miss — they were also uploaded for next time, best-effort).
public sealed record AudioChunk(string? BlobUrl, byte[]? Bytes);

// Server-side read-aloud: synthesizes chapter/ending chunks with Azure Speech neural voices and
// caches each chunk as an MP3 blob. Selection of what to speak stays book-agnostic — everything
// book-specific (the text, the narration gender) comes from the book data.
public sealed class AudioService
{
    // Generic site chrome spoken before a special ending, mirroring the on-screen reveal. Kept in
    // sync with SPECIAL_ANNOUNCE in the web's read-aloud-context.tsx.
    public const string SpecialAnnounce = "You got the special ending!";

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };
    private static readonly TokenRequestContext TokenScope = new(["https://cognitiveservices.azure.com/.default"]);

    private readonly AudioConfig _config;
    private readonly ILogger<AudioService> _logger;
    private readonly TokenCredential _credential = new DefaultAzureCredential();
    private readonly BlobContainerClient? _container;
    private readonly IReadOnlyDictionary<string, string> _aliases;

    // Per-book chunk indexes, keyed by the live Book instance so a content reload (which swaps in
    // new Book objects) naturally rebuilds and the old index falls away with the old book.
    private readonly ConditionalWeakTable<Book, BookAudioIndex> _indexes = new();

    // De-duplicates concurrent synthesis of the same chunk (e.g. two listeners hitting the same
    // uncached chapter) so the Speech quota isn't spent twice on identical audio.
    private readonly ConcurrentDictionary<string, Task<byte[]>> _inFlight = new();

    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private AccessToken _token;

    public bool Enabled { get; }

    public AudioService(AudioConfig config, ILogger<AudioService> logger)
    {
        _config = config;
        _logger = logger;
        _aliases = VoiceAliases.Build(config.VoiceAliases);
        Enabled = config.SpeechEndpoint.Length > 0
            && config.SpeechResourceId.Length > 0
            && config.BlobContainerUrl.Length > 0;
        if (Enabled)
            _container = new BlobContainerClient(new Uri(config.BlobContainerUrl), _credential);
    }

    public bool TryGetChapterTrack(Book book, string slug, out AudioTrack track) =>
        Index(book).ByChapterSlug.TryGetValue(slug, out track!);

    public bool TryGetEndingTrack(Book book, string code, out AudioTrack track) =>
        Index(book).ByEndingCode.TryGetValue(CodeNormalizer.Normalize(code), out track!);

    public bool TryGetTrack(Book book, string hash, out AudioTrack track) =>
        Index(book).ByHash.TryGetValue(hash, out track!);

    // Serve one chunk: redirect to the cached blob when it exists, otherwise synthesize now,
    // upload for next time (best-effort — a failed upload still returns the audio), and hand the
    // bytes back directly so the first listener doesn't pay a second round trip.
    //
    // `inline` forces the bytes to be returned even on a cache hit (downloading the blob
    // server-side) instead of a redirect. The redirect is cheaper and right for an <audio> element
    // (media elements ignore CORS), but the whole-book reader pulls chunks with fetch() to stitch
    // one continuous file, and fetch() would fail the cross-origin redirect to the CORS-less public
    // blob. Serving the bytes through the API keeps that request same-policy (the API's CORS covers
    // it), so the stitch works.
    public async Task<AudioChunk> GetChunkAsync(Book book, AudioTrack track, int index, CancellationToken ct, bool inline = false)
    {
        var blobName = $"{book.Id}/{track.Hash}/{index}.mp3";

        try
        {
            if (_container is not null)
            {
                var blob = _container.GetBlobClient(blobName);
                if (await blob.ExistsAsync(ct))
                {
                    if (inline)
                    {
                        var content = await blob.DownloadContentAsync(ct);
                        return new AudioChunk(null, content.Value.Content.ToArray());
                    }
                    return new AudioChunk($"{_config.BlobContainerUrl.TrimEnd('/')}/{blobName}", null);
                }
            }
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            // A cache-check hiccup shouldn't kill playback — synthesize instead.
            _logger.LogWarning(ex, "Audio cache check failed for {Blob}", blobName);
        }

        // The shared task ignores the caller's cancellation on purpose: another listener may be
        // awaiting the same synthesis.
        var task = _inFlight.GetOrAdd(blobName, _ => SynthesizeAndCacheAsync(track, index, blobName));
        try
        {
            return new AudioChunk(null, await task.WaitAsync(ct));
        }
        finally
        {
            _inFlight.TryRemove(blobName, out _);
        }
    }

    private sealed class BookAudioIndex
    {
        public Dictionary<string, AudioTrack> ByHash { get; } = [];
        public Dictionary<string, AudioTrack> ByChapterSlug { get; } = [];
        public Dictionary<string, AudioTrack> ByEndingCode { get; } = []; // normalized code
    }

    private BookAudioIndex Index(Book book) => _indexes.GetValue(book, BuildIndex);

    // Chunk every chapter and ending once per loaded Book. Pure string work over content already
    // in memory — no synthesis happens here.
    private BookAudioIndex BuildIndex(Book book)
    {
        var voice = book.Meta.NarrationGender.Trim().ToLowerInvariant() switch
        {
            "male" => _config.MaleVoice,
            "female" => _config.FemaleVoice,
            _ => _config.DefaultVoice,
        };
        // A cast's own narrator wins; without one the gender pick narrates, so the two settings
        // never fight. The cast's aliases are resolved to Azure voices here, so the track hashes are
        // built from the real voice: remapping an alias re-synthesizes exactly the audio using it.
        var cast = book.Meta.Voices is { } authored ? ResolveCast(book, authored, voice) : null;
        if (cast?.Narrator is { } narrator) voice = narrator.Voice;

        var index = new BookAudioIndex();

        foreach (var entry in book.GetToc())
        {
            if (!book.TryGetChapterNav(entry.Slug, out var nav)) continue;
            // Paragraph break after the title so it chunks on its own — merged with the first
            // sentence it would contain <h1> text no <p> matches, killing the opening highlight.
            var chunks = SpeechText.MarkdownToVoicedChunks($"{nav.Chapter.Title}.\n\n{book.TaggedChapterBody(nav.Chapter)}");
            var track = MakeTrack(voice, chunks, book.Meta.Pronunciations, cast);
            index.ByChapterSlug[entry.Slug] = track;
            index.ByHash.TryAdd(track.Hash, track);
        }

        foreach (var ending in book.Endings)
        {
            var chunks = SpeechText.MarkdownToVoicedChunks($"{ending.Title}.\n\n{book.TaggedEndingBody(ending)}").ToList();
            // Announce the special ending first, same as the on-screen reveal.
            if (ending.Special) chunks.Insert(0, new VoicedChunk(SpecialAnnounce, [new SpeechRun(null, SpecialAnnounce)]));
            var track = MakeTrack(voice, chunks, book.Meta.Pronunciations, cast);
            index.ByEndingCode[CodeNormalizer.Normalize(ending.Code)] = track;
            index.ByHash.TryAdd(track.Hash, track);
        }

        return index;
    }

    // Swap each alias in a cast for its Azure voice. An alias the map lacks must never take a book
    // down (the map is config, editable without touching any book), so it falls back to the book's
    // default narration voice with a warning; check-speakers.cjs is what catches it while authoring.
    private VoiceCast ResolveCast(Book book, VoiceCast cast, string fallback)
    {
        VoiceSpec Resolve(VoiceSpec spec)
        {
            if (_aliases.TryGetValue(VoiceAliases.Normalize(spec.Voice), out var voice)) return spec with { Voice = voice };
            _logger.LogWarning(
                "Book {BookId}: voice alias {Alias} is not in Audio:VoiceAliases; using {Fallback}", book.Id, spec.Voice, fallback);
            return spec with { Voice = fallback };
        }
        return new VoiceCast(
            cast.Narrator is { } n ? Resolve(n) : null,
            cast.Cast.ToDictionary(kv => kv.Key, kv => Resolve(kv.Value)));
    }

    // Content-addressed track id: voice + chunk texts in, hex out. Endings are looked up by hash
    // (not code) on the chunk route, so audio URLs never carry an ending code — nothing to
    // enumerate, nothing spoilable in a shared address bar.
    // Only the hints whose word occurs in this track join the hash material, so a track without
    // the word keeps its hash (and its cached audio) when a book gains a pronunciation hint.
    // A cast adds each chunk's runs and the voice settings they use; a book without a cast hashes
    // exactly the material it always did, so none of its cached audio is invalidated.
    internal static AudioTrack MakeTrack(
        string voice, IReadOnlyList<VoicedChunk> voiced, IReadOnlyDictionary<string, string> pronunciations, VoiceCast? cast)
    {
        var chunks = voiced.Select(c => c.Text).ToList();
        var applicable = pronunciations
            .Where(kv => chunks.Any(c => WordRegex(kv.Key).IsMatch(c)))
            .OrderBy(kv => kv.Key, StringComparer.Ordinal)
            .ToDictionary(kv => kv.Key, kv => kv.Value, StringComparer.OrdinalIgnoreCase);
        var pronMaterial = string.Join("\0", applicable.Select(kv => $"{kv.Key}>{kv.Value}"));
        var material = voice + "\0" + pronMaterial + "\0" + string.Join("\0", chunks);

        IReadOnlyList<IReadOnlyList<VoiceRun>>? voiceRuns = null;
        if (cast is not null)
        {
            var narrator = cast.Narrator ?? new VoiceSpec(voice);
            // An id the cast lacks can't get past BookStore.Build; narrating it is the safe default.
            voiceRuns = voiced
                .Select(c => (IReadOnlyList<VoiceRun>)c.Runs
                    .Select(r => new VoiceRun(r.Speaker is { } id ? cast.Cast.GetValueOrDefault(id, narrator) : narrator, r.Text))
                    .ToList())
                .ToList();
            material += "\0voices\0" + string.Join("\0", voiceRuns.Select(runs => string.Join("\u001e",
                runs.Select(r => string.Join("\u001f", r.Voice.Voice, r.Voice.Style, r.Voice.Rate, r.Voice.Pitch, r.Text)))));
        }

        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(material)))[..24];
        return new AudioTrack(hash, voice, chunks, applicable, voiceRuns);
    }

    // Whole-word, case-insensitive match for one pronunciation-hint term.
    private static Regex WordRegex(string term) =>
        new($@"\b{Regex.Escape(term)}\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private async Task<byte[]> SynthesizeAndCacheAsync(AudioTrack track, int index, string blobName)
    {
        var bytes = await SynthesizeAsync(BuildSsml(track, index));

        if (_container is not null)
        {
            try
            {
                await _container.GetBlobClient(blobName).UploadAsync(
                    new BinaryData(bytes),
                    new BlobUploadOptions
                    {
                        HttpHeaders = new BlobHttpHeaders
                        {
                            ContentType = "audio/mpeg",
                            // Content-addressed path → the bytes at this URL never change.
                            CacheControl = "public, max-age=31536000, immutable",
                        },
                    });
            }
            catch (Exception ex)
            {
                // Serve the audio anyway; the next listener just synthesizes again.
                _logger.LogWarning(ex, "Audio cache upload failed for {Blob}", blobName);
            }
        }

        return bytes;
    }

    // The SSML for one chunk. Without a cast: the one voice, exactly the document this always
    // sent. With a cast: one <voice> per run, each wrapped in the run's speaking style and prosody
    // where the cast sets them; pronunciation hints apply inside every run.
    internal static string BuildSsml(AudioTrack track, int index)
    {
        if (track.VoiceRuns is null)
            return $"<speak version='1.0' xml:lang='en-US'><voice name='{track.Voice}'>" +
                ToSsmlText(track.Chunks[index], track.Pronunciations) +
                "</voice></speak>";

        var sb = new StringBuilder(
            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' " +
            "xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>");
        foreach (var run in track.VoiceRuns[index])
        {
            var v = run.Voice;
            var styled = !string.IsNullOrEmpty(v.Style);
            var prosody = !string.IsNullOrEmpty(v.Rate) || !string.IsNullOrEmpty(v.Pitch);
            sb.Append("<voice name='").Append(SecurityElement.Escape(v.Voice)).Append("'>");
            if (styled) sb.Append("<mstts:express-as style='").Append(SecurityElement.Escape(v.Style)).Append("'>");
            if (prosody)
            {
                sb.Append("<prosody");
                if (!string.IsNullOrEmpty(v.Rate)) sb.Append(" rate='").Append(SecurityElement.Escape(v.Rate)).Append('\'');
                if (!string.IsNullOrEmpty(v.Pitch)) sb.Append(" pitch='").Append(SecurityElement.Escape(v.Pitch)).Append('\'');
                sb.Append('>');
            }
            sb.Append(ToSsmlText(run.Text, track.Pronunciations));
            if (prosody) sb.Append("</prosody>");
            if (styled) sb.Append("</mstts:express-as>");
            sb.Append("</voice>");
        }
        return sb.Append("</speak>").ToString();
    }

    private async Task<byte[]> SynthesizeAsync(string ssml)
    {
        var url = $"{_config.SpeechEndpoint.TrimEnd('/')}/tts/cognitiveservices/v1";

        // The free Speech tier rate-limits aggressively; a brief backoff rides out a burst (e.g.
        // the client prefetching ahead) without dropping the listener to the fallback voice.
        for (var attempt = 0; ; attempt++)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.TryAddWithoutValidation("Authorization", $"Bearer aad#{_config.SpeechResourceId}#{await GetEntraTokenAsync()}");
            req.Headers.TryAddWithoutValidation("X-Microsoft-OutputFormat", _config.OutputFormat);
            req.Headers.TryAddWithoutValidation("User-Agent", "ai-mysteries-api");
            req.Content = new StringContent(ssml, Encoding.UTF8, "application/ssml+xml");

            using var res = await Http.SendAsync(req);
            if (res.IsSuccessStatusCode)
                return await res.Content.ReadAsByteArrayAsync();

            var retryable = res.StatusCode == System.Net.HttpStatusCode.TooManyRequests
                || (int)res.StatusCode >= 500;
            if (!retryable || attempt >= 2)
                throw new InvalidOperationException($"Speech synthesis failed: {(int)res.StatusCode} {res.ReasonPhrase}");

            var delay = res.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(2 * (attempt + 1));
            await Task.Delay(delay);
        }
    }

    // Escape the chunk text for SSML, wrapping each pronunciation-hint word in a <sub> so the
    // voice says the alias while the on-screen text keeps the authored spelling. Whole-word,
    // case-insensitive; everything (matched or not) is XML-escaped.
    private static string ToSsmlText(string text, IReadOnlyDictionary<string, string> pronunciations)
    {
        if (pronunciations.Count == 0) return SecurityElement.Escape(text);

        var pattern = string.Join("|", pronunciations.Keys
            .OrderByDescending(k => k.Length) // longest first so overlapping terms match greedily
            .Select(Regex.Escape));
        var sb = new StringBuilder();
        var pos = 0;
        foreach (Match m in Regex.Matches(text, $@"\b(?:{pattern})\b",
                     RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            sb.Append(SecurityElement.Escape(text[pos..m.Index]));
            var alias = pronunciations[m.Value];
            sb.Append("<sub alias='").Append(SecurityElement.Escape(alias)).Append("'>")
                .Append(SecurityElement.Escape(m.Value)).Append("</sub>");
            pos = m.Index + m.Length;
        }
        sb.Append(SecurityElement.Escape(text[pos..]));
        return sb.ToString();
    }

    // Entra access tokens last about an hour; refresh a few minutes early and share across calls.
    private async Task<string> GetEntraTokenAsync()
    {
        if (_token.ExpiresOn > DateTimeOffset.UtcNow.AddMinutes(5))
            return _token.Token;
        await _tokenLock.WaitAsync();
        try
        {
            if (_token.ExpiresOn <= DateTimeOffset.UtcNow.AddMinutes(5))
                _token = await _credential.GetTokenAsync(TokenScope, CancellationToken.None);
            return _token.Token;
        }
        finally
        {
            _tokenLock.Release();
        }
    }
}
