@echo off
title Setup Cesium Proyecto
:: ============================================================
::  CONFIGURACION
:: ============================================================
set PGHOST=localhost
set PGPORT=5433
set PGUSER=postgres
set PROYECTO=C:\Users\PC\Desktop\cesium-proyecto
set INIT_SQL=C:/Users/PC/Desktop/cesium-proyecto/db/remodulacion/00_init.sql
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

:: ============================================================
::  Pedir la contraseña UNA SOLA VEZ
:: ============================================================
echo ============================================================
echo  SETUP CESIUM PROYECTO
echo ============================================================
echo.
set /p PGPASSWORD="Ingresa la contrasena de PostgreSQL (usuario: %PGUSER%): "
echo.

:: ============================================================
::  PASO 1: Borrar base de datos ops_db (si existe)
:: ============================================================
echo [1/4] Borrando base de datos ops_db ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% -c "DROP DATABASE IF EXISTS ops_db;" postgres
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo conectar a PostgreSQL. Verifica la contrasena.
    pause
    exit /b 1
)
echo       ops_db eliminada correctamente.
echo.

:: ============================================================
::  PASO 2: Crear base de datos ops_db y ejecutar init.sql
:: ============================================================
echo [2/4] Creando base de datos ops_db ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% postgres -c "CREATE DATABASE ops_db;"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo crear la base de datos.
    pause
    exit /b 1
)
echo       ops_db creada.

echo       Ejecutando init.sql ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% ops_db -f "%INIT_SQL%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Fallo al ejecutar init.sql.
    pause
    exit /b 1
)
echo       Base de datos inicializada correctamente.
echo.

:: ============================================================
::  PASO 3: Ejecutar seed.js EN ESTA MISMA VENTANA
::  (para que herede PGPASSWORD y veamos si falla)
:: ============================================================
echo [3/4] Ejecutando seed.js ...
cd /d %PROYECTO%\operaciones\api
node seed.js
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: El seed fallo. Revisa el mensaje de arriba.
    pause
    exit /b 1
)
echo       Seed ejecutado correctamente.
echo.

:: ============================================================
::  PASO 4: Abrir ventanas del servidor
:: ============================================================
echo [4/4] Iniciando servidores ...

:: Ventana 1 - npx serve (frontend estatico)
start "Frontend" cmd /k "cd /d %PROYECTO% && npx serve"
timeout /t 2 /nobreak >nul

:: Ventana 2 - node server.js (API — hereda PGPASSWORD del entorno)
start "API Server" cmd /k "cd /d %PROYECTO%\operaciones\api && set PGPASSWORD=%PGPASSWORD% && node server.js"

echo.
echo ============================================================
echo  LISTO!
echo  - Base de datos ops_db configurada con seed
echo  - Frontend:  http://localhost:3000
echo  - API:       http://localhost:3001
echo  - Password de todos los usuarios: 1234
echo ============================================================
echo.
pause