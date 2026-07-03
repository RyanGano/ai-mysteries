using AiMysteries.Api.Models;
using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class EndingEndpoints
{
    // Routes hang off the shared "/api/books/{bookId}" group passed in from Program.cs. The
    // whole subgroup carries the tighter per-IP rate-limit policy: these are the routes a
    // code-enumeration script would target.
    public static RouteGroupBuilder MapEndingEndpoints(this RouteGroupBuilder books, string rateLimitPolicy)
    {
        var endings = books.MapGroup("/endings").RequireRateLimiting(rateLimitPolicy);

        // Weighted-random ending code. POST (not GET) so the seen-list travels in the body and its
        // codes never land in access logs. `excludeCode` (the currently shown ending) removes its
        // whole culprit combo so "reveal another" doesn't repeat the same combination back-to-back;
        // `seen` is every ending the reader has viewed this session, excluded so a session never
        // repeats an ending. Returns { exhausted: true } once every ordinary ending has been seen.
        endings.MapPost("/random", async (string bookId, RandomRequest? req, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                var seen = req?.Seen ?? Array.Empty<string>();
                var pick = await store.PickRandomCodeAsync(book, req?.ExcludeCode, seen, Random.Shared);
                return Results.Ok(new RandomCodeDto(pick.Code, pick.Exhausted));
            })
            .WithName("GetRandomEnding");

        // Lightweight existence check for the landing-page code input — no spoiler payload.
        endings.MapGet("/{code}/exists", (string bookId, string code, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return Results.Ok(new ExistsDto(book.CodeExists(code)));
            })
            .WithName("EndingExists");

        // The single ending for a code (input is normalized: O/0 and I/1/L interchangeable).
        endings.MapGet("/{code}", (string bookId, string code, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return book.TryGetEndingDto(code, out var dto) ? Results.Ok(dto) : Results.NotFound();
            })
            .WithName("GetEnding");

        return books;
    }
}
