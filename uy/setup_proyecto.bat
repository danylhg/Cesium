@echo off
title Setup Cesium Proyecto

:: ============================================================
::  CONFIGURACION
:: ============================================================
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROYECTO=%%~fI"
set "ENV_FILE=%PROYECTO%\Operaciones\api\.env"
set "INIT_SQL=%PROYECTO%\db\remodulacion\00_init.sql"
set "PSQL=C:\Program Files\PostgreSQL\18\bin\psql.exe"
set "STREAM_STORAGE=%PROYECTO%\Operaciones\api\storage\streams"
set "FRONT_RUNTIME=%PROYECTO%\Operaciones\runtime"
set "FFMPEG_STREAM_ROOT=%FRONT_RUNTIME%\ffmpeg-streams"
set "SETUP_CLEANUP_MARKER=%FRONT_RUNTIME%\setup_cleanup.json"
set "FFMPEG_DIR=%PROYECTO%\tools\ffmpeg"
set "DRONE_STREAM_KEY=dron-01"
set "DRONE_RTMP_PORT=1936"

if not exist "%ENV_FILE%" (
    echo ERROR: No se encontro el archivo .env en %ENV_FILE%.
    pause
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
    if not "%%A"=="" set "%%A=%%B"
)

if not defined PGHOST set PGHOST=localhost
if not defined PGPORT set PGPORT=5432
if not defined PGUSER set PGUSER=postgres
if not defined PGDATABASE set PGDATABASE=ops_db

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254*' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set LAN_IP=%%I
if not defined LAN_IP set LAN_IP=localhost

echo.
echo Si vas a verlo por VS Code Tunnel desde otra red, pega aqui la URL publica del puerto 3000.
echo Puedes pegar la URL completa; se recortara a la raiz del tunel.
echo Ejemplo: https://TU-TUNEL-3000
echo Si solo usaras red local, deja vacio y presiona Enter.
set /p TUNNEL_FRONTEND_URL="URL tunel 3000 (opcional): "

if defined TUNNEL_FRONTEND_URL goto use_tunnel_hls
set FRONTEND_PUBLIC_URL=http://%LAN_IP%:3000
set HLS_PUBLIC_BASE_URL=http://%LAN_IP%:3000/Operaciones/runtime/ffmpeg-streams
goto hls_base_ready

:use_tunnel_hls
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$raw = ($env:TUNNEL_FRONTEND_URL).Trim(); try { $uri = [Uri]$raw; if ($uri.IsAbsoluteUri) { $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd('/') } else { $raw.TrimEnd('/') } } catch { $raw.TrimEnd('/') }"`) do set "TUNNEL_FRONTEND_URL=%%U"
set FRONTEND_PUBLIC_URL=%TUNNEL_FRONTEND_URL%
set HLS_PUBLIC_BASE_URL=%FRONTEND_PUBLIC_URL%/Operaciones/runtime/ffmpeg-streams

:hls_base_ready

:: ============================================================
::  PASO 1: Limpiar grabaciones locales antes del reset
:: ============================================================
echo [1/6] Limpiando grabaciones locales y buffer de video ...

if exist "%STREAM_STORAGE%" (
    rmdir /s /q "%STREAM_STORAGE%"
)
mkdir "%STREAM_STORAGE%" 2>nul

if not exist "%FRONT_RUNTIME%" mkdir "%FRONT_RUNTIME%"
if exist "%FFMPEG_STREAM_ROOT%" (
    rmdir /s /q "%FFMPEG_STREAM_ROOT%"
)
mkdir "%FFMPEG_STREAM_ROOT%" 2>nul
> "%SETUP_CLEANUP_MARKER%" echo {"token":"%DATE% %TIME% %RANDOM%","scope":"operaciones-video-buffer"}

for %%B in ("%LOCALAPPDATA%\Google\Chrome\User Data" "%LOCALAPPDATA%\Microsoft\Edge\User Data") do (
    if exist "%%~B" (
        for /d %%P in ("%%~B\*") do (
            if exist "%%~P\IndexedDB" (
                for /d %%D in ("%%~P\IndexedDB\http_localhost_3000.indexeddb*" "%%~P\IndexedDB\http_127.0.0.1_3000.indexeddb*") do (
                    if exist "%%~D" rmdir /s /q "%%~D"
                )
            )
        )
    )
)

echo       Grabaciones locales marcadas para limpieza.
echo.

:: ============================================================
::  Pedir la contraseña UNA SOLA VEZ
:: ============================================================
echo ============================================================
echo  SETUP CESIUM PROYECTO
echo ============================================================
echo.
if not defined PGPASSWORD set /p PGPASSWORD="Ingresa la contrasena de PostgreSQL (usuario: %PGUSER%): "
echo.

:: ============================================================
::  PASO 2: Borrar base de datos configurada (si existe)
:: ============================================================
echo [2/6] Borrando base de datos %PGDATABASE% ...
"%PSQL%" -h %PGHOST% -p %PGPORT% -U %PGUSER% -c "DROP DATABASE IF EXISTS %PGDATABASE%;" postgres
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo conectar a PostgreSQL en %PGHOST%:%PGPORT% con usuario %PGUSER%.
    echo        Verifica que PostgreSQL este iniciado y que la contrasena sea correcta.
    pause
    exit /b 1
)
echo       %PGDATABASE% eliminada correctamente.
echo.

