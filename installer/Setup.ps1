param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$projectPath = Join-Path $repoRoot "apps\desktop-admin-csharp\DesktopAdmin\DesktopAdmin.csproj"
$publishDir = Join-Path $scriptDir "output\publish"
$outputDir = Join-Path $scriptDir "output"
$issPath = Join-Path $scriptDir "SystemUrlopowyCamino_UpdateBackup.iss"
$logPath = Join-Path $scriptDir "isscc_build.txt"

[xml]$projectXml = Get-Content -Path $projectPath
$appVersion = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($appVersion)) {
    throw "Nie znaleziono Version w pliku csproj: $projectPath"
}

if (Test-Path $publishDir) {
    Remove-Item $publishDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $publishDir | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$publishCommand = @(
    "publish",
    $projectPath,
    "-c", $Configuration,
    "-r", $Runtime,
    "--self-contained", "true",
    "/p:PublishSingleFile=false",
    "/p:PublishReadyToRun=true",
    "-o", $publishDir
)

"[$(Get-Date -Format s)] dotnet $($publishCommand -join ' ')" | Set-Content -Path $logPath -Encoding UTF8
& dotnet @publishCommand | Tee-Object -FilePath $logPath -Append

$publishedExe = Join-Path $publishDir "SystemUrlopowyCamino.exe"
if (-not (Test-Path $publishedExe)) {
    throw "Brak pliku po publish: $publishedExe"
}

$fileVersion = (Get-Item $publishedExe).VersionInfo.FileVersion
"[$(Get-Date -Format s)] publish exe version: $fileVersion" | Tee-Object -FilePath $logPath -Append

if ($SkipInstaller) {
    Write-Host "Publish gotowy: $publishDir"
    exit 0
}

$isccPaths = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
)

$iscc = $isccPaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
    Write-Warning "Nie znaleziono ISCC.exe. Zainstaluj Inno Setup 6 albo uruchom z parametrem -SkipInstaller."
    exit 0
}

$isccArgs = @(
    "/DMyAppVersion=$appVersion",
    "/DMyAppSourceDir=$publishDir",
    "/DMyAppOutputDir=$outputDir",
    $issPath
)

& $iscc @isccArgs | Tee-Object -FilePath $logPath -Append
Write-Host "Instalator gotowy w: $outputDir"