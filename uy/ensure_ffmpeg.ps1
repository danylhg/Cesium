param(
  [string]$InstallDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "tools\ffmpeg")
)

$ErrorActionPreference = "Stop"

$exePath = Join-Path $InstallDir "ffmpeg.exe"
if (Test-Path -LiteralPath $exePath) {
  Write-Host "FFmpeg encontrado: $exePath"
  exit 0
}

$pathCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($pathCommand) {
  Write-Host "FFmpeg encontrado en PATH: $($pathCommand.Source)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$zipPath = Join-Path $env:TEMP ("ffmpeg_" + [guid]::NewGuid().ToString("N") + ".zip")
$extractDir = Join-Path $env:TEMP ("ffmpeg_" + [guid]::NewGuid().ToString("N"))
$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "Descargando FFmpeg ..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

$downloadedExe = Get-ChildItem -Path $extractDir -Recurse -Filter "ffmpeg.exe" |
  Where-Object { $_.FullName -match "\\bin\\ffmpeg\.exe$" } |
  Select-Object -First 1

if (-not $downloadedExe) {
  throw "El ZIP descargado no contiene bin\ffmpeg.exe."
}

Copy-Item -LiteralPath $downloadedExe.FullName -Destination $exePath -Force

$ffprobe = Get-ChildItem -Path $extractDir -Recurse -Filter "ffprobe.exe" |
  Where-Object { $_.FullName -match "\\bin\\ffprobe\.exe$" } |
  Select-Object -First 1
if ($ffprobe) {
  Copy-Item -LiteralPath $ffprobe.FullName -Destination (Join-Path $InstallDir "ffprobe.exe") -Force
}

Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "FFmpeg instalado: $exePath"
