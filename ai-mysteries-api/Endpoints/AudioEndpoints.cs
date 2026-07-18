using AiMysteries.Api.Models;
using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class AudioEndpoints
{
    // Server-side read-aloud audio, hanging off the shared "/api/books/{bookId}" group. Two
    // shapes: a manifest per chapter/ending (the chunk texts + the content hash that addresses
    // their audio), and the chunk fetch itself. All of it 404s when the feature isn't configured,
    // which the web treats as "use the browser voice instead".
    public static RouteGroupBuilder MapAudioEndpoints(
        this RouteGroupBuilder books, string endingCodesPolicy, string audioChunksPolicy)
    {
        books.MapGet("/audio/chapter/{slug}", (string bookId, string slug, BookStore store, AudioService audio) =>
            {
                if (!audio.Enabled || !store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return audio.TryGetChapterTrack(book, slug, out var track)
                    ? Results.Ok(new AudioTrackDto(track.Hash, track.Chunks))
                    : Results.NotFound();
            })
            .WithName("GetChapterAudio");

        // The ending manifest resolves a code, so it sits under the same tight per-IP limit as the
        // other code-lookup routes to keep enumeration unattractive.
        books.MapGet("/audio/ending/{code}", (string bookId, string code, BookStore store, AudioService audio) =>
            {
                if (!audio.Enabled || !store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return audio.TryGetEndingTrack(book, code, out var track)
                    ? Results.Ok(new AudioTrackDto(track.Hash, track.Chunks))
                    : Results.NotFound();
            })
            .WithName("GetEndingAudio")
            .RequireRateLimiting(endingCodesPolicy);

        // One chunk of one track, addressed by content hash — never by ending code, so these URLs
        // are safe in address bars and can't be enumerated. Cached: redirect to the public blob.
        // Uncached: synthesize, cache, and stream the bytes straight back.
        books.MapGet("/audio/chunks/{hash}/{index:int}",
                async (string bookId, string hash, int index, BookStore store, AudioService audio, CancellationToken ct) =>
            {
                if (!audio.Enabled || !store.TryGetBook(bookId, out var book)) return Results.NotFound();
                if (!audio.TryGetTrack(book, hash, out var track)
                    || index < 0 || index >= track.Chunks.Count)
                    return Results.NotFound();

                try
                {
                    var chunk = await audio.GetChunkAsync(book, track, index, ct);
                    return chunk.BlobUrl is not null
                        ? Results.Redirect(chunk.BlobUrl)
                        : Results.File(chunk.Bytes!, "audio/mpeg", enableRangeProcessing: true);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception)
                {
                    // Synthesis failures (Speech quota, transient auth) are retryable — say so
                    // rather than 500, and let the client fall back or try again.
                    return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
                }
            })
            .WithName("GetAudioChunk")
            .RequireRateLimiting(audioChunksPolicy);

        return books;
    }
}
