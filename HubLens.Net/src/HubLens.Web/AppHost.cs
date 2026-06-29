using HubLens.Data;
using HubLens.Ingest;
using HubLens.Web.Components;
using HubLens.Web.Services;
using Microsoft.EntityFrameworkCore;

namespace HubLens.Web;

public static class AppHost
{
    public const string BaseUrl = "http://127.0.0.1:5050";

    public static WebApplication Build(string[]? args = null)
    {
        var builder = WebApplication.CreateBuilder(args ?? []);

        var dataDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "HubLens");
        Directory.CreateDirectory(dataDirectory);

        var connectionString = $"Data Source={Path.Combine(dataDirectory, "hublens.db")}";

        builder.Services.AddRazorComponents()
            .AddInteractiveServerComponents();

        builder.Services.AddDbContext<HubLensDbContext>(options =>
            options.UseSqlite(connectionString));

        builder.Services.AddScoped<CsvStreamReader>();
        builder.Services.AddScoped<IngestService>();
        builder.Services.AddScoped<DashboardService>();
        builder.Services.AddScoped<UserSession>();

        builder.WebHost.UseUrls(BaseUrl);

        var app = builder.Build();

        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler("/Error", createScopeForErrors: true);
        }

        app.UseAntiforgery();
        app.UseStaticFiles();

        app.MapRazorComponents<App>()
            .AddInteractiveServerRenderMode();

        return app;
    }

    public static async Task InitializeDatabaseAsync(WebApplication app, CancellationToken cancellationToken = default)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<HubLensDbContext>();
        await DatabaseInitializer.EnsureCreatedAsync(db, cancellationToken);
    }

    public static async Task WaitUntilReadyAsync(CancellationToken cancellationToken = default)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };

        for (var attempt = 0; attempt < 60; attempt += 1)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                using var response = await client.GetAsync(BaseUrl, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return;
                }
            }
            catch
            {
                // Server still starting.
            }

            await Task.Delay(250, cancellationToken);
        }

        throw new InvalidOperationException("HubLens did not start in time.");
    }
}
