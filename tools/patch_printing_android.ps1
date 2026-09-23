# Patches the `printing` pub package's Android build.gradle so its hardcoded
# compileSdk (30) / minSdk (16) meet the requirements of the current Flutter
# engine embedding (compileSdk >= 34) and androidx.core 1.13+ (minSdk >= 23).
#
# Why: printing 5.13.1 is the newest version compatible with this project's
# Firebase/web dependency lock (>=5.13.2 needs web ^1.0.0), but its Android
# plugin still targets SDK 30. Without this patch the Gradle task
# `:printing:checkDebugAarMetadata` fails the whole APK build.
#
# The patch is idempotent and safe to re-run after every `flutter pub get`.
#
# Usage (repo root):
#   Windows:  powershell -ExecutionPolicy Bypass -File tools\patch_printing_android.ps1
#   CI/Linux: pwsh tools/patch_printing_android.ps1

$ErrorActionPreference = 'Stop'

# ---- 1) Locate the pub cache ------------------------------------------------
# NOTE: in PowerShell 7+ (case-insensitive) `$IsWindows` is a READ-ONLY
# automatic variable, so use a different name (`$winHost`) or the assignment
# fails with "Cannot overwrite variable IsWindows because it is read-only or
# constant." (Windows PowerShell 5.1 has no $IsWindows at all, so it seemed
# fine locally -- CI on pwsh 7 exposed the collision.)
$winHost = ($env:OS -eq 'Windows_NT') -or ([bool]$IsWindows)
if ($env:PUB_CACHE) {
    $pubCache = $env:PUB_CACHE
} elseif ($winHost) {
    $pubCache = Join-Path $env:LOCALAPPDATA 'Pub\Cache'
} else {
    $pubCache = Join-Path $HOME '.pub-cache'
}
$hostedDir = Join-Path $pubCache (Join-Path 'hosted' 'pub.dev')

# ---- 2) Resolve the locked printing version from pubspec.lock ---------------
# The script can be invoked from the repo root (tools\patch_printing_android.ps1)
# or from inside the app dir (pwsh ../../tools/patch_printing_android.ps1, as the
# release CI does), so probe every plausible location for pubspec.lock.
$lockCandidates = @(
    (Join-Path $PSScriptRoot (Join-Path '..' (Join-Path 'flutter_apps' (Join-Path 'school_management_app' 'pubspec.lock')))),
    (Join-Path $PSScriptRoot (Join-Path '..' (Join-Path 'school_management_app' 'pubspec.lock'))),
    (Join-Path (Get-Location) (Join-Path 'flutter_apps' (Join-Path 'school_management_app' 'pubspec.lock')))
)
$lockPath = $lockCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$version = $null
if (Test-Path $lockPath) {
    $lines = Get-Content $lockPath
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\s{2}printing:\s*$') {
            for ($j = $i; $j -lt [Math]::Min($i + 8, $lines.Count); $j++) {
                if ($lines[$j] -match '^\s+version:\s*"([^"]+)"') {
                    $version = $Matches[1]
                    break
                }
            }
            break
        }
    }
}
if (-not $version) {
    Write-Warning 'Could not parse printing version from pubspec.lock; defaulting to 5.13.1'
    $version = '5.13.1'
}

# ---- 3) Patch android/build.gradle ------------------------------------------
$pkgDir = Join-Path $hostedDir "printing-$version"
$gradle = Join-Path $pkgDir (Join-Path 'android' 'build.gradle')
if (-not (Test-Path $gradle)) {
    Write-Warning "printing android build.gradle not found at $gradle -- run 'flutter pub get' first (or clear your dart pub cache)."
    exit 1
}

$content = Get-Content $gradle -Raw
$original = $content
$content = $content -replace 'compileSdkVersion\s+30', 'compileSdkVersion 36'
$content = $content -replace 'minSdkVersion\s+16', 'minSdkVersion 23'

if ($content -ne $original) {
    Set-Content -Path $gradle -Value $content -NoNewline
    Write-Host "Patched printing-$version/android/build.gradle -> compileSdk 36, minSdk 23"
} else {
    Write-Host "printing-$version/android/build.gradle already patched -- nothing to do"
}