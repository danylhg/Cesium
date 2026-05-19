@echo off
title Setup Cesium Proyecto

:: ============================================================
::  CONFIGURACION
:: ============================================================
set PROYECTO=C:\Users\PC\Desktop\cesium-proyecto
set ENV_FILE=%PROYECTO%\Operaciones\api\.env
set INIT_SQL=C:\Users\PC\Desktop\cesium-proyecto\db\remodulacion\00_init.sql
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"
set STREAM_STORAGE=%PROYECTO%\Operaciones\api\storage\streams
set FRONT_RUNTIME=%PROYECTO%\Operaciones\runtime
set FFMPEG_STREAM_ROOT=%FRONT_RUNTIME%\ffmpeg-streams
set SETUP_CLEANUP_MARKER=%FRONT_RUNTIME%\setup_cleanup.json
set FFMPEG_DIR=%PROYECTO%\tools\ffmpeg

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
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% -c "DROP DATABASE IF EXISTS %PGDATABASE%;" postgres
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo conectar a PostgreSQL. Verifica la contrasena.
    pause
    exit /b 1
)
echo       %PGDATABASE% eliminada correctamente.
echo.

:: ============================================================
::  PASO 3: Crear base de datos configurada y ejecutar init.sql
:: ============================================================
echo [3/6] Creando base de datos %PGDATABASE% ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% postgres -c "CREATE DATABASE %PGDATABASE%;"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo crear la base de datos.
    pause
    exit /b 1
)
echo       %PGDATABASE% creada.

echo       Ejecutando init.sql ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% %PGDATABASE% -f "%INIT_SQL%"
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
cd /d %PROYECTO%\operaciones\api
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
start "Frontend" cmd /k "cd /d %PROYECTO% && npx serve -l 3000"
timeout /t 2 /nobreak >nul

:: Ventana 2 - node server.js (API - lee Operaciones\api\.env)
start "API Server" cmd /k "cd /d %PROYECTO%\operaciones\api && set MEDIA_STREAM_DEFAULT_PROTOCOL=WEBRTC&& node server.js"

:: Ventana 3 - OBS RTMP a HLS (OBS publica a rtmp://LAN_IP:1935/live con key obs-01)
start "OBS RTMP HLS" powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\start_obs_rtmp_hls.ps1" -StreamKey "obs-01" -Port 1935 -PublicBaseUrl "http://%LAN_IP%:3000/Operaciones/runtime/ffmpeg-streams"

echo.
echo ============================================================
echo  LISTO!
echo  - Base de datos %PGDATABASE% configurada con seed
echo  - Frontend:  http://%LAN_IP%:3000/Operaciones/login
echo  - API:       http://localhost:3001
echo  - Android:   WebRTC 240p
echo  - OBS RTMP:  Server rtmp://%LAN_IP%:1935/live  Key obs-01
echo  - Drones:    RTMP/RTSP con FFmpeg a HLS 240p
echo  - HLS OBS:   http://%LAN_IP%:3000/Operaciones/runtime/ffmpeg-streams/obs-01/index.m3u8  ^(240p^)
echo  - HLS FFmpeg: http://%LAN_IP%:3000/Operaciones/runtime/ffmpeg-streams/STREAM/index.m3u8  ^(240p^)
echo  - Guia:     Operaciones\ffmpeg_drones.md
echo  - FFmpeg:    verificado en %FFMPEG_DIR%
echo  - LAN IP:    %LAN_IP%
echo  - Password de todos los usuarios: 1234
echo ============================================================
echo.
pause
