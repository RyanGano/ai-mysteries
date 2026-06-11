namespace AiMysteries.Api.Services;

// Converts a book's word count into a human-friendly reading-time estimate for display. The word
// count is the per-book datum (authored in meta.json); the reading speed below describes readers,
// not any book, so it lives here as a presentation constant. Keeping the conversion server-side
// means the display format can change (or a filter can be added on the raw word count) without
// touching the front end.
public static class ReadingTime
{
    // Average adult prose reading speed (words per minute). Adjust here to retune every estimate.
    private const int WordsPerMinute = 250;

    public static string Estimate(int wordCount)
    {
        if (wordCount <= 0) return "";

        var minutes = Math.Max(1, (int)Math.Round(wordCount / (double)WordsPerMinute));

        if (minutes < 60)
        {
            // Round to the nearest 5 minutes once we're past single digits — an estimate this
            // coarse shouldn't pretend to per-minute precision.
            var rounded = minutes < 10 ? minutes : (int)(Math.Round(minutes / 5.0) * 5);
            return $"~{rounded} min read";
        }

        var hours = minutes / 60;
        var remainder = (int)(Math.Round(minutes % 60 / 5.0) * 5);
        if (remainder == 60)
        {
            hours++;
            remainder = 0;
        }
        return remainder == 0 ? $"~{hours} hr read" : $"~{hours} hr {remainder} min read";
    }
}
