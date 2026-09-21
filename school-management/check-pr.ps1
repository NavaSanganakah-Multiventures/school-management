$maxRetries = 30
$delaySeconds = 30

for ($i = 0; $i -lt $maxRetries; $i++) {
    Write-Host "Checking PR status... (Attempt $($i+1)/$maxRetries)"
    
    $output = gh pr checks
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host "All checks passed!"
        exit 0
    }

    # Check if there are any failed checks
    if ($output -match "fail") {
        Write-Host "Some checks failed!"
        gh pr checks
        exit 1
    }

    Write-Host "Checks are still pending. Waiting $delaySeconds seconds..."
    Start-Sleep -Seconds $delaySeconds
}

Write-Host "Timed out waiting for checks."
exit 2
