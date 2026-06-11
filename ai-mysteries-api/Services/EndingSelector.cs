using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Weighted-random ending selection. Runs on the server so the browser never receives the full
// ending registry. Every book-specific input — the category weights, the sentinel culprit, the
// special-ending odds — comes from the book's authored SelectionRules; nothing in this class
// knows anything about any particular book.
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

    // Stage 0 — roll the book's special-ending odds. Stage 1 — pick a category by weight.
    // Stage 2 — pick a culprit combination uniformly within the category. Stage 3 — pick
    // uniformly among that combination's endings. Picking the combo before the ending keeps
    // every combination equally likely regardless of how many endings it has. `excludeCode`,
    // if set and known, removes its whole combo so "reveal another" never repeats the same
    // culprit set.
    public static string PickCode(Book book, string? excludeCode, Random rng)
    {
        var rules = book.Selection;

        var special = book.Endings.FirstOrDefault(e => e.Special);
        if (special is not null && rules.SpecialEndingOdds > 0
            && rng.NextDouble() < rules.SpecialEndingOdds)
            return special.Code;

        string? excludeCombo = null;
        if (!string.IsNullOrEmpty(excludeCode) && book.TryGetEnding(excludeCode, out var ex))
            excludeCombo = ComboKey(ex);

        // category -> comboKey -> codes
        var byCategory = new Dictionary<string, Dictionary<string, List<string>>>();
        foreach (var e in book.Endings)
        {
            if (e.Special) continue; // reachable only via the odds roll (or its code)
            var cat = CategoryOf(e, rules);
            if (!byCategory.TryGetValue(cat, out var combos))
                byCategory[cat] = combos = new Dictionary<string, List<string>>();
            var key = ComboKey(e);
            if (!combos.TryGetValue(key, out var codes))
                combos[key] = codes = new List<string>();
            codes.Add(e.Code);
        }

        if (excludeCombo is not null)
        {
            foreach (var (cat, combos) in byCategory.ToList())
            {
                combos.Remove(excludeCombo);
                if (combos.Count == 0) byCategory.Remove(cat);
            }
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
