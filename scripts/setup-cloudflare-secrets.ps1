param(
    [string]$AccountId = "ceb1135dafe0e460664a18b2df6fb4ee",
    [string]$WranglerConfig = "$env:APPDATA\xdg.config\.wrangler\config\default.toml"
)

$ErrorActionPreference = "Stop"

$configText = Get-Content $WranglerConfig -Raw
if ($configText -notmatch 'oauth_token\s*=\s*"([^"]+)"') {
    throw "Cloudflare oauth_token not found. Run: npx wrangler login"
}

$token = $Matches[1]
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{
    name = "ipl-github-actions"
    policies = @(
        @{
            effect = "allow"
            resources = @{
                "com.cloudflare.api.account.$AccountId" = "*"
            }
            permission_groups = @(
                @{ id = "82e914fa8399478cdaafaed6dd16f358" }
                @{ id = "c8fed203ed3043cba062a4461bcb3ee5" }
            )
        }
    )
} | ConvertTo-Json -Depth 6

$created = Invoke-RestMethod -Method Post -Uri "https://api.cloudflare.com/client/v4/user/tokens" -Headers $headers -Body $body -TimeoutSec 60
if (-not $created.success) {
    throw "Failed to create Cloudflare API token: $($created.errors | ConvertTo-Json)"
}

$apiToken = $created.result.value
gh secret set CLOUDFLARE_API_TOKEN --body $apiToken --repo mnsrkhatuev-web/ipl-site
gh workflow run deploy-oauth.yml --repo mnsrkhatuev-web/ipl-site
Write-Host "Done. Workflow deploy-oauth.yml triggered." -ForegroundColor Green
