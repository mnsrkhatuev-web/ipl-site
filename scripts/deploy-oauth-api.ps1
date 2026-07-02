param(
    [string]$AccountId = "ceb1135dafe0e460664a18b2df6fb4ee",
    [string]$ScriptName = "ipl-decap-oauth",
    [string]$WorkerFile = (Join-Path $PSScriptRoot "..\oauth-proxy\worker.js"),
    [string]$WranglerConfig = "$env:APPDATA\xdg.config\.wrangler\config\default.toml"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $WranglerConfig)) {
    throw "Wrangler config not found. Run: npx wrangler login"
}

$configText = Get-Content $WranglerConfig -Raw
if ($configText -notmatch 'oauth_token\s*=\s*"([^"]+)"') {
    throw "Cloudflare oauth_token not found in wrangler config"
}
$token = $Matches[1]

$headers = @{
    Authorization = "Bearer $token"
}

function Invoke-CfApi {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null,
        [string]$ContentType = "application/json"
    )

    $params = @{
        Method = $Method
        Uri = $Uri
        Headers = $headers
        TimeoutSec = 120
    }

    if ($null -ne $Body) {
        if ($ContentType -eq "application/json") {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = $ContentType
        } else {
            $params.Body = $Body
            $params.ContentType = $ContentType
        }
    }

    return Invoke-RestMethod @params
}

Write-Host "Uploading worker script..." -ForegroundColor Cyan
$scriptBody = Get-Content $WorkerFile -Raw -Encoding UTF8
$uploadUri = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$ScriptName"
$upload = Invoke-WebRequest -Method Put -Uri $uploadUri -Headers $headers -ContentType "application/javascript+module" -Body $scriptBody -TimeoutSec 120
if ($upload.StatusCode -lt 200 -or $upload.StatusCode -ge 300) {
    throw "Worker upload failed: $($upload.StatusCode)"
}

Write-Host "Enabling workers.dev subdomain..." -ForegroundColor Cyan
try {
    Invoke-CfApi -Method Post -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/subdomain" -Body @{ enabled = $true } | Out-Null
} catch {
    Write-Host "Subdomain may already be enabled." -ForegroundColor Yellow
}

Write-Host "Binding script to workers.dev..." -ForegroundColor Cyan
try {
    Invoke-CfApi -Method Post -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$ScriptName/subdomain" -Body @{ preview_urls_enabled = $false } | Out-Null
} catch {
    Write-Host "Subdomain binding step skipped or already configured." -ForegroundColor Yellow
}

$whoami = Invoke-CfApi -Method Get -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/subdomain"
$subdomain = $whoami.result.subdomain
$workerUrl = "https://$ScriptName.$subdomain.workers.dev"

Write-Host ""
Write-Host "Worker deployed: $workerUrl" -ForegroundColor Green
Write-Host $workerUrl
