package com.operaciones.operaciones_android.ui.socket

import com.operaciones.operaciones_android.network.ChatSocketManager
import org.json.JSONArray
import org.json.JSONObject

class OperationSocketController(
    private val host: Host
) {
    interface Host {
        fun getSocketOperationId(): Int
        fun getSocketUserId(): Int
        fun getSocketUserRole(): String
        fun getSocketUserName(): String
        fun getSocketLastKnownLat(): Double?
        fun getSocketLastKnownLon(): Double?
        fun isSocketCesiumReady(): Boolean
        fun runSocketOnUi(block: () -> Unit)
        fun onSocketNewMessage(item: JSONObject)
        fun onSocketRemoteRouteCreated(routeJson: String, route: JSONObject)
        fun onSocketRemoteRouteDeleted(idRoute: Int)
        fun onSocketTacticalRouteCreated(route: JSONObject)
        fun onSocketTacticalRouteDeleted(idRoute: Int)
        fun onSocketTrackingPersonal(id: Int, lat: Double, lon: Double, label: String)
        fun onSocketTrackingVehicle(id: Int, lat: Double, lon: Double, label: String)
        fun onSocketPoiCreated(
            idPoi: Int,
            lat: Double,
            lon: Double,
            nombre: String,
            tipo: String,
            color: String,
            iconoSrc: String?,
            sidc: String?
        )
        fun onSocketPoiDeleted(idPoi: Int)
        fun onSocketAreaPolygonCreated(
            idArea: Int,
            nombre: String,
            pointsJson: String,
            color: String,
            opacity: Double,
            outlineWidth: Double
        )
        fun onSocketCoverageCircleCreated(
            idArea: Int,
            centerLat: Double,
            centerLon: Double,
            radiusM: Double,
            nombre: String,
            color: String,
            opacity: Double,
            outlineWidth: Double
        )
        fun onSocketAreaDeleted(idArea: Int)
        fun onSocketStructureCreated(
            idMarca: Int,
            lat: Double,
            lon: Double,
            nombre: String,
            tipoEstructura: String
        )
        fun onSocketStructureDeleted(idMarca: Int)
        fun onSocketDrawingCreated(dibujo: JSONObject)
        fun onSocketDrawingDeleted(idDibujo: Int)
        fun onSocketConnected()
        fun onSocketDisconnected()
    }

    fun create(): ChatSocketManager? {
        val operationId = host.getSocketOperationId()
        if (operationId <= 0) return null

        var manager: ChatSocketManager? = null
        manager = ChatSocketManager(
            operationId = operationId,
            idPersonal = host.getSocketUserId(),
            rol = host.getSocketUserRole(),
            onNewMessage = { item ->
                host.runSocketOnUi { host.onSocketNewMessage(item) }
            },
            onNavigationRouteEvt = { event, data ->
                host.runSocketOnUi {
                    when (event) {
                        "creada" -> {
                            val route = data.optJSONObject("ruta") ?: return@runSocketOnUi
                            host.onSocketRemoteRouteCreated(route.toString(), route)
                        }
                        "eliminada" -> host.onSocketRemoteRouteDeleted(data.optInt("id_ruta", -1))
                    }
                }
            },
            onTacticalRouteCreada = { data ->
                host.runSocketOnUi {
                    val route = data.optJSONObject("ruta") ?: return@runSocketOnUi
                    if (route.optInt("id_ruta", -1) > 0) host.onSocketTacticalRouteCreated(route)
                }
            },
            onTacticalRouteEliminada = { data ->
                host.runSocketOnUi { host.onSocketTacticalRouteDeleted(data.optInt("id_ruta", -1)) }
            },
            onTrackingPersonal = { data ->
                host.runSocketOnUi {
                    val id = data.optInt("id_personal")
                    val lat = data.optDouble("latitud")
                    val lon = data.optDouble("longitud")
                    val label = data.optString("apodo", data.optString("nombre", "P-$id"))
                    if (id > 0 && id != host.getSocketUserId() && !lat.isNaN() && !lon.isNaN()) {
                        host.onSocketTrackingPersonal(id, lat, lon, label)
                    }
                }
            },
            onTrackingVehiculo = { data ->
                host.runSocketOnUi {
                    val id = data.optInt("id_vehiculo")
                    val lat = data.optDouble("latitud")
                    val lon = data.optDouble("longitud")
                    val label = data.optString("alias", data.optString("nombre", "V-$id"))
                    if (id > 0) host.onSocketTrackingVehicle(id, lat, lon, label)
                }
            },
            onPoiCreado = { data ->
                host.runSocketOnUi {
                    val poi = data.optJSONObject("poi") ?: return@runSocketOnUi
                    host.onSocketPoiCreated(
                        idPoi = poi.optInt("id_poi"),
                        lat = poi.optDouble("latitud"),
                        lon = poi.optDouble("longitud"),
                        nombre = poi.optString("nombre", "PDI"),
                        tipo = poi.optString("tipo_poi", ""),
                        color = poi.optString("color", "#FFD700").ifBlank { "#FFD700" },
                        iconoSrc = optionalString(poi, "icono_src"),
                        sidc = optionalString(poi, "sidc")
                    )
                }
            },
            onPoiEliminado = { data ->
                host.runSocketOnUi { host.onSocketPoiDeleted(data.optInt("id_poi", -1)) }
            },
            onAreaCreada = { data ->
                host.runSocketOnUi {
                    val area = data.optJSONObject("area") ?: return@runSocketOnUi
                    emitAreaCreated(area)
                }
            },
            onAreaEliminada = { data ->
                host.runSocketOnUi { host.onSocketAreaDeleted(data.optInt("id_area", -1)) }
            },
            onStructureCreada = { data ->
                host.runSocketOnUi {
                    val structure = data.optJSONObject("estructura") ?: return@runSocketOnUi
                    val idMarca = structure.optInt("id_marca", -1)
                    val lat = structure.optDouble("latitud", Double.NaN)
                    val lon = structure.optDouble("longitud", Double.NaN)
                    if (idMarca <= 0 || lat.isNaN() || lon.isNaN()) return@runSocketOnUi
                    host.onSocketStructureCreated(
                        idMarca = idMarca,
                        lat = lat,
                        lon = lon,
                        nombre = structure.optString("nombre", "Estructura"),
                        tipoEstructura = structure.optString("tipo_estructura", "EDIFICIO")
                    )
                }
            },
            onStructureEliminada = { data ->
                host.runSocketOnUi { host.onSocketStructureDeleted(data.optInt("id_marca", -1)) }
            },
            onDibujoCreado = { data ->
                host.runSocketOnUi {
                    val dibujo = data.optJSONObject("dibujo") ?: return@runSocketOnUi
                    host.onSocketDrawingCreated(dibujo)
                }
            },
            onDibujoEliminado = { data ->
                host.runSocketOnUi { host.onSocketDrawingDeleted(data.optInt("id_dibujo", -1)) }
            },
            onConnected = {
                host.runSocketOnUi { host.onSocketConnected() }
                val lat = host.getSocketLastKnownLat() ?: return@ChatSocketManager
                val lon = host.getSocketLastKnownLon() ?: return@ChatSocketManager
                manager?.emitTracking(
                    idPersonal = host.getSocketUserId(),
                    lat = lat,
                    lon = lon,
                    apodo = host.getSocketUserName(),
                    rol = host.getSocketUserRole()
                )
            },
            onDisconnected = {
                host.runSocketOnUi { host.onSocketDisconnected() }
            },
            onConnectionError = {
                host.runSocketOnUi { host.onSocketDisconnected() }
            }
        )

        return manager
    }

    private fun emitAreaCreated(area: JSONObject) {
        val geometria = area.optJSONObject("geometria") ?: return
        val meta = geometria.optJSONObject("meta") ?: JSONObject()
        val shape = meta.optString("shape", "").lowercase()

        if (shape == "polygon") {
            val idArea = area.optInt("id_area", -1)
            val points = parseOuterRingPoints(geometria.optJSONArray("coordinates")?.optJSONArray(0))
            if (idArea <= 0 || points.size < 3) return
            host.onSocketAreaPolygonCreated(
                idArea = idArea,
                nombre = area.optString("nombre", "Poligono / Zona"),
                pointsJson = buildPolygonPointsJson(points),
                color = area.optString("color", "#FFD700").ifBlank { "#FFD700" },
                opacity = meta.optDouble("opacity", 0.35),
                outlineWidth = meta.optDouble("outline_width", 3.0)
            )
            return
        }

        if (!shape.equals("circle", ignoreCase = true)) return
        val center = meta.optJSONArray("center") ?: return
        if (center.length() < 2) return

        val idArea = area.optInt("id_area", -1)
        val centerLon = center.optDouble(0, Double.NaN)
        val centerLat = center.optDouble(1, Double.NaN)
        val radiusM = meta.optDouble("radius_m", Double.NaN)
        if (idArea <= 0 || centerLat.isNaN() || centerLon.isNaN() || radiusM.isNaN()) return

        host.onSocketCoverageCircleCreated(
            idArea = idArea,
            centerLat = centerLat,
            centerLon = centerLon,
            radiusM = radiusM,
            nombre = area.optString("nombre", "Circulo de cobertura"),
            color = area.optString("color", "#FF4500").ifBlank { "#FF4500" },
            opacity = meta.optDouble("opacity", 0.35),
            outlineWidth = meta.optDouble("outline_width", 3.0)
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

    private fun buildPolygonPointsJson(points: List<Pair<Double, Double>>): String =
        buildString {
            append("[")
            points.forEachIndexed { index, point ->
                if (index > 0) append(",")
                append("{")
                append("\"lat\":${point.first},")
                append("\"lon\":${point.second}")
                append("}")
            }
            append("]")
        }

    private fun optionalString(json: JSONObject, key: String): String? {
        if (!json.has(key) || json.isNull(key)) return null
        return json.optString(key, "").trim()
            .takeUnless { it.isBlank() || it.equals("null", ignoreCase = true) }
    }
}
