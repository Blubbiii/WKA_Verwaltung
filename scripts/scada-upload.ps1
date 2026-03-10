# =============================================================================
# SCADA File Upload Script
# Uploads SCADA files from a local folder to the WPM server via API.
# Can run once (manual) or in watch mode (automated).
#
# Usage:
#   .\scada-upload.ps1                          # Interactive mode
#   .\scada-upload.ps1 -WatchFolder "C:\Enercon" -ServerUrl "https://wpm.example.com" -ApiKey "your-key"
#   .\scada-upload.ps1 -WatchFolder "C:\Enercon" -ServerUrl "https://wpm.example.com" -ApiKey "your-key" -Watch
#
# The script expects the Enercon folder structure:
#   C:\Enercon\Loc_5842\2025\01\20250101.wsd
#   C:\Enercon\Loc_5842\2025\01\20250101.uid
# =============================================================================

param(
    [string]$WatchFolder = "",
    [string]$ServerUrl = "",
    [string]$ApiKey = "",
    [switch]$Watch,
    [int]$IntervalMinutes = 30,
    [switch]$TriggerImport,
    [string]$LogFile = ""
)

$ScadaExtensions = @("*.wsd", "*.uid", "*.avr", "*.avw", "*.avm", "*.avy", "*.ssm", "*.swm", "*.pes", "*.pew", "*.pet", "*.wsr", "*.wsw", "*.wsm", "*.wsy")

# Track already uploaded files
$UploadedFiles = @{}
$StateFile = Join-Path $env:LOCALAPPDATA "wpm-scada-upload-state.json"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $line
    }
}

function Load-State {
    if (Test-Path $StateFile) {
        try {
            $state = Get-Content $StateFile -Raw | ConvertFrom-Json
            foreach ($prop in $state.PSObject.Properties) {
                $UploadedFiles[$prop.Name] = $prop.Value
            }
            Write-Log "Loaded state: $($UploadedFiles.Count) previously uploaded files"
        } catch {
            Write-Log "Could not load state file, starting fresh" "WARN"
        }
    }
}

function Save-State {
    try {
        $UploadedFiles | ConvertTo-Json -Depth 1 | Set-Content $StateFile
    } catch {
        Write-Log "Could not save state file: $_" "WARN"
    }
}

function Find-LocationFolders {
    param([string]$BasePath)
    Get-ChildItem -Path $BasePath -Directory -Filter "Loc_*" -ErrorAction SilentlyContinue
}

function Find-ScadaFiles {
    param([string]$LocationPath)
    $files = @()
    foreach ($ext in $ScadaExtensions) {
        $files += Get-ChildItem -Path $LocationPath -Recurse -Filter $ext -File -ErrorAction SilentlyContinue
    }
    return $files
}

function Upload-Files {
    param(
        [string]$LocationCode,
        [System.IO.FileInfo[]]$Files
    )

    if ($Files.Count -eq 0) { return }

    # Filter out already uploaded files
    $newFiles = @()
    foreach ($f in $Files) {
        $key = "$($f.FullName)|$($f.Length)|$($f.LastWriteTime.Ticks)"
        if (-not $UploadedFiles.ContainsKey($key)) {
            $newFiles += $f
        }
    }

    if ($newFiles.Count -eq 0) {
        Write-Log "$LocationCode : No new files to upload"
        return
    }

    Write-Log "$LocationCode : Uploading $($newFiles.Count) new files..."

    # Upload in batches of 50 to avoid overwhelming the server
    $batchSize = 50
    $totalUploaded = 0

    for ($i = 0; $i -lt $newFiles.Count; $i += $batchSize) {
        $batch = $newFiles[$i..([Math]::Min($i + $batchSize - 1, $newFiles.Count - 1))]

        try {
            $boundary = [System.Guid]::NewGuid().ToString()
            $LF = "`r`n"
            $bodyLines = @()

            # Add locationCode field
            $bodyLines += "--$boundary"
            $bodyLines += "Content-Disposition: form-data; name=`"locationCode`"$LF"
            $bodyLines += $LocationCode

            # Add each file
            foreach ($file in $batch) {
                $fileBytes = [System.IO.File]::ReadAllBytes($file.FullName)
                $fileEnc = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileBytes)

                $bodyLines += "--$boundary"
                $bodyLines += "Content-Disposition: form-data; name=`"files`"; filename=`"$($file.Name)`""
                $bodyLines += "Content-Type: application/octet-stream$LF"
                $bodyLines += $fileEnc
            }
            $bodyLines += "--$boundary--$LF"

            $body = $bodyLines -join $LF

            $headers = @{
                "Authorization" = "Bearer $ApiKey"
            }

            $response = Invoke-RestMethod `
                -Uri "$ServerUrl/api/energy/scada/n8n/upload" `
                -Method POST `
                -ContentType "multipart/form-data; boundary=$boundary" `
                -Body ([System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($body)) `
                -Headers $headers `
                -TimeoutSec 120

            $totalUploaded += $response.saved

            # Mark files as uploaded
            foreach ($file in $batch) {
                $key = "$($file.FullName)|$($file.Length)|$($file.LastWriteTime.Ticks)"
                $UploadedFiles[$key] = (Get-Date -Format "o")
            }

            Write-Log "$LocationCode : Batch uploaded - $($response.saved) saved, $($response.skipped) skipped (server-side duplicates)"
        }
        catch {
            Write-Log "$LocationCode : Upload error: $($_.Exception.Message)" "ERROR"
        }
    }

    Write-Log "$LocationCode : Total $totalUploaded new files uploaded"
    Save-State
}

