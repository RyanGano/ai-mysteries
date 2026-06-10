namespace AiMysteries.Api.Models;

// In-memory storage record for one ending. `Code` is the canonical (as-authored) code; the
// lookup map is keyed by its normalized form. `Culprits` drives the selection category and the
// "reveal another" exclusion combo (see EndingSelector).
public sealed record Ending(
    string Code,
    IReadOnlyList<string> Culprits,
    string Title,
    bool Special,
    string Slug,
    string Body);
