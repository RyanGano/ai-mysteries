using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AiMysteries.Api.Tests;

// The real API, in File mode, over the placeholder books in Fixtures/Content. The Audio section is
// filled with dummy values so the read-aloud manifest endpoints are live; nothing here ever calls
// Azure (manifests are pure string work, and no test fetches a chunk).
//
// The voice-alias map is set here rather than read from the API's appsettings.json (the content
// root is the fixtures folder), so each test controls exactly which aliases exist. `aliases`
// replaces entries of the default map; a null value leaves that alias unmapped.
public class ApiFactory : WebApplicationFactory<Program>
{
    private readonly IReadOnlyDictionary<string, string?>? _aliases;

    public static readonly IReadOnlyDictionary<string, string> DefaultAliases = new Dictionary<string, string>
    {
        ["male-us-1"] = "en-US-AndrewMultilingualNeural",
        ["male-us-2"] = "en-US-GuyNeural",
        ["female-gb-1"] = "en-GB-SoniaNeural",
    };

    public ApiFactory() { }

    // Not public: an xunit class fixture may have only one public constructor.
    internal ApiFactory(IReadOnlyDictionary<string, string?> aliases) => _aliases = aliases;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseContentRoot(Path.Combine(AppContext.BaseDirectory, "Fixtures"));
        builder.UseSetting("ContentSource", "File");
        builder.UseSetting("Audio:SpeechEndpoint", "https://speech.example.invalid/");
        builder.UseSetting("Audio:SpeechResourceId", "test-resource");
        builder.UseSetting("Audio:BlobContainerUrl", "https://blob.example.invalid/audio");

        var map = DefaultAliases.ToDictionary(kv => kv.Key, kv => (string?)kv.Value);
        foreach (var (alias, voice) in _aliases ?? new Dictionary<string, string?>()) map[alias] = voice;
        foreach (var (alias, voice) in map)
            if (voice is not null) builder.UseSetting($"Audio:VoiceAliases:{alias}", voice);
    }
}
