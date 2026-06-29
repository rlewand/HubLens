using System.Windows;
using HubLens.Web;
using Microsoft.AspNetCore.Builder;

namespace HubLens.Desktop;

public partial class MainWindow : Window
{
    private WebApplication? webApp;
    private CancellationTokenSource? startupCancellation;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoadedAsync;
        Closed += OnClosed;
    }

    private async void OnLoadedAsync(object sender, RoutedEventArgs e)
    {
        startupCancellation = new CancellationTokenSource();

        try
        {
            webApp = AppHost.Build();
            await AppHost.InitializeDatabaseAsync(webApp, startupCancellation.Token);
            await webApp.StartAsync(startupCancellation.Token);
            await AppHost.WaitUntilReadyAsync(startupCancellation.Token);

            await webView.EnsureCoreWebView2Async();
            webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.Source = new Uri(AppHost.BaseUrl);

            loadingPanel.Visibility = Visibility.Collapsed;
            webView.Visibility = Visibility.Visible;
        }
        catch (Exception ex)
        {
            loadingText.Text = $"Could not start HubLens: {ex.Message}";
        }
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        try
        {
            startupCancellation?.Cancel();
            if (webApp is not null)
            {
                webApp.StopAsync().GetAwaiter().GetResult();
                webApp.DisposeAsync().AsTask().GetAwaiter().GetResult();
            }
        }
        catch
        {
            // Best-effort shutdown.
        }
        finally
        {
            startupCancellation?.Dispose();
        }
    }
}
