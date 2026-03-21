# ─── Publish Desktop App to Server ─────────────────────────
# Usage: .\scripts\publish-desktop.ps1 -Server user@your-server-ip
#
# This script:
# 1. Builds the web app (bundled into the desktop app)
# 2. Builds the Windows desktop installer
# 3. Uploads installers to the server (replacing old versions)
# 4. Uploads auto-update manifest (latest.yml)

param(
    [Parameter(Mandatory=$true)]
    [string]$Server
)

$ErrorActionPreference = "Stop"

$ReleaseDir = "apps\desktop\release"
$Version = (Get-Content "apps\desktop\package.json" | ConvertFrom-Json).version
$RemoteDownloads = "/opt/jablu/downloads"
$RemoteUpdates = "/opt/jablu/updates"

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Publishing Jablu Desktop v$Version"       -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build web app
Write-Host "-> Building web app..." -ForegroundColor Yellow
pnpm --filter @chat/web build
if ($LASTEXITCODE -ne 0) { throw "Web build failed" }

# Step 2: Build desktop app
Write-Host "-> Compiling desktop app..." -ForegroundColor Yellow
pnpm --filter @chat/desktop build
if ($LASTEXITCODE -ne 0) { throw "Desktop compile failed" }

Write-Host "-> Packaging Windows installer..." -ForegroundColor Yellow
pnpm --filter @chat/desktop dist -- --win
if ($LASTEXITCODE -ne 0) { throw "Installer build failed" }

Write-Host ""
Write-Host "-> Built artifacts:" -ForegroundColor Yellow
Get-ChildItem "$ReleaseDir\*" -Include "*.exe","*.yml","*.blockmap" | ForEach-Object {
    Write-Host ("  {0}  ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB))
}

# Step 3: Clean old files on server and upload new ones
Write-Host ""
Write-Host "-> Cleaning old downloads on server..." -ForegroundColor Yellow
ssh $Server "rm -f ${RemoteDownloads}/Jablu*.exe ${RemoteDownloads}/Jablu*.dmg ${RemoteDownloads}/Jablu*.AppImage"
ssh $Server "mkdir -p ${RemoteDownloads} ${RemoteUpdates}"

Write-Host "-> Uploading installer..." -ForegroundColor Yellow
$exeFiles = Get-ChildItem "$ReleaseDir\*.exe" -ErrorAction SilentlyContinue
foreach ($f in $exeFiles) {
    scp $f.FullName "${Server}:${RemoteDownloads}/"
    Write-Host "  + $($f.Name) -> downloads/" -ForegroundColor Green
    scp $f.FullName "${Server}:${RemoteUpdates}/"
    Write-Host "  + $($f.Name) -> updates/" -ForegroundColor Green
}

Write-Host "-> Uploading update manifest..." -ForegroundColor Yellow
$ymlFiles = Get-ChildItem "$ReleaseDir\latest*.yml" -ErrorAction SilentlyContinue
foreach ($f in $ymlFiles) {
    scp $f.FullName "${Server}:${RemoteUpdates}/"
    Write-Host "  + $($f.Name) -> updates/" -ForegroundColor Green
}

$blockmapFiles = Get-ChildItem "$ReleaseDir\*.blockmap" -ErrorAction SilentlyContinue
foreach ($f in $blockmapFiles) {
    scp $f.FullName "${Server}:${RemoteUpdates}/"
    Write-Host "  + $($f.Name) -> updates/" -ForegroundColor Green
}

Write-Host ""
Write-Host "══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Jablu Desktop v$Version published!"       -ForegroundColor Green
Write-Host "══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Users will see the download in Settings > Desktop App"
Write-Host "Existing desktop users will auto-update within 4 hours"
Write-Host ""
