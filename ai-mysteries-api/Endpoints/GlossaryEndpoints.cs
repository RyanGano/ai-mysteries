using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class GlossaryEndpoints
{
    // Routes hang off the shared "/api/books/{bookId}" group passed in from Program.cs.
    public static RouteGroupBuilder MapGlossaryEndpoints(this RouteGroupBuilder books)
    {
        // The book's whole glossary — unfamiliar-word definitions the reader underlines in prose.
        // Spoiler-free book-level data, so one payload per book is fine (empty list when the book
        // authors none).
        books.MapGet("/glossary", (string bookId, BookStore store) =>
                store.TryGetBook(bookId, out var book)
                    ? Results.Ok(book.GetGlossary())
                    : Results.NotFound())
            .WithName("GetGlossary");

        return books;
    }
}
