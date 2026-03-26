@echo off
color 0A
echo ==============================================================
echo MOTOR DE RUTAS LOCAL - DESCARGA Y CONFIGURACION OSRM
echo Sistema para Mexico (Coche) - Proyecto Cesium
echo ==============================================================
echo.

if not exist "osrm_data" mkdir osrm_data
cd osrm_data

echo [1/5] Descargando mapa de Mexico desde OpenStreetMap (Geofabrik)...
echo (Esto pesa aprox. 470 MB, dependera de tu velocidad de red)
curl.exe -L -# -o mexico-latest.osm.pbf "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"
echo Descarga completa.
echo.

echo [2/5] Extrayendo rutas del pais usando Docker (osrm-extract)...
echo (Esto tardara varios minutos. Puede parecer trabado, dale tiempo)
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf
echo.

echo [3/5] Particionando las celdas usando Docker (osrm-partition)...
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/mexico-latest.osrm
echo.

echo [4/5] Calculando pesos de calles usando Docker (osrm-customize)...
docker run -t -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/mexico-latest.osrm
echo.

echo [5/5] Levantando servidor local en background...
docker run -d -p 5000:5000 -v "%cd%:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/mexico-latest.osrm
echo.

echo ==============================================================
echo ¡PROCESO COMPLETADO EXITOSAMENTE!
echo El motor de rutas esta corriendo en: http://localhost:5000
echo Y tambien visible a toda tu red LAN en tu IP.
echo Ya puedes cerrar esta ventana con total seguridad.
echo ==============================================================
pause
