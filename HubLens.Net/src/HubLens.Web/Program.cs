using HubLens.Web;

var app = AppHost.Build(args);
await AppHost.InitializeDatabaseAsync(app);
await app.RunAsync();
