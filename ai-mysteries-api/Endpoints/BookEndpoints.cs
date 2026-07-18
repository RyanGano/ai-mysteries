using AiMysteries.Api.Models;
using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class BookEndpoints
{
    // The reader's rating choices — the only transitions the API accepts (each side "up", "down",
    // or null/absent for no rating).
    private static readonly string?[] RatingValues = { null, "up", "down" };

    // Book-level metadata. Registered at the app root (not under the /{bookId} group) so the
    // catalog and the single-book lookup sit alongside each other. `ratingLimitPolicy` throttles
    // the rating write (scripted vote-stuffing deterrent).
    public static void MapBookEndpoints(this IEndpointRouteBuilder app, string ratingLimitPolicy)
    {
        // The catalog — every book's metadata (with live rating totals). Drives the landing page.
        app.MapGet("/api/books", (BookStore store) => Results.Ok(store.AllMeta()))
            .WithName("GetBooks");

        // One book's metadata (title, summary, cover, payoff, share + special-reveal copy, ratings).
        app.MapGet("/api/books/{bookId}", (string bookId, BookStore store) =>
                store.TryGetMeta(bookId, out var meta)
                    ? Results.Ok(meta)
                    : Results.NotFound())
            .WithName("GetBook");

        // Record a reader's story rating transition and return the new aggregate totals. The reader
        // is never identified — they send only their own previous/next choice (remembered in their
        // browser), and the server applies the net delta. POST so it doesn't cache and stays off
        // the GET-cache path. Rate-limited to blunt scripted stuffing.
        app.MapPost("/api/books/{bookId}/rating", async (string bookId, RatingRequest? req, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out _)) return Results.NotFound();
                var from = Normalize(req?.From);
                var to = Normalize(req?.To);
                if (!RatingValues.Contains(from) || !RatingValues.Contains(to))
                    return Results.BadRequest();
                var (up, down) = await store.ApplyRatingAsync(bookId, from, to);
                return Results.Ok(new RatingsDto(up, down));
            })
            .RequireRateLimiting(ratingLimitPolicy)
            .WithName("RateBook");
    }

    // Treat empty/whitespace as "no rating" (null) so an absent field and "" both mean the same.
    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;
}
