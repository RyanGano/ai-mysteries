using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class ChapterEndpoints
{
    // Routes hang off the shared "/api/books/{bookId}" group passed in from Program.cs.
    public static RouteGroupBuilder MapChapterEndpoints(this RouteGroupBuilder books)
    {
        // Table of contents — chapter slugs + titles, no bodies.
        books.MapGet("/chapters", (string bookId, BookStore store) =>
                store.TryGetBook(bookId, out var book)
                    ? Results.Ok(book.GetToc())
                    : Results.NotFound())
            .WithName("GetChapters");

        // A single chapter with its body and prev/next neighbours.
        books.MapGet("/chapters/{slug}", (string bookId, string slug, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return book.TryGetChapterNav(slug, out var nav) ? Results.Ok(nav) : Results.NotFound();
            })
            .WithName("GetChapter");

        return books;
    }
}
