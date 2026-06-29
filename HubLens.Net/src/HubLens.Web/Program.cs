using HubLens.Data;
using HubLens.Ingest;
using HubLens.Web.Components;
using HubLens.Web.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

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

builder.WebHost.UseUrls("http://127.0.0.1:5050");

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<HubLensDbContext>();
    await DatabaseInitializer.EnsureCreatedAsync(db);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}

app.UseAntiforgery();
app.UseStaticFiles();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
