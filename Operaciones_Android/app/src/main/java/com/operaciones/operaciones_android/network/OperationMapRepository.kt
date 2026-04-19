package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.AreaPolygonItem
import com.operaciones.operaciones_android.model.CoverageCircleItem
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.OperationZoneItem
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.PoiItem
import com.operaciones.operaciones_android.model.StructureItem
import com.operaciones.operaciones_android.model.VehiculoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class OperationMapRepository(
    private val http: OkHttpClient = OkHttpClient()
) {

    private fun normalizedOptionalString(value: String?): String? {
        val cleaned = value?.trim()
        return if (cleaned.isNullOrBlank() || cleaned.equals("null", ignoreCase = true)) null else cleaned
    }

    fun fetchMapaData(
        operationId: Int,
        token: String,
        onSuccess: (OperationMapData) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/mapa")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión — paneles no disponibles.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    val json = JSONObject(bodyStr)

                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los datos del mapa."))
                        return
                    }

                    val capas = json.optJSONArray("capas")
                    val posPersonal = json.optJSONArray("personal")

                    val posMap = mutableMapOf<Int, Pair<Double, Double>>()
                    if (posPersonal != null) {
                        for (i in 0 until posPersonal.length()) {
                            val p = posPersonal.getJSONObject(i)
                            posMap[p.optInt("id_personal")] = Pair(
                                p.optDouble("latitud"),
                                p.optDouble("longitud")
                            )
                        }
                    }

                    val personal = mutableListOf<PersonalItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
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
                                    idGrupoOperacion = c.optInt("id_grupo_operacion", -1).takeIf { it > 0 },
                                    idGrupoPadre = c.optInt("grupo_padre_id", -1).takeIf { it > 0 },
                                    grupoNombre = c.optString("grupo_nombre", ""),
                                    grupoApodo = c.optString("grupo_apodo", ""),
                                    grupoPadreNombre = c.optString("grupo_padre_nombre", ""),
                                    grupoPadreApodo = c.optString("grupo_padre_apodo", "")
                                )
                            )
                        }
                    }

                    val vehiculos = mutableListOf<VehiculoItem>()
                    val posVehiculos = json.optJSONArray("vehiculos")
                    if (posVehiculos != null) {
                        for (i in 0 until posVehiculos.length()) {
                            val v = posVehiculos.getJSONObject(i)

                            val codigoInterno = v.optString("codigo_interno", "")
                            val nombreVehiculo = v.optString("nombre", "").ifBlank {
                                if (codigoInterno.isNotBlank()) codigoInterno else "Vehículo"
                            }

                            vehiculos.add(
                                VehiculoItem(
                                    idVehiculo = v.optInt("id_vehiculo"),
                                    codigoInterno = codigoInterno,
                                    nombre = nombreVehiculo,
                                    tipo = v.optString("tipo", ""),
                                    detalle = ""
                                )
                            )
                        }
                    }

                    val equipos = mutableListOf<EquipoItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
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
                    }

                    val poisSource = json.optJSONArray("pois") ?: capas
                    val pois = mutableListOf<PoiItem>()
                    if (poisSource != null) {
                        for (i in 0 until poisSource.length()) {
                            val c = poisSource.getJSONObject(i)
                            val isPoi = c.optString("tipo_capa").isBlank() || c.optString("tipo_capa") == "POI"
                            if (!isPoi) continue

                            val idPoi = if (c.has("id_poi")) c.optInt("id_poi") else c.optInt("id_elemento")
                            if (idPoi <= 0) continue

                            val iconoSrc = normalizedOptionalString(c.optString("icono_src", null))
                            val sidc = normalizedOptionalString(c.optString("sidc", null))
                                ?: iconoSrc?.takeIf { it.startsWith("S") }

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
                    }

                    val structures = mutableListOf<StructureItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
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
                    }

                    val coverageCircles = mutableListOf<CoverageCircleItem>()
                    val areaPolygons = mutableListOf<AreaPolygonItem>()
                    if (capas != null) {
                        for (i in 0 until capas.length()) {
                            val c = capas.getJSONObject(i)
                            if (c.optString("tipo_capa") != "AREA") continue

                            val geometria = c.optJSONObject("geometria") ?: continue
                            val metaAny = geometria.optJSONObject("meta") ?: JSONObject()
                            val shape = metaAny.optString("shape", "").lowercase()

                            if (shape == "polygon") {
                                val rings = geometria.optJSONArray("coordinates") ?: continue
                                val outerRing = rings.optJSONArray(0) ?: continue
                                if (outerRing.length() < 4) continue

                                val points = mutableListOf<Pair<Double, Double>>()
                                for (j in 0 until outerRing.length() - 1) {
                                    val point = outerRing.optJSONArray(j) ?: continue
                                    val lon = point.optDouble(0, Double.NaN)
                                    val lat = point.optDouble(1, Double.NaN)
                                    if (lat.isNaN() || lon.isNaN()) continue
                                    points.add(lat to lon)
                                }

                                if (points.size < 3) continue

                                areaPolygons.add(
                                    AreaPolygonItem(
                                        idArea = c.optInt("id_elemento"),
                                        nombre = c.optString("nombre", "PolÃ­gono / Zona"),
                                        points = points,
                                        color = c.optString("color", "#FFD700").ifBlank { "#FFD700" },
                                        opacity = metaAny.optDouble("opacity", 0.35),
                                        outlineWidth = metaAny.optDouble("outline_width", 3.0)
                                    )
                                )
                                continue
                            }
                            val meta = geometria.optJSONObject("meta") ?: continue
                            if (!meta.optString("shape").equals("circle", ignoreCase = true)) continue

                            val center = meta.optJSONArray("center") ?: continue
                            if (center.length() < 2) continue

                            val centerLon = center.optDouble(0, Double.NaN)
                            val centerLat = center.optDouble(1, Double.NaN)
                            val radiusM = meta.optDouble("radius_m", Double.NaN)
                            if (centerLat.isNaN() || centerLon.isNaN() || radiusM.isNaN() || radiusM <= 0.0) continue

                            coverageCircles.add(
                                CoverageCircleItem(
                                    idArea = c.optInt("id_elemento"),
                                    nombre = c.optString("nombre", "Círculo de cobertura"),
                                    centerLat = centerLat,
                                    centerLon = centerLon,
                                    radiusM = radiusM,
                                    color = c.optString("color", "#FF4500").ifBlank { "#FF4500" },
                                    opacity = meta.optDouble("opacity", 0.35),
                                    outlineWidth = meta.optDouble("outline_width", 3.0)
                                )
                            )
                        }
                    }

                    val rutasNav = json.optJSONArray("rutas_navegacion")?.toString()
                    val operationZone = json.optJSONObject("zona_operacion")?.let { zona ->
                        val centerLat = zona.optDouble("centroide_lat", Double.NaN)
                        val centerLon = zona.optDouble("centroide_lon", Double.NaN)
                        val zoomInicial = zona.optInt("zoom_inicial", 1000)
                        val geometria = zona.optJSONObject("geometria")
                        val outerRing = geometria?.optJSONArray("coordinates")?.optJSONArray(0)
                        if (centerLat.isNaN() || centerLon.isNaN() || outerRing == null || outerRing.length() < 4) {
                            null
                        } else {
                            val points = mutableListOf<Pair<Double, Double>>()
                            for (i in 0 until outerRing.length() - 1) {
                                val point = outerRing.optJSONArray(i) ?: continue
                                val lon = point.optDouble(0, Double.NaN)
                                val lat = point.optDouble(1, Double.NaN)
                                if (lat.isNaN() || lon.isNaN()) continue
                                points.add(lat to lon)
                            }

                            if (points.size < 3) {
                                null
                            } else {
                                OperationZoneItem(
                                    idZona = zona.optInt("id_zona"),
                                    nombre = zona.optString("nombre", "Zona de operación"),
                                    centerLat = centerLat,
                                    centerLon = centerLon,
                                    zoomInicial = if (zoomInicial > 0) zoomInicial else 1000,
                                    color = zona.optString("color", "#3b82f6").ifBlank { "#3b82f6" },
                                    points = points
                                )
                            }
                        }
                    }

                    onSuccess(
                        OperationMapData(
                            personal = personal,
                            vehiculos = vehiculos,
                            equipos = equipos,
                            rutasNavegacion = rutasNav,
                            operationZone = operationZone,
                            pois = pois,
                            coverageCircles = coverageCircles,
                            areaPolygons = areaPolygons,
                            structures = structures
                        )
                    )

                } catch (e: Exception) {
                    onError("Error cargando datos del mapa.")
                }
            }
        })
    }

    fun fetchPersonalData(
        operationId: Int,
        token: String,
        onSuccess: (List<PersonalItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/personal")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión cargando personal.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    val json = JSONObject(bodyStr)

                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudo cargar el personal."))
                        return
                    }

                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    val result = mutableListOf<PersonalItem>()

                    for (i in 0 until items.length()) {
                        val p = items.getJSONObject(i)
                        result.add(
                            PersonalItem(
                                idPersonal = p.optInt("id_personal"),
                                apodo = p.optString("apodo", ""),
                                nombre = p.optString("nombre", ""),
                                apellido = p.optString("apellido", ""),
                                rol = p.optString("rol", ""),
                                puesto = p.optString("puesto", ""),
                                lat = if (p.isNull("latitud")) null else p.optDouble("latitud"),
                                lon = if (p.isNull("longitud")) null else p.optDouble("longitud")
                            )
                        )
                    }

                    onSuccess(result)
                } catch (e: Exception) {
                    onError("Error procesando personal.")
                }
            }
        })
    }
}
