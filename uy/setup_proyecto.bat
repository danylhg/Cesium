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
set SETUP_CLEANUP_MARKER=%FRONT_RUNTIME%\setup_cleanup.json
set MEDIAMTX_DIR=%PROYECTO%\tools\mediamtx
set MEDIAMTX_EXE=%MEDIAMTX_DIR%\mediamtx.exe
set MEDIAMTX_CONFIG=%PROYECTO%\uy\mediamtx.yml

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
::  PASO 5: Instalar/verificar MediaMTX para RTMP/HLS
:: ============================================================
echo [5/6] Verificando MediaMTX RTMP/HLS ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROYECTO%\uy\ensure_mediamtx.ps1" -InstallDir "%MEDIAMTX_DIR%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo instalar o verificar MediaMTX.
    echo        Puedes descargarlo manualmente y poner mediamtx.exe en:
    echo        %MEDIAMTX_DIR%
    pause
    exit /b 1
)
echo       MediaMTX listo.
echo.

:: ============================================================
::  PASO 6: Abrir ventanas del servidor
:: ============================================================
echo [6/6] Iniciando servidores ...

:: Ventana 0 - MediaMTX (RTMP en 1935, HLS en 8888)
start "MediaMTX RTMP-HLS" /D "%PROYECTO%\uy" cmd /k ""%MEDIAMTX_EXE%" "%MEDIAMTX_CONFIG%""
timeout /t 2 /nobreak >nul

:: Ventana 1 - npx serve (frontend estatico en puerto 3000)
start "Frontend" cmd /k "cd /d %PROYECTO% && npx serve -l 3000"
timeout /t 2 /nobreak >nul

:: Ventana 2 - node server.js (API - lee Operaciones\api\.env)
start "API Server" cmd /k "cd /d %PROYECTO%\operaciones\api && set RTMP_PUBLISH_BASE_URL=rtmp://%LAN_IP%/live&& set RTMP_PLAYBACK_BASE_URL=http://%LAN_IP%:8888/live&& node server.js"

echo.
echo ============================================================
echo  LISTO!
echo  - Base de datos %PGDATABASE% configurada con seed
echo  - Frontend:  http://localhost:3000
echo  - API:       http://localhost:3001
echo  - RTMP:      rtmp://%LAN_IP%/live/{streamKey}
echo  - HLS:       http://%LAN_IP%:8888/live/{streamKey}/index.m3u8
echo  - LAN IP:    %LAN_IP%
echo  - Password de todos los usuarios: 1234
echo ============================================================
echo.
pause
