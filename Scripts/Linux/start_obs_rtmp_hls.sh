#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STREAM_KEY="obs-01"
PORT=1935
PROJECT_ROOT=""
PUBLIC_BASE_URL=""

usage() {
  cat >&2 <<'USAGE'
Uso:
  start_obs_rtmp_hls.sh [--stream-key KEY] [--port PUERTO] [--project-root RUTA] [--public-base-url URL]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream-key|-StreamKey)
      STREAM_KEY="${2:-}"
      shift 2
      ;;
    --port|-Port)
      PORT="${2:-}"
      shift 2
      ;;
    --project-root|-ProjectRoot)
      PROJECT_ROOT="${2:-}"
      shift 2
      ;;
    --public-base-url|-PublicBaseUrl)
      PUBLIC_BASE_URL="${2:-}"
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

if [[ ! "$STREAM_KEY" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Stream key invalido: $STREAM_KEY" >&2
  exit 2
fi

if [[ -z "$PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$SCRIPT_DIR/../.."
fi
PROJECT_ROOT="$(cd -- "$PROJECT_ROOT" && pwd)"

if [[ -z "$PUBLIC_BASE_URL" ]]; then
  PUBLIC_BASE_URL="http://localhost:3000/Operaciones/runtime/ffmpeg-streams"
fi

BRIDGE_SCRIPT="$SCRIPT_DIR/start_ffmpeg_drone_hls.sh"
REGISTER_SCRIPT="$PROJECT_ROOT/Operaciones/api/scripts/register_external_recordings.js"
RECORDING_ROOT="$PROJECT_ROOT/Operaciones/runtime/ffmpeg-recordings"
RECORDING_SOURCE_DIR="$RECORDING_ROOT/$STREAM_KEY"
FFPROBE_PATH="$PROJECT_ROOT/tools/ffmpeg/ffprobe"
INPUT_URL="rtmp://0.0.0.0:$PORT/live/$STREAM_KEY"

if [[ ! -f "$BRIDGE_SCRIPT" ]]; then
  echo "No se encontro $BRIDGE_SCRIPT" >&2
  exit 1
fi

if [[ ! -x "$FFPROBE_PATH" ]] && command -v ffprobe >/dev/null 2>&1; then
  FFPROBE_PATH="$(command -v ffprobe)"
fi

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -Pn >/dev/null 2>&1
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"
  else
    return 1
  fi
}

while true; do
  if port_in_use "$PORT"; then
    echo "El puerto $PORT ya esta ocupado. Si OBS ya funciona, este segundo listener queda en espera."
    sleep 5
    continue
  fi

  echo "OBS RTMP listo para recibir:"
  echo "  Server:     rtmp://IP_DE_TU_PC:$PORT/live"
  echo "  Stream Key: $STREAM_KEY"
  echo "  Salida:     240p @ 15fps"
  echo

  bash "$BRIDGE_SCRIPT" \
    --listen \
    --input-url "$INPUT_URL" \
    --stream-key "$STREAM_KEY" \
    --project-root "$PROJECT_ROOT" \
    --public-base-url "$PUBLIC_BASE_URL" \
    --preserve-existing-hls \
    --record-mp4-segments \
    --recording-output-root "$RECORDING_ROOT" \
    --recording-segment-seconds 10 \
    --video-height 240 \
    --video-fps 15 \
    --video-bitrate "450k" \
    --video-maxrate "550k" \
    --video-bufsize "900k" \
    --audio-bitrate "64k" || true

  if [[ -f "$REGISTER_SCRIPT" ]]; then
    echo "Importando grabaciones RTMP al historial de la operacion..."
    node "$REGISTER_SCRIPT" \
      --external-device-id "$STREAM_KEY" \
      --source-dir "$RECORDING_SOURCE_DIR" \
      --segment-ms 10000 \
      --ffprobe-path "$FFPROBE_PATH" || true
  fi

  echo
  echo "OBS se desconecto o FFmpeg termino. Reiniciando listener en 2 segundos..."
  sleep 2
done
