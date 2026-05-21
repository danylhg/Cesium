package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.AreaPolygonItem
import com.operaciones.operaciones_android.model.CoverageCircleItem
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.OperationGridItem
import com.operaciones.operaciones_android.model.OperationZoneItem
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.PoiItem
import com.operaciones.operaciones_android.model.StructureItem
import com.operaciones.operaciones_android.model.VehiculoItem
import org.json.JSONArray
import org.json.JSONObject

class OperationMapParser {

    private data class ParsedAreas(
        val coverageCircles: List<CoverageCircleItem>,
        val areaPolygons: List<AreaPolygonItem>
    )

    fun parseMapData(json: JSONObject): OperationMapData {
        val capas = json.optJSONArray("capas")
        val personalPositions = parsePersonalPositions(json.optJSONArray("personal"))
        val parsedAreas = parseAreas(capas)

        return OperationMapData(
            personal = parsePersonalFromLayers(capas, personalPositions),
            vehiculos = parseVehiculos(json.optJSONArray("vehiculos")),
            equipos = parseEquipos(capas),
            rutasNavegacion = json.optJSONArray("rutas_navegacion")?.toString(),
            rutasTacticas = parseTacticalRoutes(capas).toString(),
            operationZone = parseOperationZone(json.optJSONObject("zona_operacion")),
            pois = parsePois(json.optJSONArray("pois") ?: capas),
            coverageCircles = parsedAreas.coverageCircles,
            areaPolygons = parsedAreas.areaPolygons,
            structures = parseStructures(capas),
            operationGrid = parseOperationGrid(
                json.optJSONObject("grid") ?: json.optJSONObject("cuadricula_operacion")
            )
        )
    }

    fun parsePersonalList(items: JSONArray): List<PersonalItem> {
        val result = mutableListOf<PersonalItem>()

        for (i in 0 until items.length()) {
            val p = items.optJSONObject(i) ?: continue
            result.add(
                PersonalItem(
                    idPersonal = p.optInt("id_personal"),
                    apodo = p.optString("apodo", ""),
                    nombre = p.optString("nombre", ""),
                    apellido = p.optString("apellido", ""),
                    rol = p.optString("rol", ""),
                    puesto = p.optString("puesto", ""),
                    lat = nullableDouble(p, "latitud"),
                    lon = nullableDouble(p, "longitud")
                )
            )
        }

        return result
    }

    fun parseGridObject(grid: JSONObject?): OperationGridItem? =
        parseOperationGrid(grid)

    private fun parsePersonalPositions(posPersonal: JSONArray?): Map<Int, Pair<Double, Double>> {
        val posMap = mutableMapOf<Int, Pair<Double, Double>>()
        if (posPersonal == null) return posMap

        for (i in 0 until posPersonal.length()) {
            val p = posPersonal.optJSONObject(i) ?: continue
            posMap[p.optInt("id_personal")] = Pair(
                p.optDouble("latitud"),
                p.optDouble("longitud")
            )
        }

        return posMap
    }

    private fun parsePersonalFromLayers(
        capas: JSONArray?,
        posMap: Map<Int, Pair<Double, Double>>
    ): List<PersonalItem> {
        val personal = mutableListOf<PersonalItem>()
        if (capas == null) return personal

        for (i in 0 until capas.length()) {
            val c = capas.optJSONObject(i) ?: continue
            if (c.optString("tipo_capa") != "PERSONAL") continue

            val idP = c.optInt("id_referencia")
            val pos = posMap[idP]

            personal.add(
                PersonalItem(
                    idPersonal = idP,
                    apodo = c.optString("apodo", ""),
                    nombre = c.optString("nombre", ""),
                    apellido = c.optString("apellido", ""),
                    rol = c.optString("rol", ""),
                    puesto = c.optString("puesto", ""),
                    lat = pos?.first,
                    lon = pos?.second,
                    idGrupoOperacion = positiveInt(c, "id_grupo_operacion"),
                    idGrupoPadre = positiveInt(c, "grupo_padre_id"),
                    grupoNombre = c.optString("grupo_nombre", ""),
                    grupoApodo = c.optString("grupo_apodo", ""),
                    grupoPadreNombre = c.optString("grupo_padre_nombre", ""),
                    grupoPadreApodo = c.optString("grupo_padre_apodo", "")
                )
            )
        }

        return personal
    }

