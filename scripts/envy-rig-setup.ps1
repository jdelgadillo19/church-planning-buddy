# Grapevine Rig — HP Envy TE01 setup helper
# Run in PowerShell on the presentation rig (Windows 10/11).
# Usage: powershell -ExecutionPolicy Bypass -File envy-rig-setup.ps1

$ErrorActionPreference = "Stop"
$RigVersion = "0.2.7"
$ReleaseTag = "grapevine-rig-v$RigVersion"
$Repo = "jdelgadillo19/church-planning-buddy"
$InstallerName = "Grapevine-Rig-$RigVersion-windows-setup.exe"
$DownloadDir = Join-Path $env:USERPROFILE "Downloads"
$InstallerPath = Join-Path $DownloadDir $InstallerName
$ApiUrl = "https://api.github.com/repos/$Repo/releases/tags/$ReleaseTag"

Write-Host ""
Write-Host "=== Grapevine Rig setup (HP Envy) ===" -ForegroundColor Cyan
Write-Host "Target version: $RigVersion"
Write-Host ""

# 1. Node.js (required for Apply / Scan workers)
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Yellow
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "  FAIL: Node.js not found on PATH." -ForegroundColor Red
    Write-Host "  Install Node.js 20 LTS from https://nodejs.org then re-run this script."
    Write-Host "  Grapevine Rig needs node for Apply and Scan."
    exit 1
}
$nodeVer = & node -v
Write-Host "  OK: $nodeVer at $($nodeCmd.Source)" -ForegroundColor Green
$major = [int]($nodeVer -replace 'v(\d+)\..*', '$1')
if ($major -lt 20) {
    Write-Host "  WARN: Node 20+ recommended (found $nodeVer)." -ForegroundColor DarkYellow
}

# 2. ProPresenter reminder
Write-Host ""
Write-Host "[2/4] ProPresenter checklist..." -ForegroundColor Yellow
Write-Host "  - ProPresenter must be installed and licensed"
Write-Host "  - Settings -> Network -> Enable Network ON"
Write-Host "  - Note the TCP/IP Port ID for Grapevine Rig settings"
Write-Host "  (This script cannot verify ProPresenter automatically.)"

# 3. Download installer
Write-Host ""
Write-Host "[3/4] Downloading $InstallerName..." -ForegroundColor Yellow
try {
    $release = Invoke-RestMethod -Uri $ApiUrl -Headers @{ "User-Agent" = "grapevine-rig-setup" }
    $asset = $release.assets | Where-Object { $_.name -eq $InstallerName } | Select-Object -First 1
    if (-not $asset) {
        $names = ($release.assets | ForEach-Object { $_.name }) -join ", "
        throw "Asset '$InstallerName' not found. Available: $names"
    }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $InstallerPath -UseBasicParsing
    Write-Host "  OK: Saved to $InstallerPath" -ForegroundColor Green
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Manual download: https://github.com/$Repo/releases/tag/$ReleaseTag"
    exit 1
}

# 4. Launch installer + pairing instructions
Write-Host ""
Write-Host "[4/4] Launching installer..." -ForegroundColor Yellow
Start-Process -FilePath $InstallerPath -Wait

Write-Host ""
Write-Host "=== After install ===" -ForegroundColor Cyan
Write-Host "1. Open Grapevine Rig from the Start menu"
Write-Host "2. On https://grapevineprep.com (admin): Slide deck -> Presentation rigs -> Add presentation rig"
Write-Host "3. Enter the 8-character code + display name (e.g. HP Envy TE01) -> Pair"
Write-Host "4. ProPresenter settings: TCP port from PP Network panel -> Save"
Write-Host "5. Click Scan now (uploads library index)"
Write-Host "6. Dry run: planner Send to rig -> rig Apply Slide Deck"
Write-Host ""
Write-Host "Pairing credentials: Windows Credential Manager (service com.grapevineprep.rig)"
Write-Host "Drive publish after apply is skipped on Windows (apply still works)."
Write-Host ""
Write-Host "Full doc: church-planning-buddy/docs/INSTALL-GRAPEVINE-RIG.md"
Write-Host ""
