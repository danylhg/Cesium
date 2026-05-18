param(
  [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
  $InstallDir = Join-Path (Split-Path -Parent $PSScriptRoot) "tools\mediamtx"
}

$exePath = Join-Path $InstallDir "mediamtx.exe"
if (Test-Path -LiteralPath $exePath) {
  Write-Host "MediaMTX encontrado: $exePath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$headers = @{ "User-Agent" = "cesium-proyecto-setup" }
$release = Invoke-RestMethod `
  -Uri "https://api.github.com/repos/bluenviron/mediamtx/releases/latest" `
  -Headers $headers

$asset = $release.assets |
  Where-Object { $_.name -match "windows_amd64\.zip$" } |
  Select-Object -First 1

if (-not $asset) {
  throw "No se encontro asset windows_amd64.zip en el ultimo release de MediaMTX."
}

$zipPath = Join-Path $env:TEMP $asset.name
$extractDir = Join-Path $env:TEMP ("mediamtx_" + [guid]::NewGuid().ToString("N"))

Write-Host "Descargando MediaMTX $($release.tag_name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath -Headers $headers

New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

$downloadedExe = Get-ChildItem -Path $extractDir -Recurse -Filter "mediamtx.exe" |
  Select-Object -First 1

if (-not $downloadedExe) {
  throw "El ZIP descargado no contiene mediamtx.exe."
}

Copy-Item -LiteralPath $downloadedExe.FullName -Destination $exePath -Force

$defaultConfig = Get-ChildItem -Path $extractDir -Recurse -Filter "mediamtx.yml" |
  Select-Object -First 1
if ($defaultConfig) {
  Copy-Item `
    -LiteralPath $defaultConfig.FullName `
    -Destination (Join-Path $InstallDir "mediamtx.default.yml") `
    -Force
}

Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "MediaMTX instalado: $exePath"
