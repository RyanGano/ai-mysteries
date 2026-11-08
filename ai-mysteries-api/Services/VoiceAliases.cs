using System.Text.RegularExpressions;

namespace AiMysteries.Api.Services;

// Book casts name voices by a stable alias (`female-us-1`, `male-gb-2`: gender, accent region,
// number), never by a raw Azure voice name. The alias -> Azure voice map is site chrome
// (AudioConfig.VoiceAliases, seeded in appsettings.json), so when Azure retires or renames a voice
// the map is remapped and every book that used the alias keeps working — re-synthesizing exactly
// the audio that used it, because track hashes are built from the resolved voice name.
//
// The contract that keeps old books safe: aliases are only ever added or remapped to a voice of
// the same gender and accent. Never remove one, never reuse one for a different gender/accent.
public static partial class VoiceAliases
{
    // gender-region-number, e.g. female-us-1. Region is a short lowercase accent code (us, gb, ie…).
    [GeneratedRegex(@"^(female|male)-[a-z]{2}-[1-9][0-9]*$")]
    public static partial Regex Shape();

    // Config keys may arrive with underscores for hyphens — an App Service setting name can't hold a
    // hyphen, so `Audio__VoiceAliases__female_us_1` overrides `female-us-1` from appsettings.json.
    public static string Normalize(string key) => key.Trim().Replace('_', '-').ToLowerInvariant();

    // The configured map keyed by normalized alias. An underscore-form key is an override, so it
    // wins over the hyphenated appsettings.json entry for the same alias.
    public static IReadOnlyDictionary<string, string> Build(IReadOnlyDictionary<string, string> configured)
    {
        var map = new Dictionary<string, string>();
        foreach (var (key, voice) in configured.OrderBy(kv => kv.Key.Contains('_')))
            map[Normalize(key)] = voice;
        return map;
    }
}
