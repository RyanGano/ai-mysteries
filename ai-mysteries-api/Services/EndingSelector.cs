using AiMysteries.Api.Models;

namespace AiMysteries.Api.Services;

// Weighted-random ending selection. Ports the three-stage algorithm from the old web
// src/lib/endings.ts so the distribution is unchanged — only now it runs on the server, so the
// browser never receives the full ending registry.
public static class EndingSelector
{
    private const double SpecialOdds = 1.0 / 1000; // 1-in-1000 roll for the super-special ending

    // Most-common to least-common. Must stay monotonically decreasing and sum to 100.
    private static readonly Dictionary<string, int> CategoryWeights = new()
    {
        ["single"] = 45,
        ["two"] = 25,
        ["three"] = 14,
        ["four"] = 8,
        ["all"] = 5,
        ["sam"] = 3,
    };

    public static string CategoryOf(Ending e)
    {
        if (e.Culprits.Count == 1 && e.Culprits[0] == "SAM") return "sam";
        return e.Culprits.Count switch
        {
            1 => "single",
            2 => "two",
            3 => "three",
            4 => "four",
            _ => "all", // all five suspects
        };
    }

    // Stable key identifying a specific combination of culprits (order-independent).
    public static string ComboKey(Ending e) =>
        string.Join(" & ", e.Culprits.OrderBy(c => c, StringComparer.Ordinal));

    // Stage 0 — 1-in-1000 super-special roll. Stage 1 — pick a category by weight. Stage 2 —
    // pick a culprit combination uniformly within the category. Stage 3 — pick uniformly among
    // that combination's endings. `excludeCode`, if set and known, removes its whole combo so
    // "reveal another" never repeats the same culprit set.
    public static string PickCode(Book book, string? excludeCode, Random rng)
    {
        var special = book.Endings.FirstOrDefault(e => e.Special);
        if (special is not null && rng.NextDouble() < SpecialOdds) return special.Code;

        string? excludeCombo = null;
        if (!string.IsNullOrEmpty(excludeCode) && book.TryGetEnding(excludeCode, out var ex))
            excludeCombo = ComboKey(ex);

        // category -> comboKey -> codes
        var byCategory = new Dictionary<string, Dictionary<string, List<string>>>();
        foreach (var e in book.Endings)
        {
            if (e.Special) continue; // never reachable via category weighting
            var cat = CategoryOf(e);
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
        var chosenCat = PickWeighted(categories, c => CategoryWeights[c], rng);

        var comboList = byCategory[chosenCat].Values.ToList();
        var chosenCombo = comboList[rng.Next(comboList.Count)];

        return chosenCombo[rng.Next(chosenCombo.Count)];
    }

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
