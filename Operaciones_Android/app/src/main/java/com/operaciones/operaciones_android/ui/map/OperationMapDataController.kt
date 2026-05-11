package com.operaciones.operaciones_android.ui.map

import android.webkit.WebView
import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.AreaPolygonItem
import com.operaciones.operaciones_android.model.CoverageCircleItem
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.model.OperationZoneItem
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.PoiItem
import com.operaciones.operaciones_android.model.StructureItem
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.network.OperationMapRepository
import com.operaciones.operaciones_android.webview.CesiumWebController
import org.json.JSONArray
import org.json.JSONObject

class OperationMapDataController(
    private val webView: WebView,
    private val cesiumWebController: CesiumWebController,
    private val host: Host,
    private val operationMapRepository: OperationMapRepository = OperationMapRepository()
) {
    interface Host {
        fun getMapDataOperationId(): Int
        fun getMapDataToken(): String
        fun getMapDataCurrentUserId(): Int
        fun isMapDataCesiumReady(): Boolean
        fun runMapDataOnUi(block: () -> Unit)
        fun onMapDataOperationZoneChanged(lat: Double, lon: Double, zoom: Int)
        fun onMapDataNavigationRoutesLoaded(routesJson: String)
        fun updateMapDataPersonalPanel(idPersonal: Int, lat: Double, lon: Double)
        fun loadMapDataDrawings(replace: Boolean = true)
        fun onMapDataError(message: String)
    }

    private data class PendingPoiAddition(
        val idPoi: Int,
        val lat: Double,
        val lon: Double,
        val nombre: String,
        val tipoPoi: String,
        val color: String,
        val iconoSrc: String? = null,
        val sidc: String? = null
    )

    private data class PendingCoverageCircleAddition(
        val idArea: Int,
        val centerLat: Double,
        val centerLon: Double,
        val radiusM: Double,
        val nombre: String,
        val color: String,
        val opacity: Double,
        val outlineWidth: Double
    )

    private data class PendingAreaPolygonAddition(
        val idArea: Int,
        val nombre: String,
        val pointsJson: String,
        val color: String,
        val opacity: Double,
        val outlineWidth: Double
    )

    private data class PendingStructureAddition(
        val idMarca: Int,
        val lat: Double,
        val lon: Double,
        val nombre: String,
        val tipoEstructura: String,
        val iconoSrc: String? = null
    )

    private var pendingPoisJson: String? = null
    private var pendingRemoteRoutesJson: String? = null
    private var pendingTacticalRoutesJson: String? = null
    private var pendingOperationZoneJson: String? = null
    private var pendingCoverageCirclesJson: String? = null
    private var pendingAreaPolygonsJson: String? = null
    private var pendingStructuresJson: String? = null

    private val pendingPoiAdditions = mutableListOf<PendingPoiAddition>()
    private val pendingCoverageCircleAdditions = mutableListOf<PendingCoverageCircleAddition>()
    private val pendingAreaPolygonAdditions = mutableListOf<PendingAreaPolygonAddition>()
    private val pendingStructureAdditions = mutableListOf<PendingStructureAddition>()

    private var lastMapSyncAt = 0L

    fun fetchMapaData() {
        val operationId = host.getMapDataOperationId()
        if (operationId <= 0) return

        operationMapRepository.fetchMapaData(
            operationId = operationId,
            token = host.getMapDataToken(),
            onSuccess = { data ->
                host.runMapDataOnUi {
                    applyMapData(data)
                }
            },
            onError = { message ->
                host.runMapDataOnUi {
                    host.onMapDataError(message)
                }
            }
        )
    }

    fun syncFromBackend(force: Boolean = false) {
        val operationId = host.getMapDataOperationId()
        if (operationId <= 0) return

        val now = System.currentTimeMillis()
        if (!force && now - lastMapSyncAt < SYNC_THROTTLE_MS) return
        lastMapSyncAt = now

        fetchMapaData()
        if (host.isMapDataCesiumReady()) {
            host.loadMapDataDrawings(replace = true)
        }
    }

    fun onRemoteRouteCreated(routeJson: String, route: JSONObject) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadRemoteRoutes("[$routeJson]")
        } else {
            pendingRemoteRoutesJson = mergePendingRouteJson(pendingRemoteRoutesJson, route)
        }
    }

    fun onTacticalRouteCreated(route: JSONObject) {
        val routeJson = route.toString()
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadTacticalRoutes("[$routeJson]")
        } else {
            pendingTacticalRoutesJson = mergePendingRouteJson(pendingTacticalRoutesJson, route)
        }
    }

    fun onPoiCreated(
        idPoi: Int,
        lat: Double,
        lon: Double,
        nombre: String,
        tipo: String,
        color: String,
        iconoSrc: String?,
        sidc: String?
    ) {
        if (idPoi <= 0) return

        val resolvedIcon = resolvePoiIconUrl(iconoSrc)
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.addPoiToMap(idPoi, lat, lon, nombre, tipo, color, resolvedIcon, sidc)
        } else {
            pendingPoiAdditions.add(PendingPoiAddition(idPoi, lat, lon, nombre, tipo, color, resolvedIcon, sidc))
        }
    }

    fun onAreaPolygonCreated(
        idArea: Int,
        nombre: String,
        pointsJson: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.addAreaPolygonToMap(idArea, nombre, pointsJson, color, opacity, outlineWidth)
        } else {
            pendingAreaPolygonAdditions.add(
                PendingAreaPolygonAddition(idArea, nombre, pointsJson, color, opacity, outlineWidth)
            )
        }
    }

    fun onCoverageCircleCreated(
        idArea: Int,
        centerLat: Double,
        centerLon: Double,
        radiusM: Double,
        nombre: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.addCoverageCircleToMap(
                idArea,
                centerLat,
                centerLon,
                radiusM,
                nombre,
                color,
                opacity,
                outlineWidth
            )
        } else {
            pendingCoverageCircleAdditions.add(
                PendingCoverageCircleAddition(idArea, centerLat, centerLon, radiusM, nombre, color, opacity, outlineWidth)
            )
        }
    }

    fun onStructureCreated(
        idMarca: Int,
        lat: Double,
        lon: Double,
        nombre: String,
        tipoEstructura: String
    ) {
        val iconoSrc = resolveStructureIconUrl(tipoEstructura)
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.addStructureToMap(idMarca, lat, lon, nombre, tipoEstructura, iconoSrc)
        } else {
            pendingStructureAdditions.add(PendingStructureAddition(idMarca, lat, lon, nombre, tipoEstructura, iconoSrc))
        }
    }

    fun applyOperationView() {
        pendingOperationZoneJson?.let { json ->
            pendingOperationZoneJson = null
            cesiumWebController.loadOperationZone(json)
        }

        pendingRemoteRoutesJson?.let { json ->
            pendingRemoteRoutesJson = null
            cesiumWebController.loadRemoteRoutes(json, replace = true)
        }

        pendingTacticalRoutesJson?.let { json ->
            pendingTacticalRoutesJson = null
            cesiumWebController.loadTacticalRoutes(json, replace = true)
        }

        pendingPoisJson?.let { json ->
            pendingPoisJson = null
            cesiumWebController.loadPois(json, replace = true)
        }

        if (pendingCoverageCirclesJson != null || pendingAreaPolygonsJson != null) {
            val circlesJson = pendingCoverageCirclesJson ?: "[]"
            val polygonsJson = pendingAreaPolygonsJson ?: "[]"
            pendingCoverageCirclesJson = null
            pendingAreaPolygonsJson = null
            cesiumWebController.syncAreas(circlesJson, polygonsJson)
        }

        pendingStructuresJson?.let { json ->
            pendingStructuresJson = null
            cesiumWebController.loadStructures(json, replace = true)
        }

        flushPendingAdditions()

        if (host.getMapDataOperationId() > 0) {
            host.loadMapDataDrawings(replace = true)
            syncFromBackend(force = true)
        }
    }

    private fun applyMapData(data: OperationMapData) {
        applyOperationZone(data.operationZone)

        data.rutasNavegacion?.let { routesJson ->
            host.onMapDataNavigationRoutesLoaded(routesJson)
            webView.postDelayed({
                cesiumWebController.evaluate(
                    "if(typeof loadRemoteRoutes === 'function') loadRemoteRoutes($routesJson)"
                )
            }, CESIUM_LOAD_DELAY_MS)
        }

        loadOrPendingRemoteRoutes(data.rutasNavegacion ?: "[]", replace = true)
        loadOrPendingTacticalRoutes(data.rutasTacticas ?: "[]", replace = true)

        val trackingDelayMs = if (host.isMapDataCesiumReady()) 0L else CESIUM_LOAD_DELAY_MS
        webView.postDelayed({
            loadInitialTrackingMarkers(data.personal, data.vehiculos)
        }, trackingDelayMs)

        syncMapObjectLayers(data)
    }

    private fun applyOperationZone(zone: OperationZoneItem?) {
        if (zone == null) {
            cesiumWebController.applyOperationView()
            return
        }

        host.onMapDataOperationZoneChanged(zone.centerLat, zone.centerLon, zone.zoomInicial)
        cesiumWebController.setOperationView(zone.centerLat, zone.centerLon, zone.zoomInicial)
        loadOrPendingOperationZone(operationZoneJson(zone).toString())
    }

    private fun syncMapObjectLayers(data: OperationMapData) {
        val poisJson = JSONArray().apply {
            data.pois.forEach { put(poiJson(it)) }
        }.toString()

        val circlesJson = JSONArray().apply {
            data.coverageCircles.forEach { put(coverageCircleJson(it)) }
        }.toString()

        val polygonsJson = JSONArray().apply {
            data.areaPolygons.forEach { put(areaPolygonJson(it)) }
        }.toString()

        val structuresJson = JSONArray().apply {
            data.structures.forEach { put(structureJson(it)) }
        }.toString()

        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadPois(poisJson, replace = true)
            cesiumWebController.syncAreas(circlesJson, polygonsJson)
            cesiumWebController.loadStructures(structuresJson, replace = true)
        } else {
            pendingPoisJson = poisJson
            pendingCoverageCirclesJson = circlesJson
            pendingAreaPolygonsJson = polygonsJson
            pendingStructuresJson = structuresJson
        }
    }

    private fun loadOrPendingOperationZone(zoneJson: String) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadOperationZone(zoneJson)
        } else {
            pendingOperationZoneJson = zoneJson
        }
    }

    private fun loadOrPendingRemoteRoutes(routesJson: String, replace: Boolean) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadRemoteRoutes(routesJson, replace)
        } else {
            pendingRemoteRoutesJson = routesJson
        }
    }

    private fun loadOrPendingTacticalRoutes(routesJson: String, replace: Boolean) {
        if (host.isMapDataCesiumReady()) {
            cesiumWebController.loadTacticalRoutes(routesJson, replace)
        } else {
            pendingTacticalRoutesJson = routesJson
        }
    }

    private fun flushPendingAdditions() {
        pendingCoverageCircleAdditions.forEach { circle ->
            cesiumWebController.addCoverageCircleToMap(
                circle.idArea,
                circle.centerLat,
                circle.centerLon,
                circle.radiusM,
                circle.nombre,
                circle.color,
                circle.opacity,
                circle.outlineWidth
            )
        }
        pendingCoverageCircleAdditions.clear()

        pendingAreaPolygonAdditions.forEach { polygon ->
            cesiumWebController.addAreaPolygonToMap(
                polygon.idArea,
                polygon.nombre,
                polygon.pointsJson,
                polygon.color,
                polygon.opacity,
                polygon.outlineWidth
            )
        }
        pendingAreaPolygonAdditions.clear()

        pendingStructureAdditions.forEach { structure ->
            cesiumWebController.addStructureToMap(
                structure.idMarca,
                structure.lat,
                structure.lon,
                structure.nombre,
                structure.tipoEstructura,
                structure.iconoSrc
            )
        }
        pendingStructureAdditions.clear()

        pendingPoiAdditions.forEach { poi ->
            cesiumWebController.addPoiToMap(
                poi.idPoi,
                poi.lat,
                poi.lon,
                poi.nombre,
                poi.tipoPoi,
                poi.color,
                poi.iconoSrc,
                poi.sidc
            )
        }
        pendingPoiAdditions.clear()
    }

    private fun mergePendingRouteJson(currentJson: String?, route: JSONObject): String {
        val id = route.optInt("id_ruta", -1)
        val merged = runCatching { JSONArray(currentJson ?: "[]") }.getOrDefault(JSONArray())
        if (id <= 0) {
            merged.put(route)
            return merged.toString()
        }

        for (index in 0 until merged.length()) {
            val existing = merged.optJSONObject(index) ?: continue
            if (existing.optInt("id_ruta", -1) == id) {
                merged.put(index, route)
                return merged.toString()
            }
        }

        merged.put(route)
        return merged.toString()
    }

    private fun loadInitialTrackingMarkers(personal: List<PersonalItem>, vehiculos: List<VehiculoItem>) {
        val currentUserId = host.getMapDataCurrentUserId()
        val js = buildString {
            append("(function(){")
            personal.forEach { person ->
                val lat = person.lat ?: return@forEach
                val lon = person.lon ?: return@forEach
                host.updateMapDataPersonalPanel(person.idPersonal, lat, lon)
                if (person.idPersonal == currentUserId) return@forEach
                val label = person.apodo.ifBlank { "${person.nombre} ${person.apellido}".trim() }
                    .ifBlank { "P-${person.idPersonal}" }
                append("if(typeof updateTrackingPersonal==='function') updateTrackingPersonal(")
                append(person.idPersonal)
                append(",")
                append(lat)
                append(",")
                append(lon)
                append(",'")
                append(jsString(label))
                append("');")
            }
            vehiculos.forEach { vehiculo ->
                val lat = vehiculo.lat ?: return@forEach
                val lon = vehiculo.lon ?: return@forEach
                val label = vehiculo.alias.ifBlank { vehiculo.codigoInterno }
                    .ifBlank { vehiculo.nombre }
                    .ifBlank { "V-${vehiculo.idVehiculo}" }
                append("if(typeof updateTrackingVehiculo==='function') updateTrackingVehiculo(")
                append(vehiculo.idVehiculo)
                append(",")
                append(lat)
                append(",")
                append(lon)
                append(",'")
                append(jsString(label))
                append("');")
            }
            append("})();")
        }
        cesiumWebController.evaluate(js)
    }

    private fun operationZoneJson(zone: OperationZoneItem): JSONObject =
        JSONObject()
            .put("id_zona", zone.idZona)
            .put("nombre", zone.nombre)
            .put("centroide_lat", zone.centerLat)
            .put("centroide_lon", zone.centerLon)
            .put("zoom_inicial", zone.zoomInicial)
            .put("color", zone.color)
            .put("points", pointsJson(zone.points))

    private fun poiJson(poi: PoiItem): JSONObject =
        JSONObject()
            .put("id_poi", poi.idPoi)
            .put("nombre", poi.nombre)
            .put("tipo_poi", poi.tipoPoi)
            .put("latitud", poi.lat)
            .put("longitud", poi.lon)
            .put("color", poi.color)
            .apply {
                poi.iconoSrc?.let { put("icono_src", resolvePoiIconUrl(it)) }
                poi.sidc?.let { put("sidc", it) }
            }

    private fun coverageCircleJson(circle: CoverageCircleItem): JSONObject =
        JSONObject()
            .put("id_area", circle.idArea)
            .put("nombre", circle.nombre)
            .put("center_lat", circle.centerLat)
            .put("center_lon", circle.centerLon)
            .put("radius_m", circle.radiusM)
            .put("color", circle.color)
            .put("opacity", circle.opacity)
            .put("outline_width", circle.outlineWidth)

    private fun areaPolygonJson(polygon: AreaPolygonItem): JSONObject =
        JSONObject()
            .put("id_area", polygon.idArea)
            .put("nombre", polygon.nombre)
            .put("color", polygon.color)
            .put("opacity", polygon.opacity)
            .put("outline_width", polygon.outlineWidth)
            .put("points", pointsJson(polygon.points))

    private fun structureJson(structure: StructureItem): JSONObject =
        JSONObject()
            .put("id_marca", structure.idMarca)
            .put("nombre", structure.nombre)
            .put("tipo_estructura", structure.tipoEstructura)
            .put("latitud", structure.lat)
            .put("longitud", structure.lon)
            .apply {
                structure.iconoSrc?.let { put("icono_src", it) }
            }

    private fun pointsJson(points: List<Pair<Double, Double>>): JSONArray =
        JSONArray().apply {
            points.forEach { point ->
                put(
                    JSONObject()
                        .put("lat", point.first)
                        .put("lon", point.second)
                )
            }
        }

    private fun resolveStructureIconUrl(tipoEstructura: String?): String? {
        val tipo = tipoEstructura?.trim()?.uppercase().orEmpty()
        return if (tipo == "ETIQUETA") null else "${ApiConfig.BASE_URL}/img/estructuras/casa.png"
    }

    private fun resolvePoiIconUrl(iconoSrc: String?): String? {
        val cleaned = iconoSrc?.trim()
        if (cleaned.isNullOrBlank() || cleaned.equals("null", ignoreCase = true)) return null
        if (cleaned.startsWith("S")) return cleaned
        if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned
        return "${ApiConfig.BASE_URL}/${cleaned.trimStart('/')}"
    }

    private fun jsString(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
            .replace("\r", " ")

    private companion object {
        private const val SYNC_THROTTLE_MS = 1500L
        private const val CESIUM_LOAD_DELAY_MS = 2600L
    }
}
