@echo off
color 0A
echo ==============================================================
echo MOTOR DE RUTAS LOCAL - COMPILACION OSRM (MODO OFFLINE)
echo Sistema para Mexico (Coche) - Proyecto Cesium
echo ==============================================================
echo.

if not exist "mexico-latest.osm.pbf" (
    echo [ERROR] No se encontro el archivo "mexico-latest.osm.pbf".
    echo Por favor, asegurate de colocar este archivo .bat exactamente en la misma carpeta donde trajiste tu archivo descargado 'mexico-latest.osm.pbf'.
    pause
    exit /b 1
)

if not exist "osrm_data" mkdir osrm_data
move /Y "mexico-latest.osm.pbf" "osrm_data\"
cd osrm_data

echo [1/4] Extrayendo rutas del pais usando Docker (osrm-extract)...
echo (Esto tardara varios minutos. Puede parecer trabado, dale tiempo...)
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf
echo.

echo [2/4] Particionando las celdas usando Docker (osrm-partition)...
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/mexico-latest.osrm
echo.

echo [3/4] Calculando pesos de calles usando Docker (osrm-customize)...
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/mexico-latest.osrm
echo.

echo [4/4] Levantando servidor local en background...
docker run -d -p 5000:5000 -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/mexico-latest.osrm
echo.

echo ==============================================================
echo ¡PROCESO COMPLETADO EXITOSAMENTE!
echo El motor de rutas esta corriendo en: http://localhost:5000
echo Ya puedes cerrar esta ventana con total seguridad.
echo ==============================================================
pause