:: ============================================================
::  PASO 3: Crear base de datos configurada y ejecutar init.sql
:: ============================================================
echo [3/6] Creando base de datos %PGDATABASE% ...
"%PSQL%" -h %PGHOST% -p %PGPORT% -U %PGUSER% postgres -c "CREATE DATABASE %PGDATABASE%;"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo crear la base de datos.
    pause
    exit /b 1
)
echo       %PGDATABASE% creada.

echo       Ejecutando init.sql ...
"%PSQL%" -h %PGHOST% -p %PGPORT% -U %PGUSER% %PGDATABASE% -f "%INIT_SQL%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al ejecutar init.sql.
    pause
    exit /b 1
)
echo       Base de datos inicializada correctamente.
echo.

:: ============================================================
::  PASO 4: Ejecutar seed modular EN ESTA MISMA VENTANA
:: ============================================================
echo [4/6] Ejecutando seed modular ...
cd /d "%PROYECTO%\operaciones\api"
node seed\index.js
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: El seed fallo. Revisa el mensaje de arriba.
    pause
    exit /b 1
)
echo       Seed ejecutado correctamente.
echo.

:: ============================================================
::  PASO 5: Instalar/verificar FFmpeg
:: ============================================================
echo [5/6] Verificando FFmpeg ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\ensure_ffmpeg.ps1" -InstallDir "%FFMPEG_DIR%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo instalar o verificar FFmpeg.
    echo        Puedes instalarlo manualmente y agregar ffmpeg.exe al PATH.
    pause
    exit /b 1
)
echo       FFmpeg listo.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\ensure_frontend_assets.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo WARN: No se pudo descargar hls.js local. El visor intentara usar CDN.
)
echo.

:: ============================================================
::  PASO 6: Abrir ventanas del servidor
:: ============================================================
echo [6/6] Iniciando servidores ...

:: Ventana 1 - npx serve (frontend estatico en puerto 3000)
start "Frontend" cmd /k "cd /d ""%PROYECTO%"" && npx serve -l 3000"
timeout /t 2 /nobreak >nul

:: Ventana 2 - node server.js (API - lee Operaciones\api\.env)
start "API Server" cmd /k "cd /d ""%PROYECTO%\operaciones\api"" && set MEDIA_STREAM_DEFAULT_PROTOCOL=WEBRTC&& node server.js"

:: Ventana 3 - OBS RTMP a HLS (OBS publica a rtmp://LAN_IP:1935/live con key obs-01)
start "OBS RTMP HLS" powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\start_obs_rtmp_hls.ps1" -StreamKey "obs-01" -Port 1935 -PublicBaseUrl "%HLS_PUBLIC_BASE_URL%"

:: Ventana 4 - Dron RTMP a HLS (el dron/controlador publica a rtmp://LAN_IP:1936/live/dron-01)
start "Drone RTMP HLS" powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\start_ffmpeg_drone_hls.ps1" -Listen -InputUrl "rtmp://0.0.0.0:%DRONE_RTMP_PORT%/live/%DRONE_STREAM_KEY%" -StreamKey "%DRONE_STREAM_KEY%" -PublicBaseUrl "%HLS_PUBLIC_BASE_URL%" -PreserveExistingHls -RecordMp4Segments -RecordingOutputRoot "%PROYECTO%\Operaciones\runtime\ffmpeg-recordings" -RecordingSegmentSeconds 10 -VideoHeight 240 -VideoFps 15 -VideoBitrate "450k" -VideoMaxrate "550k" -VideoBufsize "900k" -AudioBitrate "64k"

echo.
echo ============================================================
echo  LISTO!
echo  - Base de datos %PGDATABASE% configurada con seed
echo  - Frontend:  %FRONTEND_PUBLIC_URL%
echo  - API:       http://localhost:3001
echo  - Android:   WebRTC 240p
echo  - OBS RTMP:  Server rtmp://%LAN_IP%:1935/live  Key obs-01
echo  - Dron RTMP: Server rtmp://%LAN_IP%:%DRONE_RTMP_PORT%/live  Key %DRONE_STREAM_KEY%
echo  - TUNEL RTMP: VS Code Tunnel sirve para ver HLS/HTTP, no para publicar RTMP directo.
echo  - HLS OBS:   %HLS_PUBLIC_BASE_URL%/obs-01/index.m3u8  ^(240p^)
echo  - HLS Dron:  %HLS_PUBLIC_BASE_URL%/%DRONE_STREAM_KEY%/index.m3u8  ^(240p^)
echo  - Guia:     Operaciones\ffmpeg_drones.md
echo  - FFmpeg:    verificado en %FFMPEG_DIR%
echo  - LAN IP:    %LAN_IP%
echo  - Password de todos los usuarios: 1234
echo ============================================================
echo.
pause
