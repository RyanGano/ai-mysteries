using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class ClueEndpoints
{
    // Routes hang off the shared "/api/books/{bookId}" group passed in from Program.cs.
    public static RouteGroupBuilder MapClueEndpoints(this RouteGroupBuilder books)
    {
        // A single clue, for the reader's deep-link foreshadowing highlight (/read/<slug>?clue=<id>).
        books.MapGet("/clues/{id}", (string bookId, string id, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return book.TryGetClue(id, out var clue) ? Results.Ok(clue) : Results.NotFound();
            })
            .WithName("GetClue");

        return books;
    }
}
