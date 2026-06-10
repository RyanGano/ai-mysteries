using System.Text.Json;
using Microsoft.Azure.Cosmos;

namespace AiMysteries.Api.Services;

// Cosmos connection settings, read from the "Cosmos" config section. Endpoint is the account
// URI (not a secret) — auth is passwordless via DefaultAzureCredential / Managed Identity.
public sealed record CosmosConfig(string Endpoint, string Database, string Container);

public static class CosmosSetup
{
    // One serializer for the whole app: System.Text.Json with web defaults, so documents
    // (re)serialize in camelCase and `Id` maps to Cosmos's required "id" key. Shared by the API
    // read path and the Tools seeder so stored docs and read docs use identical shapes.
    public static CosmosClientOptions ClientOptions() => new()
    {
        UseSystemTextJsonSerializerWithOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web),
    };
}