    private fun parseVehiculos(posVehiculos: JSONArray?): List<VehiculoItem> {
        val vehiculos = mutableListOf<VehiculoItem>()
        if (posVehiculos == null) return vehiculos

        for (i in 0 until posVehiculos.length()) {
            val v = posVehiculos.optJSONObject(i) ?: continue
            val codigoInterno = v.optString("codigo_interno", "")
            val nombreVehiculo = v.optString("nombre", "").ifBlank {
                if (codigoInterno.isNotBlank()) codigoInterno else "Vehiculo"
            }

            vehiculos.add(
                VehiculoItem(
                    idVehiculo = v.optInt("id_vehiculo"),
                    codigoInterno = codigoInterno,
                    nombre = nombreVehiculo,
                    tipo = v.optString("tipo", ""),
                    detalle = "",
                    idPersonalAsignado = positiveInt(v, "id_personal"),
                    tipoDestino = v.optString("tipo_destino", "").uppercase(),
                    asignadoAApodo = v.optString("asignado_a_apodo", ""),
                    personalNombre = v.optString("asignado_a_nombre", v.optString("personal_nombre", "")),
                    personalApellido = v.optString("asignado_a_apellido", v.optString("personal_apellido", "")),
                    personalPuesto = v.optString("personal_puesto", ""),
                    cetNombre = v.optString("cet_nombre", ""),
                    grupoNombre = v.optString("grupo_nombre", ""),
                    grupoPadreNombre = v.optString("grupo_padre_nombre", ""),
                    lat = nullableDouble(v, "latitud"),
                    lon = nullableDouble(v, "longitud")
                )
            )
        }

        return vehiculos
    }

    private fun parseEquipos(capas: JSONArray?): List<EquipoItem> {
        val equipos = mutableListOf<EquipoItem>()
        if (capas == null) return equipos

        for (i in 0 until capas.length()) {
            val c = capas.optJSONObject(i) ?: continue
            if (c.optString("tipo_capa") != "EQUIPO") continue

            val numeroSerie = c.optString("numero_serie", "")

            equipos.add(
                EquipoItem(
                    idEquipo = c.optInt("id_referencia"),
                    numeroSerie = numeroSerie,
                    nombre = c.optString("nombre", "Equipo"),
                    categoria = c.optString("categoria", ""),
                    tipoEquipo = c.optString("tipo_equipo", ""),
                    detalle = if (numeroSerie.isNotBlank()) "S/N: $numeroSerie" else "",
                    asignadoA = ""
                )
            )
        }

        return equipos
    }

    private fun parsePois(poisSource: JSONArray?): List<PoiItem> {
        val pois = mutableListOf<PoiItem>()
        if (poisSource == null) return pois

        for (i in 0 until poisSource.length()) {
            val c = poisSource.optJSONObject(i) ?: continue
            val isPoi = c.optString("tipo_capa").isBlank() || c.optString("tipo_capa") == "POI"
            if (!isPoi) continue

            val idPoi = if (c.has("id_poi")) c.optInt("id_poi") else c.optInt("id_elemento")
            if (idPoi <= 0) continue

            val iconoSrc = optionalString(c, "icono_src")
            val sidc = optionalString(c, "sidc") ?: iconoSrc?.takeIf { it.startsWith("S") }

            pois.add(
                PoiItem(
                    idPoi = idPoi,
                    nombre = c.optString("nombre", "PDI"),
                    tipoPoi = if (c.has("tipo_poi")) c.optString("tipo_poi", "") else c.optString("subtipo", ""),
                    lat = c.optDouble("latitud"),
                    lon = c.optDouble("longitud"),
                    color = c.optString("color", "#FFD700").ifBlank { "#FFD700" },
                    iconoSrc = iconoSrc,
                    sidc = sidc
                )
            )
        }

        return pois
    }

