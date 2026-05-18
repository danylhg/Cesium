[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputUrl,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9._-]+$")]
  [string]$StreamKey,

  [string]$ProjectRoot = "",
  [string]$FfmpegPath = "",
  [string]$OutputRoot = "",
  [string]$PublicBaseUrl = "",
  [switch]$Listen,
  [switch]$CopyCodecs,
  [int]$HlsTime = 1,
  [int]$HlsListSize = 6
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Join-Path $PSScriptRoot ".."
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

if ([string]::IsNullOrWhiteSpace($FfmpegPath)) {
  $localFfmpeg = Join-Path $ProjectRoot "tools\ffmpeg\ffmpeg.exe"
  if (Test-Path -LiteralPath $localFfmpeg) {
    $FfmpegPath = $localFfmpeg
  } else {
    $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpegCommand) {
      $FfmpegPath = $ffmpegCommand.Source
    }
  }
}

if ([string]::IsNullOrWhiteSpace($FfmpegPath) -or -not (Test-Path -LiteralPath $FfmpegPath)) {
  throw "No se encontro ffmpeg.exe. Ejecuta uy\setup_proyecto.bat o uy\ensure_ffmpeg.ps1 primero."
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $ProjectRoot "Operaciones\runtime\ffmpeg-streams"
}

if ([string]::IsNullOrWhiteSpace($PublicBaseUrl)) {
  $PublicBaseUrl = "http://localhost:3000/Operaciones/runtime/ffmpeg-streams"
}

$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$outputDir = Join-Path $OutputRoot $StreamKey
$playlistPath = Join-Path $outputDir "index.m3u8"
$segmentPattern = Join-Path $outputDir "seg_%05d.ts"
$playbackUrl = $PublicBaseUrl.TrimEnd("/") + "/$StreamKey/index.m3u8"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Get-ChildItem -LiteralPath $outputDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in ".m3u8", ".ts", ".tmp" } |
  Remove-Item -Force

Write-Host "FFmpeg HLS para stream: $StreamKey"
Write-Host "Entrada: $InputUrl"
if ($Listen) {
  Write-Host "Modo escucha: configura el dron/app para publicar en esa URL."
  Write-Host "FFmpeg escucha una entrada por proceso; usa otro puerto para otro dron."
}
Write-Host "Playback HLS: $playbackUrl"
Write-Host ""
Write-Host "Para registrarlo en la API usa playback_url con ese HLS."
Write-Host ""

$ffmpegArgs = @(
  "-hide_banner",
  "-loglevel", "info",
  "-analyzeduration", "1000000",
  "-probesize", "1000000"
)

if ($Listen) {
  $ffmpegArgs += @("-listen", "1")
}

$ffmpegArgs += @(
  "-i", $InputUrl,
  "-map", "0:v:0",
  "-map", "0:a?"
)

if ($CopyCodecs) {
  $ffmpegArgs += @("-c", "copy")
} else {
  $ffmpegArgs += @(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-pix_fmt", "yuv420p",
    "-g", "30",
    "-keyint_min", "30",
    "-sc_threshold", "0",
    "-c:a", "aac"
  )
}

$ffmpegArgs += @(
  "-f", "hls",
  "-hls_time", [string]$HlsTime,
  "-hls_list_size", [string]$HlsListSize,
  "-hls_flags", "delete_segments+omit_endlist+independent_segments",
  "-hls_segment_filename", $segmentPattern,
  $playlistPath
)

& $FfmpegPath @ffmpegArgs
