using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class BookEndpoints
{
    // Book-level metadata. Registered at the app root (not under the /{bookId} group) so the
    // catalog and the single-book lookup sit alongside each other.
    public static void MapBookEndpoints(this IEndpointRouteBuilder app)
    {
        // The catalog — every book's metadata. Drives the landing page.
        app.MapGet("/api/books", (BookStore store) => Results.Ok(store.AllMeta()))
            .WithName("GetBooks");

        // One book's metadata (title, summary, cover, payoff, share + special-reveal copy).
        app.MapGet("/api/books/{bookId}", (string bookId, BookStore store) =>
                store.TryGetBook(bookId, out var book)
                    ? Results.Ok(book.GetMeta())
                    : Results.NotFound())
            .WithName("GetBook");
    }
}