    private fun parseTacticalRoutes(capas: JSONArray?): JSONArray {
        val rutasTacticas = JSONArray()
        if (capas == null) return rutasTacticas

        for (i in 0 until capas.length()) {
            val c = capas.optJSONObject(i) ?: continue
            if (c.optString("tipo_capa") != "RUTA") continue

            val idRuta = if (c.has("id_ruta")) c.optInt("id_ruta") else c.optInt("id_elemento")
            if (idRuta <= 0) continue

            val geometria = geometryObject(c.opt("geometria")) ?: continue

            rutasTacticas.put(
                JSONObject()
                    .put("id_ruta", idRuta)
                    .put("nombre", c.optString("nombre", "Linea tactica"))
                    .put("geometria", geometria)
                    .put("color", c.optString("color", "#1E90FF").ifBlank { "#1E90FF" })
                    .put("estado", c.optString("estado", "ACTIVA"))
            )
        }

        return rutasTacticas
    }

    private fun parseStructures(capas: JSONArray?): List<StructureItem> {
        val structures = mutableListOf<StructureItem>()
        if (capas == null) return structures

        for (i in 0 until capas.length()) {
            val c = capas.optJSONObject(i) ?: continue
            val tipoCapa = c.optString("tipo_capa")
            val tipoEstructuraRaw = c.optString("tipo_estructura", "").ifBlank {
                if (tipoCapa == "EDIFICIO") c.optString("subtipo", "") else ""
            }
            val tipoEstructura = tipoEstructuraRaw.trim().uppercase()
            val isStructure =
                tipoCapa == "EDIFICIO" ||
                    tipoEstructura == "EDIFICIO" ||
                    tipoEstructura == "ETIQUETA"
            if (!isStructure) continue

            val idMarca = if (c.has("id_marca")) c.optInt("id_marca") else c.optInt("id_elemento")
            if (idMarca <= 0) continue

            structures.add(
                StructureItem(
                    idMarca = idMarca,
                    nombre = c.optString("nombre", "Estructura"),
                    tipoEstructura = if (tipoEstructura.isNotBlank()) tipoEstructura else "EDIFICIO",
                    lat = c.optDouble("latitud"),
                    lon = c.optDouble("longitud"),
                    iconoSrc = if (tipoEstructura == "ETIQUETA") null else "${ApiConfig.BASE_URL}/img/estructuras/casa.png"
                )
            )
        }

        return structures
    }

    private fun parseAreas(capas: JSONArray?): ParsedAreas {
        val coverageCircles = mutableListOf<CoverageCircleItem>()
        val areaPolygons = mutableListOf<AreaPolygonItem>()
        if (capas == null) return ParsedAreas(coverageCircles, areaPolygons)

        for (i in 0 until capas.length()) {
            val c = capas.optJSONObject(i) ?: continue
            if (c.optString("tipo_capa") != "AREA") continue

            val geometria = c.optJSONObject("geometria") ?: continue
            val meta = geometria.optJSONObject("meta") ?: JSONObject()
            val shape = meta.optString("shape", "").lowercase()

            if (shape == "polygon") {
                parseAreaPolygon(c, geometria, meta)?.let { areaPolygons.add(it) }
                continue
            }

            if (shape.equals("circle", ignoreCase = true)) {
                parseCoverageCircle(c, meta)?.let { coverageCircles.add(it) }
            }
        }

        return ParsedAreas(coverageCircles, areaPolygons)
    }

    private fun parseAreaPolygon(
        layer: JSONObject,
        geometria: JSONObject,
        meta: JSONObject
    ): AreaPolygonItem? {
        val rings = geometria.optJSONArray("coordinates") ?: return null
        val points = parseOuterRingPoints(rings.optJSONArray(0))
        if (points.size < 3) return null

        return AreaPolygonItem(
            idArea = layer.optInt("id_elemento"),
            nombre = layer.optString("nombre", "Poligono / Zona"),
            points = points,
            color = layer.optString("color", "#FFD700").ifBlank { "#FFD700" },
            opacity = meta.optDouble("opacity", 0.35),
            outlineWidth = meta.optDouble("outline_width", 3.0)
        )
    }

