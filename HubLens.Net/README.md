# HubLens (.NET)

Native **.NET 8** rewrite of HubLens — a local ACC/BIM 360 maturity dashboard with a single executable, embedded **SQLite** database, and no Node.js or PostgreSQL dependency.

## Architecture

| Project | Role |
|---------|------|
| `HubLens.Core` | Maturity scoring engine, ACC CSV conventions, shared parsers |
| `HubLens.Data` | EF Core + SQLite entities |
| `HubLens.Ingest` | ZIP extraction, streaming CSV import, batch scoring |
| `HubLens.Web` | Blazor Server UI (dashboard, upload, project detail) |

Data is stored in:

`%LOCALAPPDATA%\HubLens\hublens.db`

The app listens on **http://127.0.0.1:5050**.

## Requirements

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

## Run locally

```powershell
cd HubLens.Net
dotnet restore
dotnet run --project src/HubLens.Web
```

Open http://127.0.0.1:5050

## Publish a standalone EXE

```powershell
cd HubLens.Net
dotnet publish src/HubLens.Web -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./publish
```

Run:

```powershell
./publish/HubLens.exe
```

This produces a single-folder deployment suitable for wrapping in an **MSI** (WiX, Inno Setup, or MSIX Packaging Tool).

## What is implemented

- ZIP upload ingest with streaming CSV support (50 MB+ files)
- Project, service, product, and evidence import
- 8-module maturity scoring from `config/maturity-rules.yaml`
- Portfolio dashboard with search, status filter, and module heatmap columns
- Project detail with scores, services, and evidence tables
- Automatic SQLite database creation on first run

## Planned next (from Node version)

- Migration portfolio with effort estimates and date filters
- APS OAuth authentication
- Docs inventory scanning via APS API
- Analytics charts and feature-level tables

## Relationship to the Node.js version

The original app lives in `apps/web` (Next.js + PostgreSQL). This .NET version is a **parallel rewrite** focused on:

- Single EXE / MSI deployment
- No external database install
- Native Autodesk/.NET stack alignment

Both versions share the same `config/maturity-rules.yaml` rules file.
