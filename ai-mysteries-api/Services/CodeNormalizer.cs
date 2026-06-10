namespace AiMysteries.Api.Services;

// Server-authoritative ending-code normalization. Mirrors the old web src/lib/code.ts so that
// O/0 and I/1/L are interchangeable on input: uppercase, 0→O, 1/L→I, trim, first 4 chars.
public static class CodeNormalizer
{
    public static string Normalize(string? input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        var s = input.ToUpperInvariant()
            .Replace("0", "O")
            .Replace("1", "I")
            .Replace("L", "I")
            .Trim();
        return s.Length > 4 ? s[..4] : s;
    }
}