function Trigger-Import {
    param([string]$LocationCode)

    Write-Log "$LocationCode : Triggering import..."
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type"  = "application/json"
        }
        $body = @{ locationCode = $LocationCode } | ConvertTo-Json

        $response = Invoke-RestMethod `
            -Uri "$ServerUrl/api/energy/scada/n8n/trigger" `
            -Method POST `
            -Headers $headers `
            -Body $body `
            -TimeoutSec 60

        $started = ($response.imports | Where-Object { $_.status -eq "STARTED" }).Count
        $running = ($response.imports | Where-Object { $_.status -eq "ALREADY_RUNNING" }).Count
        Write-Log "$LocationCode : Import triggered - $started started, $running already running"
    }
    catch {
        Write-Log "$LocationCode : Import trigger error: $($_.Exception.Message)" "ERROR"
    }
}

function Run-UploadCycle {
    Write-Log "=== Starting upload cycle ==="

    $locations = Find-LocationFolders -BasePath $WatchFolder
    if ($locations.Count -eq 0) {
        Write-Log "No Loc_* folders found in $WatchFolder" "WARN"
        return
    }

    Write-Log "Found $($locations.Count) location(s): $($locations.Name -join ', ')"

    foreach ($loc in $locations) {
        $files = Find-ScadaFiles -LocationPath $loc.FullName
        if ($files.Count -gt 0) {
            Upload-Files -LocationCode $loc.Name -Files $files

            if ($TriggerImport) {
                Trigger-Import -LocationCode $loc.Name
            }
        } else {
            Write-Log "$($loc.Name) : No SCADA files found"
        }
    }

    Write-Log "=== Upload cycle complete ==="
}

# =============================================================================
# Main
# =============================================================================

# Interactive prompts if params not provided
if (-not $WatchFolder) {
    $WatchFolder = Read-Host "SCADA-Quellordner (z.B. C:\Enercon)"
}
if (-not $ServerUrl) {
    $ServerUrl = Read-Host "Server-URL (z.B. https://wpm.example.com)"
}
if (-not $ApiKey) {
    $ApiKey = Read-Host "API-Key (SCADA_API_KEY)"
}

# Remove trailing slash from ServerUrl
$ServerUrl = $ServerUrl.TrimEnd("/")

if (-not (Test-Path $WatchFolder)) {
    Write-Log "Ordner nicht gefunden: $WatchFolder" "ERROR"
    exit 1
}

Load-State

if ($Watch) {
    Write-Log "Watch-Modus gestartet. Intervall: $IntervalMinutes Minuten. Ctrl+C zum Beenden."
    while ($true) {
        Run-UploadCycle
        Write-Log "Naechster Durchlauf in $IntervalMinutes Minuten..."
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }
} else {
    Run-UploadCycle
    Write-Log "Fertig. Verwende -Watch fuer automatischen Dauerbetrieb."
}
