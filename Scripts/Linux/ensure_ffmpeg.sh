#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
INSTALL_DIR="$PROJECT_ROOT/tools/ffmpeg"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir|-InstallDir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    *)
      echo "Uso: $0 [--install-dir RUTA]" >&2
      exit 2
      ;;
  esac
done

if [[ -x "$INSTALL_DIR/ffmpeg" ]]; then
  echo "FFmpeg encontrado: $INSTALL_DIR/ffmpeg"
  exit 0
fi

if command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg encontrado en PATH: $(command -v ffmpeg)"
  exit 0
fi

run_as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

install_ffmpeg() {
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update
    run_as_root apt-get install -y ffmpeg
  elif command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y ffmpeg
  elif command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y ffmpeg
  elif command -v pacman >/dev/null 2>&1; then
    run_as_root pacman -Sy --noconfirm ffmpeg
  elif command -v zypper >/dev/null 2>&1; then
    run_as_root zypper --non-interactive install ffmpeg
  else
    return 1
  fi
}

answer="${ASSUME_YES:-}"
if [[ "$answer" != "1" ]]; then
  read -r -p "No se encontro FFmpeg. Intentar instalarlo con el gestor de paquetes? [S/n]: " answer
fi

case "${answer:-S}" in
  s|S|si|SI|Si|y|Y|yes|YES|1)
    ;;
  *)
    echo "Instala ffmpeg manualmente y vuelve a ejecutar este script." >&2
    exit 1
    ;;
esac

if ! install_ffmpeg; then
  echo "No pude instalar FFmpeg automaticamente. Instala el paquete 'ffmpeg' para tu distro." >&2
  exit 1
fi

if command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg instalado: $(command -v ffmpeg)"
  exit 0
fi

echo "FFmpeg no quedo disponible en PATH." >&2
exit 1
