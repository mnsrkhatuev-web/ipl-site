#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OAuthDir = Join-Path $ProjectRoot "oauth-proxy"
$ConfigFile = Join-Path $ProjectRoot "admin\config.yml"
$RepoName = "ipl-site"

function Refresh-Path {
    $env:Path = @(
        "$env:ProgramFiles\Git\cmd",
        "$env:ProgramFiles\nodejs",
        "$env:ProgramFiles\GitHub CLI"
    ) -join ";" + $env:Path
}

function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Missing command: $name"
    }
}

function Ensure-GitHubAuth {
    Refresh-Path
    gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "=== GitHub login ===" -ForegroundColor Cyan
        Start-Process "https://github.com/login/device" | Out-Null
        gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow,read:org
    }
}

function Ensure-CloudflareAuth {
    Push-Location $OAuthDir
    try {
        if (-not $env:CLOUDFLARE_API_TOKEN) {
            Write-Host ""
            Write-Host "=== Cloudflare login ===" -ForegroundColor Cyan
            npx wrangler login
        }
    } finally {
        Pop-Location
    }
}

function Get-GitHubUser {
    $login = gh api user -q .login
    $email = gh api user -q .email
    if (-not $email -or $email -eq "null") {
        $email = "$login@users.noreply.github.com"
    }
    return @{
        Login = $login
        Email = $email
    }
}

function Update-Config($username, $workerHost) {
    $content = Get-Content $ConfigFile -Raw -Encoding UTF8
    $content = $content -replace "YOUR_GITHUB_USERNAME", $username
    $content = $content -replace "https://YOUR_OAUTH_WORKER_URL", "https://$workerHost"
    $content = $content -replace '(?m)^#.*YOUR_GITHUB_USERNAME.*\r?\n', ''
    Set-Content -Path $ConfigFile -Value $content.TrimEnd() -Encoding UTF8
}

function Ensure-Repository($username) {
    Push-Location $ProjectRoot
    try {
        $remoteUrl = "https://github.com/$username/$RepoName.git"
        gh repo view "$username/$RepoName" 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Creating public repository $username/$RepoName..." -ForegroundColor Green
            gh repo create $RepoName --public --source . --remote origin --description "IPL Chechnya site"
        } else {
            $origin = git remote get-url origin 2>$null
            if (-not $origin) {
                git remote add origin $remoteUrl
            }
        }

        git add -A
        $status = git status --porcelain
        if ($status) {
            git commit -m "Configure GitHub Pages and Decap CMS"
        }

        git push -u origin main
    } finally {
        Pop-Location
    }
}

function Enable-GitHubPages($username) {
    Write-Host "Enabling GitHub Pages..." -ForegroundColor Green
    gh api "repos/$username/$RepoName/pages" -X POST -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        gh api "repos/$username/$RepoName/pages" -X PUT -f "build_type=legacy" -f "source[branch]=main" -f "source[path]=/" | Out-Null
    }
}

function Deploy-OAuthProxy {
    Push-Location $OAuthDir
    try {
        if (-not (Test-Path "node_modules")) {
            npm install
        }
        npx wrangler deploy
        return "ipl-decap-oauth.workers.dev"
    } finally {
        Pop-Location
    }
}

function Ensure-OAuthApp($username, $workerHost) {
    $homepage = "https://$username.github.io/$RepoName/admin/"
    $callback = "https://$workerHost/callback"

    if ($env:GITHUB_OAUTH_ID -and $env:GITHUB_OAUTH_SECRET) {
        return @{
            ClientId = $env:GITHUB_OAUTH_ID
            ClientSecret = $env:GITHUB_OAUTH_SECRET
        }
    }

    Write-Host "Creating GitHub OAuth App..." -ForegroundColor Green
    $app = gh api user/applications/oauth `
        -f name="IPL Decap CMS" `
        -f url=$homepage `
        -f callback_url=$callback `
        -f description="Decap CMS OAuth for IPL news" | ConvertFrom-Json

    return @{
        ClientId = $app.client_id
        ClientSecret = $app.client_secret
    }
}

function Set-WorkerSecrets($clientId, $clientSecret) {
    Push-Location $OAuthDir
    try {
        $clientId | npx wrangler secret put GITHUB_OAUTH_ID
        $clientSecret | npx wrangler secret put GITHUB_OAUTH_SECRET
    } finally {
        Pop-Location
    }
}

Refresh-Path
Require-Command git
Require-Command node
Require-Command npm
Require-Command gh

Write-Host "=== IPL site setup: GitHub Pages + Decap CMS ===" -ForegroundColor Cyan

Ensure-GitHubAuth
$user = Get-GitHubUser

Push-Location $ProjectRoot
git config user.name $user.Login
git config user.email $user.Email

$commitCount = git rev-list --count HEAD 2>$null
if (-not $commitCount -or $commitCount -eq "0") {
    git add -A
    git commit -m "Initial site with Decap CMS"
}
Pop-Location

Write-Host "GitHub user: $($user.Login)" -ForegroundColor Green

Ensure-CloudflareAuth
$workerHost = Deploy-OAuthProxy
Write-Host "OAuth worker: https://$workerHost" -ForegroundColor Green

$oauth = Ensure-OAuthApp -username $user.Login -workerHost $workerHost
Set-WorkerSecrets -clientId $oauth.ClientId -clientSecret $oauth.ClientSecret

Update-Config -username $user.Login -workerHost $workerHost
Ensure-Repository -username $user.Login
Enable-GitHubPages -username $user.Login

$siteUrl = "https://$($user.Login).github.io/$RepoName"
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Site:  $siteUrl/"
Write-Host "Admin: $siteUrl/admin/"
Write-Host "Add editors in GitHub -> Settings -> Collaborators" -ForegroundColor Yellow
