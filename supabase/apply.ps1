# Idempotent apply of supabase/profiles.sql to the Supabase project via the Management API.
# profiles.sql is the single source of truth for the schema (create-if-not-exists,
# add-column-if-not-exists, create-or-replace). Re-running is safe.
#
# Usage:
#   $env:SUPABASE_MGMT_TOKEN = "sbp_..."        # Management API token
#   $env:SUPABASE_PROJECT_REF = "onzvotuggzfqwixuqcfz"
#   pwsh supabase/apply.ps1
#
# Keep secrets out of git: pass them via environment (locally from SECRETS.local.md,
# in CI from GitHub Actions encrypted secrets).
param(
  [string]$Token = $env:SUPABASE_MGMT_TOKEN,
  [string]$Ref = $env:SUPABASE_PROJECT_REF
)

if (-not $Token) { Write-Error "Set SUPABASE_MGMT_TOKEN"; exit 1 }
if (-not $Ref)   { Write-Error "Set SUPABASE_PROJECT_REF"; exit 1 }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$sqlPath = Join-Path $PSScriptRoot 'profiles.sql'
$sql = Get-Content $sqlPath -Raw -Encoding UTF8
$body = @{ query = $sql } | ConvertTo-Json
$uri = "https://api.supabase.com/v1/projects/$Ref/database/query"

try {
  Invoke-RestMethod -Uri $uri -Method Post -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json' -Body $body -TimeoutSec 90 | Out-Null
  # ask PostgREST to reload its schema cache (new/changed RPC signatures)
  $reload = @{ query = "notify pgrst, 'reload schema';" } | ConvertTo-Json
  Invoke-RestMethod -Uri $uri -Method Post -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json' -Body $reload -TimeoutSec 30 | Out-Null
  Write-Host "Applied profiles.sql to $Ref + reloaded PostgREST schema."
} catch {
  Write-Error "Apply failed: $($_.Exception.Message) :: $($_.ErrorDetails.Message)"
  exit 1
}
