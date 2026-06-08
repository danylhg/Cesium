#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

INPUT_URL=""
STREAM_KEY=""
PROJECT_ROOT=""
FFMPEG_PATH=""
OUTPUT_ROOT=""
RECORDING_OUTPUT_ROOT=""
PUBLIC_BASE_URL=""
LISTEN=0
COPY_CODECS=0
PRESERVE_EXISTING_HLS=0
RECORD_MP4_SEGMENTS=0
HLS_TIME=1
HLS_LIST_SIZE=6
RECORDING_SEGMENT_SECONDS=10
VIDEO_HEIGHT=240
VIDEO_FPS=15
VIDEO_BITRATE="450k"
VIDEO_MAXRATE="550k"
VIDEO_BUFSIZE="900k"
AUDIO_BITRATE="64k"

usage() {
  cat >&2 <<'USAGE'
Uso:
  start_ffmpeg_drone_hls.sh --input-url URL --stream-key KEY [opciones]

Opciones:
  --listen
  --project-root RUTA
  --ffmpeg-path RUTA
  --output-root RUTA
  --recording-output-root RUTA
  --public-base-url URL
  --copy-codecs
  --preserve-existing-hls
  --record-mp4-segments
  --hls-time SEGUNDOS
  --hls-list-size N
  --recording-segment-seconds SEGUNDOS
  --video-height PIXELES
  --video-fps FPS
  --video-bitrate BITRATE
  --video-maxrate BITRATE
  --video-bufsize BITRATE
  --audio-bitrate BITRATE
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input-url|-InputUrl)
      INPUT_URL="${2:-}"
      shift 2
      ;;
    --stream-key|-StreamKey)
      STREAM_KEY="${2:-}"
      shift 2
      ;;
    --project-root|-ProjectRoot)
      PROJECT_ROOT="${2:-}"
      shift 2
      ;;
    --ffmpeg-path|-FfmpegPath)
      FFMPEG_PATH="${2:-}"
      shift 2
      ;;
    --output-root|-OutputRoot)
      OUTPUT_ROOT="${2:-}"
      shift 2
      ;;
    --recording-output-root|-RecordingOutputRoot)
      RECORDING_OUTPUT_ROOT="${2:-}"
      shift 2
      ;;
    --public-base-url|-PublicBaseUrl)
      PUBLIC_BASE_URL="${2:-}"
      shift 2
      ;;
    --listen|-Listen)
      LISTEN=1
      shift
      ;;
    --copy-codecs|-CopyCodecs)
      COPY_CODECS=1
      shift
      ;;
    --preserve-existing-hls|-PreserveExistingHls)
      PRESERVE_EXISTING_HLS=1
      shift
      ;;
    --record-mp4-segments|-RecordMp4Segments)
      RECORD_MP4_SEGMENTS=1
      shift
      ;;
    --hls-time|-HlsTime)
      HLS_TIME="${2:-}"
      shift 2
      ;;
    --hls-list-size|-HlsListSize)
      HLS_LIST_SIZE="${2:-}"
      shift 2
      ;;
    --recording-segment-seconds|-RecordingSegmentSeconds)
      RECORDING_SEGMENT_SECONDS="${2:-}"
      shift 2
      ;;
    --video-height|-VideoHeight)
      VIDEO_HEIGHT="${2:-}"
      shift 2
      ;;
    --video-fps|-VideoFps)
      VIDEO_FPS="${2:-}"
      shift 2
      ;;
    --video-bitrate|-VideoBitrate)
      VIDEO_BITRATE="${2:-}"
      shift 2
      ;;
    --video-maxrate|-VideoMaxrate)
      VIDEO_MAXRATE="${2:-}"
      shift 2
      ;;
    --video-bufsize|-VideoBufsize)
      VIDEO_BUFSIZE="${2:-}"
      shift 2
      ;;
    --audio-bitrate|-AudioBitrate)
      AUDIO_BITRATE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Opcion desconocida: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$INPUT_URL" || -z "$STREAM_KEY" ]]; then
  usage
  exit 2
fi

