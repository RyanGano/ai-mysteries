using AiMysteries.Api.Endpoints;
using AiMysteries.Api.Services;
using Azure.Identity;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "WebClient";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p =>
    p.SetIsOriginAllowed(origin =>
            // Any localhost origin (Vite picks the first free port, so it can drift from 5173)
            // plus any explicitly configured origin (for a future deployed front end).
            (Uri.TryCreate(origin, UriKind.Absolute, out var u) && u.Host is "localhost" or "127.0.0.1")
            || allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        .AllowAnyHeader()
        .WithMethods("GET")));

// Pick where book content comes from. Dev/authoring defaults to the on-disk Content/ files;
// prod sets ContentSource=Cosmos (+ the Cosmos:* settings) to read from the database instead.
var contentSource = builder.Configuration["ContentSource"] ?? "File";
if (string.Equals(contentSource, "Cosmos", StringComparison.OrdinalIgnoreCase))
{
    var cosmos = builder.Configuration.GetSection("Cosmos").Get<CosmosConfig>()
        ?? throw new InvalidOperationException("ContentSource=Cosmos but the Cosmos config section is missing");

    builder.Services.AddSingleton(_ =>
        new CosmosClient(cosmos.Endpoint, new DefaultAzureCredential(), CosmosSetup.ClientOptions()));
    builder.Services.AddSingleton<IBookSource>(sp =>
        new CosmosBookSource(sp.GetRequiredService<CosmosClient>().GetContainer(cosmos.Database, cosmos.Container)));
}
else
{
    builder.Services.AddSingleton<IBookSource>(
        new FileBookSource(Path.Combine(builder.Environment.ContentRootPath, "Content")));
}

builder.Services.AddSingleton<BookStore>();

var app = builder.Build();

app.UseCors(CorsPolicy);

// Eager-load content so a bad/missing file fails fast at startup, not on first request.
app.Services.GetRequiredService<BookStore>();

// All routes share the "/api/books/{bookId}" prefix; each area registers its own endpoints.
var books = app.MapGroup("/api/books/{bookId}");
books.MapChapterEndpoints();
books.MapEndingEndpoints();
books.MapClueEndpoints();

app.Run();
