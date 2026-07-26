param(
    [switch]$SkipInstall,
    [int]$ApiPort = 3001,
    [string]$PublicApiUrl,
    [switch]$UseLocalIp
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$easJson = Join-Path $root 'apps\mobile-worker\eas.json'
$adb = Join-Path $root 'tools\platform-tools\adb.exe'
$npxCmdEntry = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
$npxCmd = $null
if ($npxCmdEntry) {
    $npxCmd = $npxCmdEntry.Source
}
if (-not $npxCmd) {
    $npxCmd = 'C:\Users\tomek\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.18.0-win-x64\npx.cmd'
}
if (-not (Test-Path $npxCmd)) {
    throw 'Nie znaleziono npx.cmd. Zainstaluj Node.js LTS i dodaj do PATH.'
}

$nodeDir = Split-Path -Parent $npxCmd
if (-not [string]::IsNullOrWhiteSpace($nodeDir)) {
    $env:Path = "$nodeDir;$env:Path"
}

$eas = Get-Content $easJson -Raw | ConvertFrom-Json
$currentUrl = $eas.build.preview.env.EXPO_PUBLIC_API_URL
$cloudApiUrl = 'https://urlopy-api-622924376884.europe-central2.run.app'

# 1. Ustal URL API dla buildu preview
$apiUrl = $null

if ($PublicApiUrl) {
    $apiUrl = $PublicApiUrl.TrimEnd('/')
    Write-Host "Uzywam publicznego API URL: $apiUrl"
} elseif ($UseLocalIp) {
    # Wykryj IP (Ethernet > Wi-Fi, bez 169.x / Bluetooth / wirtualnych)
    $all = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notmatch '^169\.' -and
        $_.InterfaceAlias -notmatch 'Loopback|Pseudo|Bluetooth|vEthernet|lokalna'
    }
    $eth   = $all | Where-Object { $_.InterfaceAlias -match 'Ethernet' }
    $wifi  = $all | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|WiFi' }
    $other = $all | Where-Object { $_.InterfaceAlias -notmatch 'Ethernet|Wi-Fi|WiFi' }

    $chosen = if ($eth)   { $eth[0] }
              elseif ($wifi) { $wifi[0] }
              elseif ($other) { $other[0] }
              else { $null }

    if (-not $chosen) { throw 'Nie udalo sie wykryc IP. Sprawdz polaczenie sieciowe.' }

    $ip = $chosen.IPAddress
    $apiUrl = "http://${ip}:${ApiPort}"
    Write-Host "Wykryty IP: $ip  ->  API URL: $apiUrl"
} else {
    $apiUrl = $cloudApiUrl
    Write-Host "Tryb cloud: wymuszam API URL: $apiUrl"
}

# 2. Zaktualizuj eas.json tylko jesli URL sie zmienil
if ($currentUrl -eq $apiUrl) {
    Write-Host "eas.json aktualny ($apiUrl), brak zmian."
} else {
    Write-Host "Aktualizuje eas.json: $currentUrl -> $apiUrl"
    $eas.build.preview.env.EXPO_PUBLIC_API_URL = $apiUrl
    $eas | ConvertTo-Json -Depth 10 | Set-Content $easJson -Encoding UTF8
}

# 3. EAS Build
Push-Location (Join-Path $root 'apps\mobile-worker')
try {
    & $npxCmd --yes eas-cli build --platform android --profile preview --non-interactive
    if ($LASTEXITCODE -ne 0) { throw "EAS build zakonczony bledem (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

if ($SkipInstall) { Write-Host "Pominieto instalacje."; exit 0 }

# 4. Pobierz URL najnowszego buildu
Push-Location (Join-Path $root 'apps\mobile-worker')
try {
    $listRaw = & $npxCmd --yes eas-cli build:list --platform android --limit 1 --status FINISHED --json --non-interactive 2>$null
    $builds  = $listRaw | ConvertFrom-Json
} finally {
    Pop-Location
}

$apkUrl  = $builds[0].artifacts.buildUrl
$buildId = $builds[0].id.Substring(0, 8)

if (-not $apkUrl) { Write-Warning "Brak URL APK. Zainstaluj recznie z expo.dev."; exit 0 }

$outDir  = Join-Path $root 'tmp'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$apkPath = Join-Path $outDir "urlopy-worker-${buildId}.apk"

Write-Host "Pobieranie APK..."
Invoke-WebRequest -Uri $apkUrl -OutFile $apkPath
Write-Host "Pobrano: $apkPath"

if (-not (Test-Path $adb)) { Write-Warning "Brak ADB. Zainstaluj APK recznie."; exit 0 }

& $adb start-server | Out-Null
if (-not (& $adb devices | Select-String '\tdevice$')) {
    Write-Warning "Brak urzadzenia ADB. Zainstaluj APK recznie."; exit 0
}

if (& $adb shell pm list packages com.urlopy.worker | Select-String 'com\.urlopy\.worker') {
    Write-Host "Odinstalowuje poprzednia wersje..."
    & $adb uninstall com.urlopy.worker
}

Write-Host "Instaluje nowy APK..."
& $adb install $apkPath
& $adb logcat -c
Write-Host "Uruchamiam aplikacje..."
& $adb shell monkey -p com.urlopy.worker -c android.intent.category.LAUNCHER 1
Write-Host ""
Write-Host "Gotowe! API: $apiUrl"
