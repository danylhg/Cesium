[CmdletBinding()]
param(
  [ValidatePattern("^[A-Za-z0-9._-]+$")]
  [string]$StreamKey = "obs-01",

  [int]$Port = 1935,

  [string]$ProjectRoot = "",

  [string]$PublicBaseUrl = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Join-Path $PSScriptRoot ".."
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

if ([string]::IsNullOrWhiteSpace($PublicBaseUrl)) {
  $PublicBaseUrl = "http://localhost:3000/Operaciones/runtime/ffmpeg-streams"
}

$bridgeScript = Join-Path $PSScriptRoot "start_ffmpeg_drone_hls.ps1"
$registerScript = Join-Path $ProjectRoot "Operaciones\api\scripts\register_external_recordings.js"
$recordingRoot = Join-Path $ProjectRoot "Operaciones\runtime\ffmpeg-recordings"
$recordingSourceDir = Join-Path $recordingRoot $StreamKey
$ffprobePath = Join-Path $ProjectRoot "tools\ffmpeg\ffprobe.exe"
$inputUrl = "rtmp://0.0.0.0:$Port/live/$StreamKey"

function Test-LocalPortInUse {
  param([int]$PortToCheck)

  $pattern = "^\s*TCP\s+\S+:$PortToCheck\s+"
  return [bool](& netstat -ano 2>$null | Select-String -Pattern $pattern -Quiet)
}

while ($true) {
  if (Test-LocalPortInUse -PortToCheck $Port) {
    Write-Host "El puerto $Port ya esta ocupado. Si OBS ya funciona, este segundo listener queda en espera."
    Start-Sleep -Seconds 5
    continue
  }

  Write-Host "OBS RTMP listo para recibir:"
  Write-Host "  Server:     rtmp://IP_DE_TU_PC:$Port/live"
  Write-Host "  Stream Key: $StreamKey"
  Write-Host "  Salida:     240p @ 15fps"
  Write-Host ""

  & $bridgeScript `
    -Listen `
    -InputUrl $inputUrl `
    -StreamKey $StreamKey `
    -ProjectRoot $ProjectRoot `
    -PublicBaseUrl $PublicBaseUrl `
    -PreserveExistingHls `
    -RecordMp4Segments `
    -RecordingOutputRoot $recordingRoot `
    -RecordingSegmentSeconds 10 `
    -VideoHeight 240 `
    -VideoFps 15 `
    -VideoBitrate "450k" `
    -VideoMaxrate "550k" `
    -VideoBufsize "900k" `
    -AudioBitrate "64k"

  if (Test-Path -LiteralPath $registerScript) {
    Write-Host "Importando grabaciones RTMP al historial de la operacion..."
    & node $registerScript `
      --external-device-id $StreamKey `
      --source-dir $recordingSourceDir `
      --segment-ms 10000 `
      --ffprobe-path $ffprobePath
  }

  Write-Host ""
  Write-Host "OBS se desconecto o FFmpeg termino. Reiniciando listener en 2 segundos..."
  Start-Sleep -Seconds 2
}
