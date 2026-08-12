$ErrorActionPreference = "Stop"

$webRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $webRoot ".env.local"
$supabaseUrl = "https://gfpfdhvojvfgmdcnreud.supabase.co"

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)
  return [System.Net.NetworkCredential]::new("", $Value).Password
}

function Read-RequiredSecret {
  param([string]$Prompt)
  while ($true) {
    $value = ConvertFrom-SecureValue (Read-Host $Prompt -AsSecureString)
    if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    Write-Host "A value is required." -ForegroundColor Yellow
  }
}

function New-RandomSecret {
  param([int]$ByteCount = 48)
  $bytes = [byte[]]::new($ByteCount)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Format-EnvValue {
  param([string]$Value)
  $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
  return '"' + $escaped + '"'
}

Write-Host "Mario Personal Content Engine - secure local setup" -ForegroundColor Cyan
Write-Host "Values entered here are written only to web/.env.local and are never printed."

$supabaseKey = Read-RequiredSecret "Paste the Supabase sb_secret key"
if (-not ($supabaseKey.StartsWith("sb_secret_") -or $supabaseKey.StartsWith("eyJ"))) {
  throw "That does not look like a Supabase secret or legacy service-role key."
}

$dashboardPassword = Read-RequiredSecret "Choose the private dashboard password (12+ characters)"
if ($dashboardPassword.Length -lt 12) {
  throw "The dashboard password must contain at least 12 characters. Run this setup again."
}

$openAiKey = ConvertFrom-SecureValue (Read-Host "Paste an OpenAI API key, or press Enter to configure it later" -AsSecureString)
$sessionSecret = New-RandomSecret
$ingestionSecret = New-RandomSecret

$lines = @(
  "SUPABASE_URL=$(Format-EnvValue $supabaseUrl)",
  "SUPABASE_SECRET_KEY=$(Format-EnvValue $supabaseKey)",
  "DASHBOARD_PASSWORD=$(Format-EnvValue $dashboardPassword)",
  "DASHBOARD_SESSION_SECRET=$(Format-EnvValue $sessionSecret)",
  "INGESTION_SECRET=$(Format-EnvValue $ingestionSecret)",
  "OPENAI_API_KEY=$(Format-EnvValue $openAiKey)",
  'OPENAI_MODEL="gpt-5-mini"'
)

$headers = @{ apikey = $supabaseKey }
if (-not $supabaseKey.StartsWith("sb_secret_")) {
  $headers.Authorization = "Bearer $supabaseKey"
}

try {
  $null = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/dashboard_saved_posts?select=id&limit=1" -Headers $headers -UserAgent "mario-content-engine-server/1.0"
  [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host "Live Supabase connection verified." -ForegroundColor Green
  Write-Host "Local secrets saved to web/.env.local." -ForegroundColor Green
  if ([string]::IsNullOrWhiteSpace($openAiKey)) {
    Write-Host "OpenAI generation remains disabled until OPENAI_API_KEY is added." -ForegroundColor Yellow
  }
} catch {
  throw "Supabase verification failed. No environment file was written: $($_.Exception.Message)"
}
