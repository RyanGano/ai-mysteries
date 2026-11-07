using System.Net.Http.Json;
using System.Text.Json;
using AiMysteries.Api.Models;
using AiMysteries.Api.Services;
using Microsoft.Extensions.DependencyInjection;

namespace AiMysteries.Api.Tests;

// Old-style books (no cast, no tags) must read and sound exactly as before; new-style books (a
// voice cast + {{say:...}} tags) must serve tag-free text, the same chunk strings, and multi-voice
// SSML. Both fixture books live in Fixtures/Content and go through the real endpoints.
public sealed class ReadAloudTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    private sealed record Manifest(string Hash, List<string> Chunks);

    private async Task<Manifest> GetManifest(string route) =>
        (await _client.GetFromJsonAsync<Manifest>(route))!;

    // --- old-style book: nothing changes ------------------------------------------------------

    // Hashes captured from the API before casts existed (main at 8c165e8), serving this same
    // fixture. Matching them means no existing book's cached audio is invalidated.
    [Fact]
    public async Task Book_without_voices_hashes_exactly_as_before()
    {
        var chapter = await GetManifest("/api/books/plain-book/audio/chapter/opening");
        var ending = await GetManifest("/api/books/plain-book/audio/ending/QZ7X");

        Assert.Equal("6d1c96df467597b2dbe07911", chapter.Hash);
        Assert.Equal("992f2b93e24ccd7e2d36a492", ending.Hash);
        Assert.Equal(
            [
                "Opening.",
                "The kitchen was quiet when the inspector came in.",
                "\"Somebody moved the pie,\" she said, setting down her notebook. \"And I want to know who.\"",
                "The cook wiped his hands on his apron. \"Not me. I was out back the whole time, scrubbing pots until my arms ached and the sun went down behind the barn. Ask anyone who walked past the yard that afternoon.",
                "They all saw me there, elbow deep in soap, and none of them saw a pie.\"",
            ],
            chapter.Chunks);
    }

    [Fact]
    public void Book_without_voices_sends_the_same_single_voice_ssml()
    {
        var track = ChapterTrack("plain-book", "opening");

        Assert.Equal(
            "<speak version='1.0' xml:lang='en-US'><voice name='en-US-AvaMultilingualNeural'>" +
            "&quot;Somebody moved the <sub alias='pye'>pie</sub>,&quot; she said, setting down her notebook. " +
            "&quot;And I want to know who.&quot;</voice></speak>",
            AudioService.BuildSsml(track, 2));
    }

    // --- new-style book: tags never reach a reader --------------------------------------------

    [Fact]
    public async Task Chapter_endpoint_never_returns_speaker_tags()
    {
        var json = await _client.GetStringAsync("/api/books/voiced-book/chapters/opening");
        var body = JsonDocument.Parse(json).RootElement.GetProperty("chapter").GetProperty("body").GetString();

        Assert.DoesNotContain("{{say:", json);
        Assert.Equal(
            "The kitchen was quiet when the inspector came in.\n\n" +
            "\"Somebody moved the pie,\" she said, setting down her notebook. \"And I want to know who.\"\n\n" +
            "The cook wiped his hands on his apron. \"Not me. I was out back the whole time, scrubbing pots until my arms ached and the sun went down behind the barn. Ask anyone who walked past the yard that afternoon. They all saw me there, elbow deep in soap, and none of them saw a pie.\"\n\n" +
            "\"Then who?\" the inspector asked.\n\n" +
            "\"Ask the baker,\" he said. \"I will,\" she said.\n",
            body!.ReplaceLineEndings("\n"));
    }

    [Fact]
    public async Task Ending_endpoint_never_returns_speaker_tags()
    {
        var json = await _client.GetStringAsync("/api/books/voiced-book/endings/QZ7X");
        var body = JsonDocument.Parse(json).RootElement.GetProperty("body").GetString();

        Assert.DoesNotContain("{{say:", json);
        Assert.Equal(
            "Everyone stood around the empty pie tin.\n\n\"It was the wind,\" the inspector said. \"The window was open all along.\"\n",
            body!.ReplaceLineEndings("\n"));
    }

    [Fact]
    public async Task Book_meta_never_exposes_the_cast()
    {
        var json = await _client.GetStringAsync("/api/books/voiced-book");

        Assert.DoesNotContain("voices", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("SoniaNeural", json);
    }

    // --- new-style book: same chunks, voiced runs ---------------------------------------------

    [Fact]
    public async Task Tagged_chapter_sends_the_chunks_its_tag_free_text_would()
    {
        var manifest = await GetManifest("/api/books/voiced-book/audio/chapter/opening");

        Assert.Equal(
            [
                "Opening.",
                "The kitchen was quiet when the inspector came in.",
                "\"Somebody moved the pie,\" she said, setting down her notebook. \"And I want to know who.\"",
                "The cook wiped his hands on his apron. \"Not me. I was out back the whole time, scrubbing pots until my arms ached and the sun went down behind the barn. Ask anyone who walked past the yard that afternoon.",
                "They all saw me there, elbow deep in soap, and none of them saw a pie.\"",
                "\"Then who?\" the inspector asked.",
                "\"Ask the baker,\" he said. \"I will,\" she said.",
            ],
            manifest.Chunks);
    }

    [Fact]
    public void Tagged_body_and_its_stripped_twin_chunk_identically()
    {
        const string tagged =
            "{{say:a}}\"Hello there,\" she said.\n\nHe nodded. {{say:b}}\"Hi.\"\n\n{{say:a}}\n\"Line on its own,\" she said.";

        Assert.Equal(
            ["\"Hello there,\" she said.", "He nodded. \"Hi.\"", "\"Line on its own,\" she said."],
            SpeechText.MarkdownToChunks(tagged));
        Assert.Equal(SpeechText.MarkdownToChunks(SpeakerTags.Strip(tagged)), SpeechText.MarkdownToChunks(tagged));
    }

    [Fact]
    public void Quote_split_across_two_chunks_keeps_its_speaker_in_both()
    {
        var chunks = SpeechText.MarkdownToVoicedChunks(
            "{{say:cook}}The cook wiped his hands on his apron. \"Not me. I was out back the whole time, scrubbing pots until my arms ached and the sun went down behind the barn. Ask anyone who walked past the yard that afternoon. They all saw me there, elbow deep in soap, and none of them saw a pie.\"");

        Assert.Equal(2, chunks.Count);
        Assert.Equal(
            [
                new SpeechRun(null, "The cook wiped his hands on his apron. "),
                new SpeechRun("cook", "\"Not me. I was out back the whole time, scrubbing pots until my arms ached and the sun went down behind the barn. Ask anyone who walked past the yard that afternoon."),
            ],
            chunks[0].Runs);
        Assert.Equal(
            [new SpeechRun("cook", "They all saw me there, elbow deep in soap, and none of them saw a pie.\"")],
            chunks[1].Runs);
    }

    [Fact]
    public void Mid_paragraph_tag_switches_speaker_and_untagged_quotes_stay_narrator()
    {
        var chunks = SpeechText.MarkdownToVoicedChunks(
            "\"Then who?\" the inspector asked.\n\n{{say:cook}}\"Ask the baker,\" he said. {{say:inspector}}\"I will,\" she said.");

        Assert.Equal([new SpeechRun(null, "\"Then who?\" the inspector asked.")], chunks[0].Runs);
        Assert.Equal(
            [
                new SpeechRun("cook", "\"Ask the baker,\""),
                new SpeechRun(null, " he said. "),
                new SpeechRun("inspector", "\"I will,\""),
                new SpeechRun(null, " she said."),
            ],
            chunks[1].Runs);
    }

    [Fact]
    public void Tagged_chunk_synthesizes_as_one_voice_per_run_with_style_and_prosody()
    {
        var track = ChapterTrack("voiced-book", "opening");

        Assert.Equal(
            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>" +
            "<voice name='en-US-GuyNeural'><prosody rate='+15%' pitch='-5%'>&quot;Ask the baker,&quot;</prosody></voice>" +
            "<voice name='en-US-AndrewMultilingualNeural'> he said. </voice>" +
            "<voice name='en-GB-SoniaNeural'><mstts:express-as style='cheerful'>&quot;I will,&quot;</mstts:express-as></voice>" +
            "<voice name='en-US-AndrewMultilingualNeural'> she said.</voice>" +
            "</speak>",
            AudioService.BuildSsml(track, 6));
    }

    // --- startup validation --------------------------------------------------------------------

    [Fact]
    public void Build_rejects_a_tag_whose_speaker_is_not_in_the_cast()
    {
        var raw = Raw("{{say:stranger}}\"Who am I?\"", new VoiceCast(null, new Dictionary<string, VoiceSpec> { ["cook"] = new("en-US-GuyNeural") }));

        var ex = Assert.Throws<InvalidOperationException>(() => BookStore.Build(raw));
        Assert.Contains("tags speaker \"stranger\"", ex.Message);
    }

    // A token the strip pattern can't match (here, one closing brace) would otherwise be served to
    // readers verbatim; it must fail the load instead.
    [Fact]
    public void Build_rejects_a_tag_the_strip_cannot_remove()
    {
        var raw = Raw("{{say:cook}\"Who am I?\"", new VoiceCast(null, new Dictionary<string, VoiceSpec> { ["cook"] = new("en-US-GuyNeural") }));

        var ex = Assert.Throws<InvalidOperationException>(() => BookStore.Build(raw));
        Assert.Contains("malformed speaker tag", ex.Message);
    }

    [Fact]
    public void Build_rejects_a_malformed_voice_name()
    {
        var raw = Raw("\"Hi.\"", new VoiceCast(new VoiceSpec("Andrew"), new Dictionary<string, VoiceSpec>()));

        var ex = Assert.Throws<InvalidOperationException>(() => BookStore.Build(raw));
        Assert.Contains("invalid voice name \"Andrew\"", ex.Message);
    }

    // --- helpers -------------------------------------------------------------------------------

    private Book GetBook(string id)
    {
        Assert.True(factory.Services.GetRequiredService<BookStore>().TryGetBook(id, out var book));
        return book;
    }

    private AudioTrack ChapterTrack(string bookId, string slug)
    {
        Assert.True(factory.Services.GetRequiredService<AudioService>().TryGetChapterTrack(GetBook(bookId), slug, out var track));
        return track;
    }

    private static RawBook Raw(string chapterBody, VoiceCast voices) => new(
        "test-book",
        BookMeta.Default("test-book") with { Voices = voices },
        [new ChapterDto("one", "One", chapterBody)],
        [],
        new Dictionary<string, ClueDto>(),
        new Dictionary<string, XrefEntry>(),
        new Dictionary<string, GlossaryEntryDto>(),
        SelectionRules.Default);
}
