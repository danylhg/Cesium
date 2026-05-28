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
  [string]$RecordingOutputRoot = "",
  [string]$PublicBaseUrl = "",
  [switch]$Listen,
  [switch]$CopyCodecs,
  [switch]$PreserveExistingHls,
  [switch]$RecordMp4Segments,
  [int]$HlsTime = 1,
  [int]$HlsListSize = 6,
  [int]$RecordingSegmentSeconds = 10,
  [int]$VideoHeight = 240,
  [int]$VideoFps = 15,
  [string]$VideoBitrate = "450k",
  [string]$VideoMaxrate = "550k",
  [string]$VideoBufsize = "900k",
  [string]$AudioBitrate = "64k"
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

if ([string]::IsNullOrWhiteSpace($RecordingOutputRoot)) {
  $RecordingOutputRoot = Join-Path $ProjectRoot "Operaciones\runtime\ffmpeg-recordings"
}

if ([string]::IsNullOrWhiteSpace($PublicBaseUrl)) {
  $PublicBaseUrl = "http://localhost:3000/Operaciones/runtime/ffmpeg-streams"
}

$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$outputDir = Join-Path $OutputRoot $StreamKey
$playlistPath = Join-Path $outputDir "index.m3u8"
$segmentPattern = Join-Path $outputDir "seg_%05d.ts"
$playbackUrl = $PublicBaseUrl.TrimEnd("/") + "/$StreamKey/index.m3u8"
$recordingRoot = [System.IO.Path]::GetFullPath($RecordingOutputRoot)
$recordingDir = Join-Path (Join-Path $recordingRoot $StreamKey) (Get-Date -Format "yyyyMMdd_HHmmss")
$recordingPattern = Join-Path $recordingDir "segment_%05d.mp4"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

if ($PreserveExistingHls) {
  Get-ChildItem -LiteralPath $outputDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -eq ".tmp" } |
    Remove-Item -Force
} else {
  Get-ChildItem -LiteralPath $outputDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in ".m3u8", ".ts", ".tmp" } |
    Remove-Item -Force
}

Write-Host "FFmpeg HLS para stream: $StreamKey"
Write-Host "Entrada: $InputUrl"
if ($Listen) {
  Write-Host "Modo escucha: configura el dron/app para publicar en esa URL."
  Write-Host "FFmpeg escucha una entrada por proceso; usa otro puerto para otro dron."
}
Write-Host "Playback HLS: $playbackUrl"
if ($RecordMp4Segments) {
  New-Item -ItemType Directory -Force -Path $recordingDir | Out-Null
  Write-Host "Grabacion MP4: $recordingPattern"
}
Write-Host "Salida video: ${VideoHeight}p @ ${VideoFps}fps, bitrate $VideoBitrate"
Write-Host ""
Write-Host "Para registrarlo en la API usa playback_url con ese HLS."
Write-Host ""

$gopSize = [Math]::Max(1, $VideoFps * $HlsTime)
$videoFilter = "scale=-2:${VideoHeight},fps=${VideoFps}"
$audioCodecArgs = if ($CopyCodecs) {
  @("-c:a", "copy")
} else {
  @("-c:a", "aac", "-b:a", $AudioBitrate)
}
$videoTranscodeArgs = @(
  "-vf", $videoFilter,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-tune", "zerolatency",
  "-pix_fmt", "yuv420p",
  "-b:v", $VideoBitrate,
  "-maxrate", $VideoMaxrate,
  "-bufsize", $VideoBufsize,
  "-r", [string]$VideoFps,
  "-g", [string]$gopSize,
  "-keyint_min", [string]$gopSize,
  "-sc_threshold", "0"
)

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

$ffmpegArgs += $videoTranscodeArgs
$ffmpegArgs += $audioCodecArgs

$ffmpegArgs += @(
  "-f", "hls",
  "-hls_time", [string]$HlsTime,
  "-hls_list_size", [string]$HlsListSize,
  "-hls_flags", "delete_segments+omit_endlist+independent_segments",
  "-hls_segment_filename", $segmentPattern,
  $playlistPath
)

if ($RecordMp4Segments) {
  $ffmpegArgs += @(
    "-map", "0:v:0",
    "-map", "0:a?"
  )
  $ffmpegArgs += $videoTranscodeArgs
  $ffmpegArgs += $audioCodecArgs
  $ffmpegArgs += @(
    "-avoid_negative_ts", "make_zero",
    "-f", "segment",
    "-segment_time", [string]$RecordingSegmentSeconds,
    "-reset_timestamps", "1",
    "-segment_format", "mp4",
    "-segment_format_options", "movflags=+faststart",
    $recordingPattern
  )
}

& $FfmpegPath @ffmpegArgs
