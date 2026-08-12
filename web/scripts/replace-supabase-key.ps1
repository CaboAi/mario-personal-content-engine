$ErrorActionPreference = "Stop"

$webRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $webRoot ".env.local"
$supabaseUrl = "https://gfpfdhvojvfgmdcnreud.supabase.co"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "web/.env.local does not exist. Run configure-local.ps1 first."
}

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)
  return [System.Net.NetworkCredential]::new("", $Value).Password
}

Write-Host "Replace Supabase key - existing dashboard and OpenAI settings will be preserved" -ForegroundColor Cyan
$newKey = ConvertFrom-SecureValue (Read-Host "Paste the NEW secret key from project gfpfdhvojvfgmdcnreud" -AsSecureString)
if (-not ($newKey.StartsWith("sb_secret_") -or $newKey.StartsWith("eyJ"))) {
  throw "That does not look like a Supabase secret or legacy service-role key."
}

$headers = @{ apikey = $newKey }
if (-not $newKey.StartsWith("sb_secret_")) {
  $headers.Authorization = "Bearer $newKey"
}

try {
  $null = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/dashboard_saved_posts?select=id&limit=1" -Headers $headers -UserAgent "mario-content-engine-server/1.0"
} catch {
  throw "Supabase rejected this key. The existing environment file was not changed. Confirm the key was created inside project gfpfdhvojvfgmdcnreud."
}

$lines = Get-Content -LiteralPath $envPath
$escaped = $newKey.Replace('\', '\\').Replace('"', '\"')
$replacement = 'SUPABASE_SECRET_KEY="' + $escaped + '"'
$updated = $lines | ForEach-Object {
  if ($_ -match '^SUPABASE_SECRET_KEY=') { $replacement } else { $_ }
}
[IO.File]::WriteAllLines($envPath, $updated, [Text.UTF8Encoding]::new($false))

Write-Host "Live Supabase connection verified." -ForegroundColor Green
Write-Host "Only SUPABASE_SECRET_KEY was updated." -ForegroundColor Green