if [[ ! "$STREAM_KEY" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Stream key invalido: $STREAM_KEY" >&2
  exit 2
fi

if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR/../.."
fi
PROJECT_ROOT="$(cd -- "$PROJECT_ROOT" && pwd)"

if [[ -z "$FFMPEG_PATH" ]]; then
  if [[ -x "$PROJECT_ROOT/tools/ffmpeg/ffmpeg" ]]; then
    FFMPEG_PATH="$PROJECT_ROOT/tools/ffmpeg/ffmpeg"
  elif command -v ffmpeg >/dev/null 2>&1; then
    FFMPEG_PATH="$(command -v ffmpeg)"
  fi
fi

if [[ -z "$FFMPEG_PATH" || ! -x "$FFMPEG_PATH" ]]; then
  echo "No se encontro ffmpeg. Ejecuta Scripts/Linux/setup_proyecto.sh o Scripts/Linux/ensure_ffmpeg.sh primero." >&2
  exit 1
fi

if [[ -z "$OUTPUT_ROOT" ]]; then
  OUTPUT_ROOT="$PROJECT_ROOT/Operaciones/runtime/ffmpeg-streams"
fi

if [[ -z "$RECORDING_OUTPUT_ROOT" ]]; then
  RECORDING_OUTPUT_ROOT="$PROJECT_ROOT/Operaciones/runtime/ffmpeg-recordings"
fi

if [[ -z "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="http://localhost:3000/Operaciones/runtime/ffmpeg-streams"
fi

OUTPUT_ROOT="$(realpath -m "$OUTPUT_ROOT")"
OUTPUT_DIR="$OUTPUT_ROOT/$STREAM_KEY"
PLAYLIST_PATH="$OUTPUT_DIR/index.m3u8"
SEGMENT_PATTERN="$OUTPUT_DIR/seg_%05d.ts"
PLAYBACK_URL="${PUBLIC_BASE_URL%/}/$STREAM_KEY/index.m3u8"
RECORDING_ROOT="$(realpath -m "$RECORDING_OUTPUT_ROOT")"
RECORDING_DIR="$RECORDING_ROOT/$STREAM_KEY/$(date +%Y%m%d_%H%M%S)"
RECORDING_PATTERN="$RECORDING_DIR/segment_%05d.mp4"

mkdir -p -- "$OUTPUT_DIR"

if [[ "$PRESERVE_EXISTING_HLS" -eq 1 ]]; then
  find "$OUTPUT_DIR" -maxdepth 1 -type f -name "*.tmp" -delete 2>/dev/null || true
else
  find "$OUTPUT_DIR" -maxdepth 1 -type f \( -name "*.m3u8" -o -name "*.ts" -o -name "*.tmp" \) -delete 2>/dev/null || true
fi

echo "FFmpeg HLS para stream: $STREAM_KEY"
echo "Entrada: $INPUT_URL"
if [[ "$LISTEN" -eq 1 ]]; then
  echo "Modo escucha: configura el dron/app para publicar en esa URL."
  echo "FFmpeg escucha una entrada por proceso; usa otro puerto para otro dron."
fi
echo "Playback HLS: $PLAYBACK_URL"
if [[ "$RECORD_MP4_SEGMENTS" -eq 1 ]]; then
  mkdir -p -- "$RECORDING_DIR"
  echo "Grabacion MP4: $RECORDING_PATTERN"
fi
echo "Salida video: ${VIDEO_HEIGHT}p @ ${VIDEO_FPS}fps, bitrate $VIDEO_BITRATE"
echo
echo "Para registrarlo en la API usa playback_url con ese HLS."
echo

GOP_SIZE=$(( VIDEO_FPS * HLS_TIME ))
if [[ "$GOP_SIZE" -lt 1 ]]; then
  GOP_SIZE=1
fi

VIDEO_FILTER="scale=-2:${VIDEO_HEIGHT},fps=${VIDEO_FPS}"
VIDEO_TRANSCODE_ARGS=(
  -vf "$VIDEO_FILTER"
  -c:v libx264
  -preset veryfast
  -tune zerolatency
  -pix_fmt yuv420p
  -b:v "$VIDEO_BITRATE"
  -maxrate "$VIDEO_MAXRATE"
  -bufsize "$VIDEO_BUFSIZE"
  -r "$VIDEO_FPS"
  -g "$GOP_SIZE"
  -keyint_min "$GOP_SIZE"
  -sc_threshold 0
)

if [[ "$COPY_CODECS" -eq 1 ]]; then
  AUDIO_CODEC_ARGS=(-c:a copy)
else
  AUDIO_CODEC_ARGS=(-c:a aac -b:a "$AUDIO_BITRATE")
fi

FFMPEG_ARGS=(
  -hide_banner
  -loglevel info
  -analyzeduration 1000000
  -probesize 1000000
)

if [[ "$LISTEN" -eq 1 ]]; then
  FFMPEG_ARGS+=(-listen 1)
fi

FFMPEG_ARGS+=(
  -i "$INPUT_URL"
  -map 0:v:0
  -map "0:a?"
)

FFMPEG_ARGS+=("${VIDEO_TRANSCODE_ARGS[@]}")
FFMPEG_ARGS+=("${AUDIO_CODEC_ARGS[@]}")

FFMPEG_ARGS+=(
  -f hls
  -hls_time "$HLS_TIME"
  -hls_list_size "$HLS_LIST_SIZE"
  -hls_flags delete_segments+omit_endlist+independent_segments
  -hls_segment_filename "$SEGMENT_PATTERN"
  "$PLAYLIST_PATH"
)

if [[ "$RECORD_MP4_SEGMENTS" -eq 1 ]]; then
  FFMPEG_ARGS+=(
    -map 0:v:0
    -map "0:a?"
  )
  FFMPEG_ARGS+=("${VIDEO_TRANSCODE_ARGS[@]}")
  FFMPEG_ARGS+=("${AUDIO_CODEC_ARGS[@]}")
  FFMPEG_ARGS+=(
    -avoid_negative_ts make_zero
    -f segment
    -segment_time "$RECORDING_SEGMENT_SECONDS"
    -reset_timestamps 1
    -segment_format mp4
    -segment_format_options movflags=+faststart
    "$RECORDING_PATTERN"
  )
fi

exec "$FFMPEG_PATH" "${FFMPEG_ARGS[@]}"
