#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
VENDOR_DIR="$PROJECT_ROOT/Operaciones/vendor"
HLS_PATH="$VENDOR_DIR/hls.min.js"
HLS_URL="https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js"

if [[ -f "$HLS_PATH" ]]; then
  echo "hls.js encontrado: $HLS_PATH"
  exit 0
fi

mkdir -p -- "$VENDOR_DIR"

echo "Descargando hls.js para reproduccion HLS local ..."
if command -v curl >/dev/null 2>&1; then
  curl -fL --retry 3 -A "cesium-proyecto-setup" -o "$HLS_PATH" "$HLS_URL"
elif command -v wget >/dev/null 2>&1; then
  wget --user-agent="cesium-proyecto-setup" -O "$HLS_PATH" "$HLS_URL"
else
  echo "No se encontro curl ni wget para descargar hls.js." >&2
  exit 1
fi

echo "hls.js instalado: $HLS_PATH"
