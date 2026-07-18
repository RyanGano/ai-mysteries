using System.Threading.RateLimiting;
using AiMysteries.Api.Endpoints;
using AiMysteries.Api.Services;
using Azure.Identity;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Azure.Cosmos;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "WebClient";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
// Localhost origins are only trusted in Development (Vite picks the first free port, so any
// localhost port is accepted there). Prod allows nothing beyond Cors:AllowedOrigins — to point
// a local UI at the prod API, use the Vite dev proxy (VITE_PROXY_TARGET) instead of CORS.
var allowLocalhost = builder.Environment.IsDevelopment();
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p =>
    p.SetIsOriginAllowed(origin =>
            (allowLocalhost
                && Uri.TryCreate(origin, UriKind.Absolute, out var u)
                && u.Host is "localhost" or "127.0.0.1")
            || allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
        .AllowAnyHeader()
        .WithMethods("GET")));

// Behind App Service the socket peer is the platform front end; read the real client IP from
// X-Forwarded-For so the per-IP rate limiter partitions on actual callers. The default
// ForwardLimit of 1 takes only the rightmost entry — the one App Service itself appended — so
// a spoofed header can't impersonate someone else's address.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// Per-IP rate limits. Content is tiny and in-memory, so these exist to deter ending-code
// enumeration (the code space is ~1.2M combos) and to keep a scripted client from soaking the
// free-tier instance — not to throttle real readers, who stay far below both caps.
const string EndingCodesPolicy = "ending-codes";
const string AudioChunksPolicy = "audio-chunks";
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static string ClientKey(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    // Whole-API ceiling: generous for reading (a chapter view is ~3 requests).
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1) }));
    // Tighter cap on the code-lookup routes (random / exists / fetch-by-code) — the routes an
    // enumeration script would hammer. 30/min still outpaces a human revealing endings.
    o.AddPolicy(EndingCodesPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
    // Read-aloud chunk fetches: a real listener needs a handful per minute (one per sentence or
    // two, plus prefetch); the cap mostly stops a script from burning the free Speech quota.
    o.AddPolicy(AudioChunksPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(ctx), _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});

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

    // Poll the Cosmos content version and reload when a seed bumps it. File mode is static, so
    // this only runs against Cosmos.
    builder.Services.AddHostedService<BookRefreshService>();
}
else
{
    builder.Services.AddSingleton<IBookSource>(
        new FileBookSource(Path.Combine(builder.Environment.ContentRootPath, "Content")));
}

builder.Services.AddSingleton<BookStore>();

// Server-side read-aloud synthesis (Azure Speech + blob cache). Configured via the "Audio"
// section; when unset the audio endpoints 404 and the web uses the browser voice instead.
builder.Services.AddSingleton(builder.Configuration.GetSection("Audio").Get<AudioConfig>() ?? new AudioConfig());
builder.Services.AddSingleton<AudioService>();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseCors(CorsPolicy);
app.UseRateLimiter();

// Eager-load content so a bad/missing file fails fast at startup, not on first request.
app.Services.GetRequiredService<BookStore>();

// Liveness/keep-alive ping. No content, no DB call — just enough to spin the free-tier instance
// back up so a real request doesn't pay the cold start. Returns 204. Accepts HEAD too so a
// lightweight pinger can poke it without even pulling a body.
app.MapMethods("/warmup", ["GET", "HEAD"], () => Results.NoContent());

// Book-level metadata: the catalog (/api/books) and single-book lookup (/api/books/{bookId}).
app.MapBookEndpoints();

// Per-book content shares the "/api/books/{bookId}" prefix; each area registers its own routes.
var books = app.MapGroup("/api/books/{bookId}");
books.MapChapterEndpoints();
books.MapEndingEndpoints(EndingCodesPolicy);
books.MapClueEndpoints();
books.MapGlossaryEndpoints();
books.MapAudioEndpoints(EndingCodesPolicy, AudioChunksPolicy);

app.Run();
