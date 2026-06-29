param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$appOutput = Join-Path $root "dist\app"
$installerOutput = Join-Path $root "dist\installer"

Write-Host "> Publishing HubLens desktop app..."
dotnet publish (Join-Path $root "src\HubLens.Desktop\HubLens.Desktop.csproj") `
    -c $Configuration `
    -r $Runtime `
    --self-contained true `
    -p:PublishSingleFile=false `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $appOutput

$innoCandidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)

$iscc = $innoCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    Write-Host ""
    Write-Host "Published app to: $appOutput"
    Write-Host "Inno Setup was not found. Install it from https://jrsoftware.org/isinfo.php"
    Write-Host "Then run: `"$($innoCandidates[0])`" `"$(Join-Path $root 'installer\HubLens.iss')`""
    exit 0
}

Write-Host "> Building installer..."
New-Item -ItemType Directory -Force -Path $installerOutput | Out-Null
& $iscc (Join-Path $root "installer\HubLens.iss")

Write-Host ""
Write-Host "Installer ready in: $installerOutput"
