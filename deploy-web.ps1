# deploy-web.ps1 - one-command web deploy of Shake Work Off to GitHub Pages (snake.skillmake.ru).
# ASCII only (PowerShell 5.1 corrupts .ps1 with Cyrillic and no BOM).
#
# Usage (from the snake-game folder):
#   .\deploy-web.ps1
#
# Prerequisites that live OUTSIDE git (must exist on this machine):
#   1. snake-game\.env.local  - 4 public EXPO_PUBLIC_* keys (Supabase URL/anon + PostHog key/host).
#      Without it the prod bundle loses multiplayer + analytics. NEVER commit this file.
#   2. ..\SECRETS.local.md     - contains the GitHub PAT (ghp_...) used to push gh-pages.
#   3. Node.js + npm installed, dependencies installed (npm install).
#
# What it does: expo export -> add CNAME/.nojekyll/privacy.html -> scan bundle for private
# keys (aborts on hit) -> force-push dist to the gh-pages branch. Deploys the CURRENT HEAD.

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
Set-Location $repo

# Node in PATH (installer location on Windows).
if (Test-Path "$env:ProgramFiles\nodejs\node.exe") { $env:Path = "$env:ProgramFiles\nodejs;" + $env:Path }

# --- Preconditions ---------------------------------------------------------
if (-not (Test-Path "$repo\.env.local")) {
  Write-Host "STOP: .env.local not found. The prod bundle would ship without Supabase/PostHog keys" -ForegroundColor Red
  Write-Host "      (multiplayer + analytics dead). Copy .env.local to this machine first." -ForegroundColor Red
  exit 1
}
$secrets = Join-Path (Split-Path $repo -Parent) 'SECRETS.local.md'
if (-not (Test-Path $secrets)) { Write-Host "STOP: ..\SECRETS.local.md not found (needs the GitHub PAT)." -ForegroundColor Red; exit 1 }
$pat = (Select-String -Path $secrets -Pattern 'ghp_[A-Za-z0-9]+' -AllMatches | ForEach-Object { $_.Matches } | Select-Object -First 1).Value
if (-not $pat) { Write-Host "STOP: no ghp_ token found in SECRETS.local.md." -ForegroundColor Red; exit 1 }

$head = (git rev-parse --short HEAD).Trim()
Write-Host "Deploying HEAD $head to gh-pages..." -ForegroundColor Cyan

# Warn (don't block) if working tree is dirty - you deploy exactly what's checked out.
if (git status --porcelain) { Write-Host "NOTE: working tree has uncommitted changes - they WILL be included in the build." -ForegroundColor Yellow }

# --- Build -----------------------------------------------------------------
$env:CI = '1'
if (Test-Path "$repo\dist") { Remove-Item "$repo\dist" -Recurse -Force }
npx expo export -p web
if ($LASTEXITCODE -ne 0) { Write-Host "STOP: expo export failed." -ForegroundColor Red; exit 1 }

# --- gh-pages artifacts ----------------------------------------------------
Set-Content -Path "$repo\dist\CNAME" -Value 'snake.skillmake.ru' -Encoding ascii -NoNewline
New-Item -ItemType File -Path "$repo\dist\.nojekyll" -Force | Out-Null
Copy-Item "$repo\web\privacy.html" "$repo\dist\privacy.html" -Force

# --- Secret scan (abort on any private key in the shipped bundle) -----------
$all = (Get-ChildItem "$repo\dist" -Recurse -Include *.js,*.html | ForEach-Object { Get-Content $_.FullName -Raw }) -join ' '
$bad = @('service_role','sbp_','ghp_','sk_live','SUPABASE_MGMT','MOONSHOT_API','GROQ_API_KEY')
$found = $bad | Where-Object { $all -match $_ }
if ($found) { Write-Host "STOP: private key pattern in bundle: $($found -join ', ')" -ForegroundColor Red; exit 1 }
if (-not ($all -match 'supabase\.co')) { Write-Host "WARN: Supabase URL missing from bundle - .env.local may not have loaded." -ForegroundColor Yellow }
Write-Host "Bundle scan clean (public Supabase/PostHog keys are expected)." -ForegroundColor Green

# --- Publish (force push dist to gh-pages) ---------------------------------
Push-Location "$repo\dist"
try {
  if (Test-Path .git) { Remove-Item .git -Recurse -Force }
  git init -q
  git checkout -q -B gh-pages
  git add -A
  git -c user.name="Vladimir Shurdis" -c user.email="v925619714@gmail.com" commit -q -m "Deploy web from $head"
  git push -f "https://$pat@github.com/v925619714-droid/snake-game.git" gh-pages:gh-pages
  if ($LASTEXITCODE -ne 0) { Write-Host "STOP: push to gh-pages failed." -ForegroundColor Red; exit 1 }
} finally { Pop-Location }

Write-Host "Deployed HEAD $head -> https://snake.skillmake.ru/ (GitHub Pages rebuilds in ~30-60s)." -ForegroundColor Green
