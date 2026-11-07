using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AiMysteries.Api.Tests;

// The real API, in File mode, over the placeholder books in Fixtures/Content. The Audio section is
// filled with dummy values so the read-aloud manifest endpoints are live; nothing here ever calls
// Azure (manifests are pure string work, and no test fetches a chunk).
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseContentRoot(Path.Combine(AppContext.BaseDirectory, "Fixtures"));
        builder.UseSetting("ContentSource", "File");
        builder.UseSetting("Audio:SpeechEndpoint", "https://speech.example.invalid/");
        builder.UseSetting("Audio:SpeechResourceId", "test-resource");
        builder.UseSetting("Audio:BlobContainerUrl", "https://blob.example.invalid/audio");
    }
}
