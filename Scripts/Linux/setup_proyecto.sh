#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROYECTO="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROYECTO/Operaciones/api/.env"
INIT_SQL="$PROYECTO/db/remodulacion/00_init.sql"
STREAM_STORAGE="$PROYECTO/Operaciones/api/storage/streams"
FRONT_RUNTIME="$PROYECTO/Operaciones/runtime"
FFMPEG_STREAM_ROOT="$FRONT_RUNTIME/ffmpeg-streams"
SETUP_CLEANUP_MARKER="$FRONT_RUNTIME/setup_cleanup.json"
FFMPEG_DIR="$PROYECTO/tools/ffmpeg"
DRONE_STREAM_KEY="${DRONE_STREAM_KEY:-dron-01}"
DRONE_RTMP_PORT="${DRONE_RTMP_PORT:-1936}"
PSQL="${PSQL:-}"

error() {
  echo "ERROR: $*" >&2
  exit 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf "%s" "$value"
}

load_env() {
  local key value
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    key="${key%$'\r'}"
    value="${value:-}"
    value="${value%$'\r'}"
    key="$(trim "$key")"

    [[ -z "$key" || "$key" =~ ^# ]] && continue
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    value="$(trim "$value")"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < "$ENV_FILE"
}

detect_lan_ip() {
  local ip=""
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  fi
  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf "%s" "${ip:-localhost}"
}

normalize_frontend_url() {
  local raw="$1"
  raw="$(trim "$raw")"
  raw="${raw%/}"
  if [[ "$raw" =~ ^(https?://[^/]+) ]]; then
    printf "%s" "${BASH_REMATCH[1]}"
  else
    printf "%s" "$raw"
  fi
}

safe_remove_dir() {
  local target="$1"
  local resolved
  resolved="$(realpath -m "$target")"
  case "$resolved" in
    "$PROYECTO"/*)
      rm -rf -- "$resolved"
      ;;
    *)
      error "Ruta fuera del proyecto, no se borra: $resolved"
      ;;
  esac
}

cleanup_browser_indexeddb() {
  local base
  for base in \
    "$HOME/.config/google-chrome" \
    "$HOME/.config/chromium" \
    "$HOME/.config/microsoft-edge"; do
    [[ -d "$base" ]] || continue
    find "$base" -path "*/IndexedDB/http_localhost_3000.indexeddb*" -prune -exec rm -rf {} + 2>/dev/null || true
    find "$base" -path "*/IndexedDB/http_127.0.0.1_3000.indexeddb*" -prune -exec rm -rf {} + 2>/dev/null || true
  done
}

ensure_psql() {
  if [[ -n "$PSQL" && -x "$PSQL" ]]; then
    return 0
  fi
  if command -v psql >/dev/null 2>&1; then
    PSQL="$(command -v psql)"
    return 0
  fi
  error "No se encontro psql. Instala postgresql-client o ajusta PSQL antes de ejecutar."
}

validate_pg_identifier() {
  local value="$1"
  local name="$2"
  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    error "$name debe ser un identificador simple de PostgreSQL: $value"
  fi
}

test_postgres() {
  PGPASSWORD="${PGPASSWORD:-}" "$PSQL" \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d postgres \
    -w \
    -c "SELECT 1;" >/dev/null 2>&1
}

try_start_postgres() {
  if command -v systemctl >/dev/null 2>&1; then
    if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      if systemctl start postgresql 2>/dev/null; then return 0; fi
    elif command -v sudo >/dev/null 2>&1; then
      if sudo systemctl start postgresql; then return 0; fi
    fi
  fi

  if command -v service >/dev/null 2>&1; then
    if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
      if service postgresql start 2>/dev/null; then return 0; fi
    elif command -v sudo >/dev/null 2>&1; then
      if sudo service postgresql start; then return 0; fi
    fi
  fi

  return 1
}

ensure_postgres_ready() {
  echo "Verificando PostgreSQL en $PGHOST:$PGPORT ..."

  if test_postgres; then
    echo "      PostgreSQL listo en $PGHOST:$PGPORT."
    return 0
  fi

  if [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" && "$PGHOST" != "::1" ]]; then
    error "No se pudo conectar a PostgreSQL en $PGHOST:$PGPORT con usuario $PGUSER."
  fi

  echo "      PostgreSQL local no respondio; intentando iniciar el servicio ..."
  if ! try_start_postgres; then
    error "No se pudo iniciar PostgreSQL. Inicialo manualmente y vuelve a ejecutar."
  fi

  local tries=0
  while [[ "$tries" -lt 20 ]]; do
    if test_postgres; then
      echo "      PostgreSQL listo en $PGHOST:$PGPORT."
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done

  error "PostgreSQL no acepto conexiones en $PGHOST:$PGPORT."
}

q() {
  printf "%q" "$1"
}

write_launcher() {
  local title="$1"
  local body="$2"
  local slug launcher
  slug="$(printf "%s" "$title" | tr '[:upper:] ' '[:lower:]_' | tr -c 'a-z0-9_-' '_')"
  launcher="$FRONT_RUNTIME/launch_${slug}.sh"

  {
    printf '#!/usr/bin/env bash\n'
    printf 'set -uo pipefail\n'
    printf '%s\n' "$body"
    printf 'status=$?\n'
    printf 'echo\n'
    printf 'echo "Proceso terminado con codigo $status."\n'
    printf 'read -r -p "Presiona Enter para cerrar esta ventana... "\n'
    printf 'exit "$status"\n'
  } > "$launcher"

  chmod +x "$launcher"
  printf "%s" "$launcher"
}

open_terminal() {
  local title="$1"
  local launcher="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- "$launcher" >/dev/null 2>&1 &
  elif command -v konsole >/dev/null 2>&1; then
    konsole --new-tab --title "$title" -e "$launcher" >/dev/null 2>&1 &
  elif command -v xfce4-terminal >/dev/null 2>&1; then
    xfce4-terminal --title="$title" --command "$launcher" >/dev/null 2>&1 &
  elif command -v mate-terminal >/dev/null 2>&1; then
    mate-terminal --title="$title" -e "$launcher" >/dev/null 2>&1 &
  elif command -v tilix >/dev/null 2>&1; then
    tilix --title="$title" -e "$launcher" >/dev/null 2>&1 &
  elif command -v kitty >/dev/null 2>&1; then
    kitty --title "$title" "$launcher" >/dev/null 2>&1 &
  elif command -v alacritty >/dev/null 2>&1; then
    alacritty --title "$title" -e "$launcher" >/dev/null 2>&1 &
  elif command -v xterm >/dev/null 2>&1; then
    xterm -T "$title" -e "$launcher" >/dev/null 2>&1 &
  elif command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "$title" -e "$launcher" >/dev/null 2>&1 &
  else
    echo "No se encontro un emulador de terminal para '$title'. Ejecuta manualmente:"
    echo "  $launcher"
    return 1
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  error "No se encontro el archivo .env en $ENV_FILE."
fi

load_env

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ops_db}"

validate_pg_identifier "$PGDATABASE" "PGDATABASE"

LAN_IP="$(detect_lan_ip)"

echo
echo "Si vas a verlo por VS Code Tunnel desde otra red, pega aqui la URL publica del puerto 3000."
echo "Puedes pegar la URL completa; se recortara a la raiz del tunel."
echo "Ejemplo: https://TU-TUNEL-3000"
echo "Si solo usaras red local, deja vacio y presiona Enter."
read -r -p "URL tunel 3000 (opcional): " TUNNEL_FRONTEND_URL

if [[ -n "$(trim "$TUNNEL_FRONTEND_URL")" ]]; then
  FRONTEND_PUBLIC_URL="$(normalize_frontend_url "$TUNNEL_FRONTEND_URL")"
  HLS_PUBLIC_BASE_URL="$FRONTEND_PUBLIC_URL/Operaciones/runtime/ffmpeg-streams"
else
  FRONTEND_PUBLIC_URL="http://$LAN_IP:3000"
  HLS_PUBLIC_BASE_URL="http://$LAN_IP:3000/Operaciones/runtime/ffmpeg-streams"
fi

echo
echo "[1/6] Limpiando grabaciones locales y buffer de video ..."
safe_remove_dir "$STREAM_STORAGE"
mkdir -p -- "$STREAM_STORAGE"
mkdir -p -- "$FRONT_RUNTIME"
safe_remove_dir "$FFMPEG_STREAM_ROOT"
mkdir -p -- "$FFMPEG_STREAM_ROOT"
printf '{"token":"%s-%s","scope":"operaciones-video-buffer"}\n' "$(date +'%F %T')" "$RANDOM" > "$SETUP_CLEANUP_MARKER"
cleanup_browser_indexeddb
echo "      Grabaciones locales marcadas para limpieza."
echo

echo "============================================================"
echo " SETUP CESIUM PROYECTO"
echo "============================================================"
echo
if [[ -z "${PGPASSWORD:-}" ]]; then
  read -r -s -p "Ingresa la contrasena de PostgreSQL (usuario: $PGUSER): " PGPASSWORD
  echo
fi
export PGPASSWORD
echo

ensure_psql
ensure_postgres_ready
echo

echo "[2/6] Borrando base de datos $PGDATABASE ..."
"$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $PGDATABASE;"
echo "      $PGDATABASE eliminada correctamente."
echo

echo "[3/6] Creando base de datos $PGDATABASE ..."
"$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE $PGDATABASE;"
echo "      $PGDATABASE creada."

echo "      Ejecutando init.sql ..."
"$PSQL" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$INIT_SQL"
echo "      Base de datos inicializada correctamente."
echo

echo "[4/6] Ejecutando seed modular ..."
(
  cd "$PROYECTO/Operaciones/api"
  node seed/index.js
)
echo "      Seed ejecutado correctamente."
echo

echo "[5/6] Verificando FFmpeg ..."
bash "$SCRIPT_DIR/ensure_ffmpeg.sh" --install-dir "$FFMPEG_DIR"
echo "      FFmpeg listo."
echo

if ! bash "$SCRIPT_DIR/ensure_frontend_assets.sh"; then
  echo "WARN: No se pudo descargar hls.js local. El visor intentara usar CDN."
fi
echo

echo "[6/6] Iniciando servidores ..."

FRONTEND_LAUNCHER="$(write_launcher "Frontend" "cd $(q "$PROYECTO")
npx serve -l 3000")"

API_LAUNCHER="$(write_launcher "API Server" "cd $(q "$PROYECTO/Operaciones/api")
export MEDIA_STREAM_DEFAULT_PROTOCOL=WEBRTC
node server.js")"

OBS_LAUNCHER="$(write_launcher "OBS RTMP HLS" "bash $(q "$SCRIPT_DIR/start_obs_rtmp_hls.sh") --stream-key obs-01 --port 1935 --public-base-url $(q "$HLS_PUBLIC_BASE_URL")")"

DRONE_LAUNCHER="$(write_launcher "Drone RTMP HLS" "bash $(q "$SCRIPT_DIR/start_ffmpeg_drone_hls.sh") --listen --input-url $(q "rtmp://0.0.0.0:$DRONE_RTMP_PORT/live/$DRONE_STREAM_KEY") --stream-key $(q "$DRONE_STREAM_KEY") --public-base-url $(q "$HLS_PUBLIC_BASE_URL") --preserve-existing-hls --record-mp4-segments --recording-output-root $(q "$PROYECTO/Operaciones/runtime/ffmpeg-recordings") --recording-segment-seconds 10 --video-height 240 --video-fps 15 --video-bitrate 450k --video-maxrate 550k --video-bufsize 900k --audio-bitrate 64k")"

MISSING_TERMINAL=0
open_terminal "Frontend" "$FRONTEND_LAUNCHER" || MISSING_TERMINAL=1
sleep 2
open_terminal "API Server" "$API_LAUNCHER" || MISSING_TERMINAL=1
open_terminal "OBS RTMP HLS" "$OBS_LAUNCHER" || MISSING_TERMINAL=1
open_terminal "Drone RTMP HLS" "$DRONE_LAUNCHER" || MISSING_TERMINAL=1

echo
echo "============================================================"
echo " LISTO!"
echo " - Base de datos $PGDATABASE configurada con seed"
echo " - Frontend:  $FRONTEND_PUBLIC_URL"
echo " - API:       http://localhost:3001"
echo " - Android:   WebRTC 240p"
echo " - OBS RTMP:  Server rtmp://$LAN_IP:1935/live  Key obs-01"
echo " - Dron RTMP: Server rtmp://$LAN_IP:$DRONE_RTMP_PORT/live  Key $DRONE_STREAM_KEY"
echo " - TUNEL RTMP: VS Code Tunnel sirve para ver HLS/HTTP, no para publicar RTMP directo."
echo " - HLS OBS:   $HLS_PUBLIC_BASE_URL/obs-01/index.m3u8  (240p)"
echo " - HLS Dron:  $HLS_PUBLIC_BASE_URL/$DRONE_STREAM_KEY/index.m3u8  (240p)"
echo " - Guia:      Operaciones/ffmpeg_drones.md"
echo " - FFmpeg:    verificado"
echo " - LAN IP:    $LAN_IP"
echo " - Password de todos los usuarios: 1234"
if [[ "$MISSING_TERMINAL" -eq 1 ]]; then
  echo " - Nota: una o mas ventanas no se pudieron abrir; usa los launchers en $FRONT_RUNTIME"
fi
echo "============================================================"
echo
