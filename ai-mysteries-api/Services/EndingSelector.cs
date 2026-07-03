using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Weighted-random ending selection. Runs on the server so the browser never receives the full
// ending registry. Every book-specific input — the category weights, the sentinel culprit —
// comes from the book's authored SelectionRules; nothing in this class knows anything about any
// particular book. The special ending is handled by the caller (BookStore.PickRandomCodeAsync) on
// a deterministic ReadCount offset, not here, so this picker only ever returns ordinary endings.
public static class EndingSelector
{
    // Category id for an ending: a solo ending by the book's sentinel culprit (if one is
    // defined) gets the dedicated "sentinel" category; otherwise the category is the
    // culprit-set size ("1", "2", …).
    public static string CategoryOf(Ending e, SelectionRules rules)
    {
        if (rules.SentinelCulprit is { Length: > 0 } sentinel
            && e.Culprits.Count == 1 && e.Culprits[0] == sentinel)
            return "sentinel";
        return e.Culprits.Count.ToString();
    }

    // Stable key identifying a specific combination of culprits (order-independent).
    public static string ComboKey(Ending e) =>
        string.Join(" & ", e.Culprits.OrderBy(c => c, StringComparer.Ordinal));

    // Stage 1 — pick a category by weight. Stage 2 — pick a culprit combination uniformly within
    // the category. Stage 3 — pick uniformly among that combination's endings. Picking the combo
    // before the ending keeps every combination equally likely regardless of how many endings it
    // has. The special ending is never returned here (it is excluded from the category map);
    // BookStore decides when to surface it on the ReadCount cadence.
    //
    // `seenCodes` are the exact ending codes the reader has already been shown this session; they
    // are removed from the pool so a session never repeats an ending. When every ordinary ending
    // has been seen the pool is empty and this returns null (the caller shows the "found them all"
    // end-state). `excludeCode` (the currently shown ending) is a *soft* preference: its whole
    // culprit combo is dropped so "reveal another" doesn't show a sibling of the same combo
    // back-to-back — but only when doing so still leaves a candidate, so it never causes a false
    // exhaustion.
    public static string? PickCode(
        Book book, string? excludeCode, IReadOnlyCollection<string> seenCodes, Random rng)
    {
        var rules = book.Selection;

        var seen = seenCodes.Count == 0
            ? null
            : seenCodes.Select(CodeNormalizer.Normalize).ToHashSet(StringComparer.Ordinal);

        string? excludeCombo = null;
        if (!string.IsNullOrEmpty(excludeCode) && book.TryGetEnding(excludeCode, out var ex))
            excludeCombo = ComboKey(ex);

        // category -> comboKey -> codes, excluding the special ending and every already-seen code.
        var byCategory = new Dictionary<string, Dictionary<string, List<string>>>();
        foreach (var e in book.Endings)
        {
            if (e.Special) continue; // reachable only via the odds roll (or its code)
            if (seen is not null && seen.Contains(CodeNormalizer.Normalize(e.Code))) continue;
            var cat = CategoryOf(e, rules);
            if (!byCategory.TryGetValue(cat, out var combos))
                byCategory[cat] = combos = new Dictionary<string, List<string>>();
            var key = ComboKey(e);
            if (!combos.TryGetValue(key, out var codes))
                combos[key] = codes = new List<string>();
            codes.Add(e.Code);
        }

        // Every ordinary ending already seen this session.
        if (byCategory.Count == 0) return null;

        // Soft combo preference: drop the current combo, but keep it if that would empty the pool.
        if (excludeCombo is not null)
        {
            var trimmed = byCategory.ToDictionary(
                kv => kv.Key,
                kv => kv.Value.Where(c => c.Key != excludeCombo)
                    .ToDictionary(c => c.Key, c => c.Value));
            foreach (var cat in trimmed.Keys.ToList())
                if (trimmed[cat].Count == 0) trimmed.Remove(cat);
            if (trimmed.Count > 0) byCategory = trimmed;
        }

        var categories = byCategory.Keys.ToList();
        var chosenCat = PickWeighted(categories, c => WeightOf(c, rules), rng);

        var comboList = byCategory[chosenCat].Values.ToList();
        var chosenCombo = comboList[rng.Next(comboList.Count)];

        return chosenCombo[rng.Next(chosenCombo.Count)];
    }

    // Authored weight for a category; a book with no authored weights gets uniform categories.
    // (BookStore validates at startup that authored weights cover every category in use.)
    private static int WeightOf(string category, SelectionRules rules) =>
        rules.CategoryWeights.Count == 0 ? 1 : rules.CategoryWeights.GetValueOrDefault(category);

    private static T PickWeighted<T>(IList<T> items, Func<T, int> weightOf, Random rng)
    {
        var total = items.Sum(weightOf);
        var r = rng.NextDouble() * total;
        foreach (var item in items)
        {
            r -= weightOf(item);
            if (r <= 0) return item;
        }
        return items[^1];
    }
}
