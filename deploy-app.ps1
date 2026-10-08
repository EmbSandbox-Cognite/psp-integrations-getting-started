<#
.SYNOPSIS
    Deploys the monitoring app to the CDF project in your .env file and prints the link to open it.

.DESCRIPTION
    First it points the app at the project in .env (the deploy command takes its target from the
    app's app.json, not from .env), then installs the app's dependencies the first time, then runs
    `npx @cognite/cli@latest apps deploy --interactive`. That opens a browser for you to sign in,
    and prints a link to the app when it is done - click it to open the app in Fusion.

    This deploys the app so you can open it from the printed link. It does not activate it in
    the Custom apps dashboard: that needs signatures from a certified Flows developer and a
    certified app (https://docs.cognite.com/cdf/flows/guides/builder-certification and
    https://docs.cognite.com/cdf/flows/guides/application-certification).

.EXAMPLE
    .\deploy-app.ps1
#>
$ErrorActionPreference = "Stop"

# Read .env (the same file run-extractor.ps1 uses) for the project to deploy to.
$settings = @{}
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=][^=]*)=(.*)$') { $settings[$matches[1].Trim()] = $matches[2].Trim() }
    }
}

$project = $settings["CDF_PROJECT"]
$baseUrl = $settings["CDF_URL"]
if (-not $baseUrl -and $settings["CDF_CLUSTER"]) { $baseUrl = "https://$($settings['CDF_CLUSTER']).cognitedata.com" }
if (-not $project -or -not $baseUrl) {
    throw "CDF_PROJECT and CDF_URL (or CDF_CLUSTER) must be set in .env. Copy the .env file from your sandbox image repo into this folder."
}

# Point app.json at the project in .env. The Fusion organization is not in .env either - it is the
# first part of the app's address, https://<organization>.fusion.cognite.com - so this prints it.
Push-Location $PSScriptRoot
try {
    $organization = (uv run python -m helpers.app_target 2>$null | Select-Object -Last 1)
    $lookupFailed = ($LASTEXITCODE -ne 0)
}
finally {
    Pop-Location
}
if ($lookupFailed -or -not $organization) {
    throw "Could not look up the Fusion organization of project '$project'. Check that the values in .env work."
}
$organization = $organization.Trim()

Write-Host "Deploying to project '$project' in organization '$organization' ($baseUrl)"

Push-Location (Join-Path $PSScriptRoot "apps\integrations-monitoring")
try {
    if (-not (Test-Path "node_modules")) {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
    }
    # -d 0 selects the deployment that was just updated, so there is nothing to choose in a prompt.
    npx --yes @cognite/cli@latest apps deploy --interactive -d 0 --project $project --base-url $baseUrl --org $organization
}
finally {
    Pop-Location
}
