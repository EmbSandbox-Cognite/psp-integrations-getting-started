<#
.SYNOPSIS
    Loads real environment variables from .env and runs the Cognite DB extractor
    against the psp_pump_feed integration.

.DESCRIPTION
    The extractor binary does not read .env - that is a python-dotenv convention
    our own scripts use. The extractor only substitutes ${VAR} in its YAML from
    real OS environment variables, so this script loads .env into the process
    environment before launching it.

    The deployed integration config sets `extractor: { mode: continuous }`, so one
    invocation stays running and repeats the `pump_readings` query on its own
    `schedule:` - this script does not loop it. Without that setting a single
    invocation extracts once and then idles.

.PARAMETER ConnectionConfig
    Path to the extractor's connection config, relative to the repo root. Defaults to
    extractor\connection.yaml, which holds no secrets - only references to the
    environment variables this script loads from .env.

.EXAMPLE
    .\run-extractor.ps1
#>
[CmdletBinding()]
param(
    [string]$ConnectionConfig = "extractor\connection.yaml"
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

# --- Load .env into real process environment variables ---
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
    throw ".env not found at $envFile. Copy .env.example to .env and fill it in first."
}

$loaded = 0
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        $loaded++
    }
}
Write-Host "Loaded $loaded variables from $envFile"

# --- Locate the extractor binary ---
$exe = Get-ChildItem -Path (Join-Path $repoRoot "extractor") -Filter "dbextractor-standalone-*.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $exe) {
    throw "No dbextractor-standalone-*.exe found in .\extractor. Download it from Fusion > Integrate > Integrations > Pump house feed and place it there."
}

$connectionPath = Join-Path $repoRoot $ConnectionConfig
if (-not (Test-Path $connectionPath)) {
    throw "$ConnectionConfig not found. It is part of the repository - restore it with git."
}

Write-Host "Extractor : $($exe.Name)"
Write-Host "Connection: $connectionPath"
Write-Host "Running continuously. Close this window or Ctrl+C to stop."

# Run with the repo root as the working directory, since the deployed config's
# source path (./data/pump_readings.csv) is relative to it.
Push-Location $repoRoot
try {
    & $exe.FullName -c $connectionPath -l info
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Extractor exited with code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
