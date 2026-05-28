$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vendorDir = Join-Path $projectRoot "Operaciones\vendor"
$hlsPath = Join-Path $vendorDir "hls.min.js"

if (Test-Path -LiteralPath $hlsPath) {
  Write-Host "hls.js encontrado: $hlsPath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $vendorDir | Out-Null

Write-Host "Descargando hls.js para reproduccion HLS local ..."
Invoke-WebRequest `
  -Uri "https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js" `
  -OutFile $hlsPath `
  -Headers @{ "User-Agent" = "cesium-proyecto-setup" }

Write-Host "hls.js instalado: $hlsPath"
