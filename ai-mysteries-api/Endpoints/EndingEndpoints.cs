using AiMysteries.Api.Models;
using AiMysteries.Api.Services;

namespace AiMysteries.Api.Endpoints;

public static class EndingEndpoints
{
    // Routes hang off the shared "/api/books/{bookId}" group passed in from Program.cs.
    public static RouteGroupBuilder MapEndingEndpoints(this RouteGroupBuilder books)
    {
        // Weighted-random ending code. `excludeCode` (the currently shown ending) removes its
        // whole culprit combo so "reveal another" never repeats the same combination.
        books.MapGet("/endings/random", (string bookId, string? excludeCode, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return Results.Ok(new RandomCodeDto(EndingSelector.PickCode(book, excludeCode, Random.Shared)));
            })
            .WithName("GetRandomEnding");

        // Lightweight existence check for the landing-page code input — no spoiler payload.
        books.MapGet("/endings/{code}/exists", (string bookId, string code, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return Results.Ok(new ExistsDto(book.CodeExists(code)));
            })
            .WithName("EndingExists");

        // The single ending for a code (input is normalized: O/0 and I/1/L interchangeable).
        books.MapGet("/endings/{code}", (string bookId, string code, BookStore store) =>
            {
                if (!store.TryGetBook(bookId, out var book)) return Results.NotFound();
                return book.TryGetEndingDto(code, out var dto) ? Results.Ok(dto) : Results.NotFound();
            })
            .WithName("GetEnding");

        return books;
    }
}
