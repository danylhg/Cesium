@echo off
title Setup Cesium Proyecto

:: ============================================================
::  CONFIGURACION
:: ============================================================
set PROYECTO=C:\Users\PC\Desktop\cesium-proyecto
set ENV_FILE=%PROYECTO%\Operaciones\api\.env
set INIT_SQL=C:\Users\PC\Desktop\cesium-proyecto\db\remodulacion\00_init.sql
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"

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
::  PASO 1: Borrar base de datos configurada (si existe)
:: ============================================================
echo [1/4] Borrando base de datos %PGDATABASE% ...
%PSQL% -h %PGHOST% -p %PGPORT% -U %PGUSER% -c "DROP DATABASE IF EXISTS %PGDATABASE%;" postgres
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: No se pudo conectar a PostgreSQL. Verifica la contrasena.
    pause
    exit /b 1
)
echo       %PGDATABASE% eliminada correctamente.
echo.

:: ============================================================
::  PASO 2: Crear base de datos configurada y ejecutar init.sql
:: ============================================================
echo [2/4] Creando base de datos %PGDATABASE% ...
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
::  PASO 3: Ejecutar seed modular EN ESTA MISMA VENTANA
:: ============================================================
echo [3/4] Ejecutando seed modular ...
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
::  PASO 4: Abrir ventanas del servidor
:: ============================================================
echo [4/4] Iniciando servidores ...

:: Ventana 1 - npx serve (frontend estatico en puerto 3000)
start "Frontend" cmd /k "cd /d %PROYECTO% && npx serve -l 3000"
timeout /t 2 /nobreak >nul

:: Ventana 2 - node server.js (API - lee Operaciones\api\.env)
start "API Server" cmd /k "cd /d %PROYECTO%\operaciones\api && node server.js"

echo.
echo ============================================================
echo  LISTO!
echo  - Base de datos %PGDATABASE% configurada con seed
echo  - Frontend:  http://localhost:3000
echo  - API:       http://localhost:3001
echo  - Password de todos los usuarios: 1234
echo ============================================================
echo.
pause
