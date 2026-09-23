# =============================================================================
# Pragnya Mitra — Android release keystore generator (Super Admin + School apps)
#
# Generates:
#   1. Strong random passwords (RNG-secure) for each app's keystore & key
#   2. upload-keystore.jks for flutter_apps/super_admin_app
#   3. upload-keystore.jks for flutter_apps/school_management_app
#   4. android/key.properties for BOTH apps (local signing config)
#   5. .keystore-backup/keystore-secrets.txt  <- BACKUP THIS FILE OFFLINE!
#
# Usage:  powershell -File scripts/generate-android-keystores.ps1
#
# The .jks files and key.properties are gitignored (android/.gitignore).
# .keystore-backup/ is gitignored at repo root too.
# =============================================================================
$ErrorActionPreference = 'Stop'

$keytool = 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
if (-not (Test-Path $keytool)) {
    # Fallback: search JAVA_HOME / common JDK locations
    $candidates = @(
        "$env:JAVA_HOME\bin\keytool.exe",
        'C:\Program Files\Java\*\bin\keytool.exe'
    )
    foreach ($c in $candidates) {
        $found = Get-ChildItem $c -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $keytool = $found.FullName; break }
    }
}
if (-not (Test-Path $keytool)) {
    Write-Error "keytool not found. Install Android Studio or set JAVA_HOME."
}

function New-Password([int]$length = 32) {
    # Cryptographically-random, human-legible-ish password (no ambiguous chars).
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
    $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
    $bytes = New-Object byte[] $length
    $rng.GetBytes($bytes)
    $sb = [System.Text.StringBuilder]::new()
    foreach ($b in $bytes) { [void]$sb.Append($chars[$b % $chars.Length]) }
    return $sb.ToString()
}

function New-Keystore(
    [string]$path,
    [string]$storePass,
    [string]$alias,
    [string]$keyPass
) {
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    & $keytool -genkeypair -v `
        -keystore $path `
        -storetype PKCS12 `
        -storepass $storePass `
        -alias $alias `
        -keypass $keyPass `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -dname "CN=Pragnya Mitra, OU=School Management, O=Nasven Multiventures, L=India, ST=India, C=IN" `
        | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "keytool failed for $path" }
    Write-Host "[OK] $path (alias=$alias)"
}

# ---- 1. Generate secrets ----
# NOTE: PKCS12 keystores do NOT support a different store/key password —
# keytool silently ignores -keypass. So keyPass = storePass by design.
$admin = @{
    name = 'super_admin_app'
    keystorePass = New-Password
    keyPass = $null   # set after keystorePass
    alias = 'pragnya-admin'
}
$admin.keyPass = $admin.keystorePass
$school = @{
    name = 'school_management_app'
    keystorePass = New-Password
    keyPass = $null
    alias = 'pragnya'
}
$school.keyPass = $school.keystorePass

# ---- 2. Create keystores ----
$adminJks = "C:\Users\DHEERENDRA\Desktop\school-management\flutter_apps\super_admin_app\android\app\upload-keystore.jks"
$schoolJks = "C:\Users\DHEERENDRA\Desktop\school-management\flutter_apps\school_management_app\android\app\upload-keystore.jks"

New-Keystore $adminJks $admin.keystorePass $admin.alias $admin.keyPass
New-Keystore $schoolJks $school.keystorePass $school.alias $school.keyPass

# ---- 3. key.properties (local signing config for gradle) ----
function New-KeyProperties([string]$appDir, [hashtable]$info) {
    $path = Join-Path $appDir 'android\key.properties'
    $lines = @(
        'ANDROID_KEYSTORE=upload-keystore.jks',
        "ANDROID_KEYSTORE_PASSWORD=$($info.keystorePass)",
        "ANDROID_KEY_ALIAS=$($info.alias)",
        "ANDROID_KEY_PASSWORD=$($info.keyPass)"
    )
    Set-Content -Path $path -Value $lines -Encoding ascii
    Write-Host "[OK] $path"
}
New-KeyProperties "C:\Users\DHEERENDRA\Desktop\school-management\flutter_apps\$($admin.name)" $admin
New-KeyProperties "C:\Users\DHEERENDRA\Desktop\school-management\flutter_apps\$($school.name)" $school

# ---- 4. Backup file (OFFLINE BACKUP REQUIRED) ----
$backupDir = "C:\Users\DHEERENDRA\Desktop\school-management\.keystore-backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$backup = Join-Path $backupDir 'keystore-secrets.txt'
$txt = @"
Pragnya Mitra — Android release keystore secrets
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
IMPORTANT: Back these up OFFLINE (password manager / printed copy). Losing them
after Play App Signing means you can never update the app without Play Console
support + Upload Key reset.

[SUPER ADMIN APP]  (flutter_apps/super_admin_app)
  package:   com.nasven.pragnya.admin
  keystore:  flutter_apps/super_admin_app/android/app/upload-keystore.jks
  alias:     $($admin.alias)
  storepass: $($admin.keystorePass)
  keypass:   $($admin.keyPass)

[SCHOOL APP]  (flutter_apps/school_management_app)
  package:   com.nasven.pragnya
  keystore:  flutter_apps/school_management_app/android/app/upload-keystore.jks
  alias:     $($school.alias)
  storepass: $($school.keystorePass)
  keypass:   $($school.keyPass)
"@
Set-Content -Path $backup -Value $txt -Encoding utf8
Write-Host "[OK] $backup  <-- BACKUP THIS OFFLINE NOW"
Write-Host "`nDone. Next: add base64 keystores + passwords to GitHub secrets."