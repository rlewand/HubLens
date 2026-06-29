# HubLens (.NET)

Installable **Windows desktop app** for ACC/BIM 360 project maturity analysis. Built with **.NET 8**, **WPF + WebView2**, embedded **SQLite**, and no Node.js or PostgreSQL dependency.

## Desktop app

| Project | Role |
|---------|------|
| `HubLens.Desktop` | WPF shell with WebView2 — the installable desktop app |
| `HubLens.Web` | Blazor Server UI and API host (runs inside the desktop shell) |
| `HubLens.Core` | Maturity scoring engine and ACC CSV conventions |
| `HubLens.Data` | EF Core + SQLite |
| `HubLens.Ingest` | ZIP extraction and streaming CSV import |

User data is stored in:

`%LOCALAPPDATA%\HubLens\hublens.db`

## Requirements

- Windows 10/11 (64-bit)
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) — for development/build only
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) — usually already installed on Windows 11

## Run during development

```powershell
cd HubLens.Net
dotnet run --project src/HubLens.Desktop
```

This opens a native HubLens window (no browser tab needed).

You can also run the web host only:

```powershell
dotnet run --project src/HubLens.Web
```

Open http://127.0.0.1:5050

## Build an installable setup

### 1. Publish the desktop app

```powershell
cd HubLens.Net
.\installer\build-installer.ps1
```

This publishes a self-contained app to `dist/app/`.

### 2. Create the installer (optional)

Install [Inno Setup 6](https://jrsoftware.org/isinfo.php), then run `build-installer.ps1` again. It produces:

`dist/installer/HubLens-Setup-1.0.0.exe`

That setup wizard:

- Installs HubLens to `Program Files\HubLens`
- Adds Start Menu shortcut
- Optionally adds a desktop shortcut
- Registers an uninstaller

### Manual publish (without installer)

```powershell
dotnet publish src/HubLens.Desktop -c Release -r win-x64 --self-contained true -o ./dist/app
./dist/app/HubLens.exe
```

## What is implemented

- Native desktop window with embedded UI
- ZIP upload ingest with streaming CSV support (50 MB+ files)
- Project, service, product, and evidence import
- 8-module maturity scoring from `config/maturity-rules.yaml`
- Portfolio dashboard with search, status filter, and module heatmap columns
- Project detail with scores, services, and evidence tables
- Automatic SQLite database creation on first run

## Planned next

- Migration portfolio with effort estimates and date filters
- APS OAuth authentication
- Docs inventory scanning via APS API
- Analytics charts and feature-level tables

## Relationship to the Node.js version

The original app lives in `apps/web` (Next.js + PostgreSQL). This .NET desktop version is the path to a **single installable EXE** for consultants.

Both versions share the same `config/maturity-rules.yaml` rules file.
