-- =========================================================
-- 00_init.sql
-- Archivo maestro de inicialización
-- Ejecuta todos los módulos en orden
-- =========================================================

\i 01_enums.sql
\i 02_auth.sql
\i 03_inventario.sql
\i 04_operacion.sql
\i 05_asignaciones.sql
\i 06_grupos_y_mando.sql
\i 07_chat.sql
\i 08_mapa_base.sql
\i 09_mapa_avanzado.sql
\i 10_tracking.sql
\i 11_novedades_y_avisos.sql
\i 12_validaciones_generales.sql
\i 13_triggers_operativos.sql
\i 14_vistas.sql
\i 15_seed.sql