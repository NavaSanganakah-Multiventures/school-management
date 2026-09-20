# pull-kv-secrets.ps1
# Cloudflare CONFIG_KV namespace से सभी secrets पढ़कर local .dev.vars में लिखता है।
# इससे wrangler dev --local में सभी APIs (Razorpay, FCM, Email, आदि) बिना error के test होंगी।
#
# उपयोग:  .\scripts\pull-kv-secrets.ps1
# पहले यह `npx wrangler login` चलाएगा (browser खुलेगा), फिर स्वतः secrets import करेगा।

$ErrorActionPreference = "Stop"
$namespaceId = "393901911be84d558822c78070a82e94"
$projectRoot = Split-Path -Parent $PSScriptRoot
$devVarsPath = Join-Path $projectRoot ".dev.vars"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  KV Secrets -> local .dev.vars import script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# --- Step 0: backup existing .dev.vars ---
if (Test-Path $devVarsPath) {
    $backupPath = "$devVarsPath.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
    Copy-Item $devVarsPath $backupPath -Force
    Write-Host "`n[0] Existing .dev.vars backed up to: $backupPath" -ForegroundColor Green
}

# --- Step 1: wrangler login ---
Write-Host "`n[1] Cloudflare login (browser खुलेगा, login complete करें)..." -ForegroundColor Yellow
& npx wrangler login
if ($LASTEXITCODE -ne 0) {
    Write-Host "Login failed. कृपया दोबारा कोशिश करें।" -ForegroundColor Red
    exit 1
}
Write-Host "Login successful!" -ForegroundColor Green

# --- Step 2: list all KV keys ---
Write-Host "`n[2] KV keys list हो रही है..." -ForegroundColor Yellow
$keysRaw = & npx wrangler kv key list --namespace-id=$namespaceId --remote 2>&1 | Out-String
# wrangler के stderr warnings हटाकर सिर्फ JSON लो
$jsonStart = $keysRaw.IndexOf('[')
if ($jsonStart -lt 0) {
    Write-Host "KV list खाली या त्रुटि। Output:" -ForegroundColor Red
    Write-Host $keysRaw
    exit 1
}
$keysJson = $keysRaw.Substring($jsonStart)
$keysJson = $keysJson.Substring(0, $keysJson.LastIndexOf(']') + 1)
$keys = $keysJson | ConvertFrom-Json

if (-not $keys -or $keys.Count -eq 0) {
    Write-Host "KV namespace में कोई key नहीं मिली।" -ForegroundColor Yellow
    exit 0
}

Write-Host "Found $($keys.Count) keys in CONFIG_KV." -ForegroundColor Green

# --- Step 3: read each key value ---
Write-Host "`n[3] प्रत्येक key का value पढ़ा जा रहा है..." -ForegroundColor Yellow
$entries = @()
foreach ($key in $keys) {
    $keyName = $key.name
    Write-Host "  -> $keyName" -NoNewline
    $value = & npx wrangler kv key get --namespace-id=$namespaceId --remote --text $keyName 2>$null | Out-String
    if ($null -ne $value -and $value.Trim() -ne "") {
        $entries += [PSCustomObject]@{ Key = $keyName; Value = $value.TrimEnd("`r","`n") }
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " (empty/skipped)" -ForegroundColor DarkGray
    }
}

# --- Step 4: write to .dev.vars ---
Write-Host "`n[4] .dev.vars में लिखा जा रहा है..." -ForegroundColor Yellow
$lines = @()
foreach ($entry in $entries) {
    $v = $entry.Value
    # JSON या multiline values को single-quote में wrap करें
    if ($v -match "[\r\n]" -or $v.StartsWith("{") -or $v.StartsWith("[")) {
        # single quotes बचाएँ (PowerShell here-string नहीं, सीधे .env format)
        $v = "'" + ($v -replace "'", "''") + "'"
    }
    $lines += "$($entry.Key)=$v"
}
$lines | Set-Content -Path $devVarsPath -Encoding utf8

Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  Done! $($entries.Count) secrets .dev.vars में सहेजे गए।" -ForegroundColor Green
Write-Host "  Keys: $($entries.Key -join ', ')" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "`nअब `npx wrangler dev --local --port 8787` रन करें — सभी APIs तैयार हैं।" -ForegroundColor Cyan