    private fun parseCoverageCircle(layer: JSONObject, meta: JSONObject): CoverageCircleItem? {
        val center = meta.optJSONArray("center") ?: return null
        if (center.length() < 2) return null

        val centerLon = center.optDouble(0, Double.NaN)
        val centerLat = center.optDouble(1, Double.NaN)
        val radiusM = meta.optDouble("radius_m", Double.NaN)
        if (centerLat.isNaN() || centerLon.isNaN() || radiusM.isNaN() || radiusM <= 0.0) return null

        return CoverageCircleItem(
            idArea = layer.optInt("id_elemento"),
            nombre = layer.optString("nombre", "Circulo de cobertura"),
            centerLat = centerLat,
            centerLon = centerLon,
            radiusM = radiusM,
            color = layer.optString("color", "#FF4500").ifBlank { "#FF4500" },
            opacity = meta.optDouble("opacity", 0.35),
            outlineWidth = meta.optDouble("outline_width", 3.0)
        )
    }

    private fun parseOperationZone(zona: JSONObject?): OperationZoneItem? {
        if (zona == null) return null

        val centerLat = zona.optDouble("centroide_lat", Double.NaN)
        val centerLon = zona.optDouble("centroide_lon", Double.NaN)
        val zoomInicial = zona.optInt("zoom_inicial", 1000)
        val geometria = zona.optJSONObject("geometria")
        val outerRing = geometria?.optJSONArray("coordinates")?.optJSONArray(0)
        if (centerLat.isNaN() || centerLon.isNaN() || outerRing == null) return null

        val points = parseOuterRingPoints(outerRing)
        if (points.size < 3) return null

        return OperationZoneItem(
            idZona = zona.optInt("id_zona"),
            nombre = zona.optString("nombre", "Zona de operacion"),
            centerLat = centerLat,
            centerLon = centerLon,
            zoomInicial = if (zoomInicial > 0) zoomInicial else 1000,
            color = zona.optString("color", "#3b82f6").ifBlank { "#3b82f6" },
            points = points
        )
    }

    private fun parseOperationGrid(grid: JSONObject?): OperationGridItem? {
        if (grid == null) return null

        val size = grid.optString("size", "").trim().lowercase()
        val sizeMatch = Regex("""^(\d+)x(\d+)$""").matchEntire(size)
        val rows = positiveInt(grid, "rows") ?: sizeMatch?.groupValues?.getOrNull(1)?.toIntOrNull()
        val cols = positiveInt(grid, "cols") ?: sizeMatch?.groupValues?.getOrNull(2)?.toIntOrNull()
        if (size.isBlank() || rows == null || cols == null || rows <= 0 || cols <= 0) return null

        val rawNames = grid.optJSONArray("names") ?: grid.optJSONArray("nombres") ?: JSONArray()
        val total = rows * cols
        val names = List(total) { index ->
            rawNames.optString(index, "").trim()
        }

        return OperationGridItem(
            idCuadricula = grid.optInt("id_cuadricula", -1),
            size = size,
            rows = rows,
            cols = cols,
            names = names
        )
    }

    private fun parseOuterRingPoints(outerRing: JSONArray?): List<Pair<Double, Double>> {
        if (outerRing == null || outerRing.length() < 4) return emptyList()

        val points = mutableListOf<Pair<Double, Double>>()
        for (i in 0 until outerRing.length() - 1) {
            val point = outerRing.optJSONArray(i) ?: continue
            val lon = point.optDouble(0, Double.NaN)
            val lat = point.optDouble(1, Double.NaN)
            if (lat.isNaN() || lon.isNaN()) continue
            points.add(lat to lon)
        }

        return points
    }

    private fun geometryObject(raw: Any?): JSONObject? =
        when (raw) {
            is JSONObject -> raw
            is String -> runCatching { JSONObject(raw) }.getOrNull()
            else -> null
        }

    private fun nullableDouble(json: JSONObject, key: String): Double? =
        if (json.isNull(key)) null else json.optDouble(key)

    private fun positiveInt(json: JSONObject, key: String): Int? =
        json.optInt(key, -1).takeIf { it > 0 }

    private fun optionalString(json: JSONObject, key: String): String? {
        if (!json.has(key) || json.isNull(key)) return null
        val cleaned = json.optString(key, "").trim()
        return if (cleaned.isBlank() || cleaned.equals("null", ignoreCase = true)) null else cleaned
    }
}
