package com.operaciones.operaciones_android.ui.simulation

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.math.cos
import kotlin.math.sin

class OperationSimulationController(
    private val context: Context,
    private val httpClient: OkHttpClient,
    private val host: Host,
    private val mainHandler: Handler = Handler(Looper.getMainLooper())
) {
    interface Host {
        fun getSimulationOperation(): Operation
        fun getSimulationUser(): User
        fun getSimulationPersonal(): List<PersonalItem>
        fun getSimulationVehiculos(): List<VehiculoItem>
        fun getSimulationOperationLat(): Double
        fun getSimulationOperationLon(): Double
        fun getSimulationLastKnownLat(): Double?
        fun getSimulationLastKnownLon(): Double?
        fun hasSimulationSocket(): Boolean
        fun fetchSimulationPersonal()
        fun fetchSimulationVehiculos()
        fun emitSimulationPersonalTracking(idPersonal: Int, lat: Double, lon: Double, apodo: String, rol: String)
        fun emitSimulationVehiculoTracking(idVehiculo: Int, lat: Double, lon: Double, alias: String)
        fun isSimulationCesiumReady(): Boolean
        fun updateSimulationPersonalOnMap(idPersonal: Int, lat: Double, lon: Double, label: String)
        fun updateSimulationVehiculoOnMap(idVehiculo: Int, lat: Double, lon: Double, label: String)
        fun updateSimulationPersonalPanel(idPersonal: Int, lat: Double, lon: Double)
    }

    private data class SimulationRoutePoint(
        val lat: Double,
        val lon: Double
    )

    private var simulationRunnable: Runnable? = null
    private var simulationTick = 0
    private var simulationActive = false
    private val simulationRoutePoints = mutableListOf<SimulationRoutePoint>()
    private var simulationRouteStartTick: Int? = null
    private var simulationRouteDeletedTick: Int? = null
    private val simulationPersonStartPoints = mutableMapOf<Int, SimulationRoutePoint>()
    private val simulationLastPersonPoints = mutableMapOf<Int, SimulationRoutePoint>()
    private val simulationReturnStartPersonPoints = mutableMapOf<Int, SimulationRoutePoint>()
    private var simulationLastVehiclePoint: SimulationRoutePoint? = null
    private var simulationReturnVehiclePoint: SimulationRoutePoint? = null
    private val simulationPersonToVehicleRoutes = mutableMapOf<Int, List<SimulationRoutePoint>>()
    private val simulationPersonReturnRoutes = mutableMapOf<Int, List<SimulationRoutePoint>>()
    private var simulationVehicleToRoutePoints: List<SimulationRoutePoint> = emptyList()
    private var simulationVehicleReturnPoints: List<SimulationRoutePoint> = emptyList()
    private var simulationVehicleStartPoint: SimulationRoutePoint? = null
    private var simulationRoutePlanGeneration = 0
    private var simulationTargetsSnapshot: List<PersonalItem> = emptyList()
    private var simulationVehicleTargetSnapshot: VehiculoItem? = null
    private var simulationRouteDistanceSq = Double.POSITIVE_INFINITY
    private val fallbackSimulationAnchorLat = 19.04497
    private val fallbackSimulationAnchorLon = -95.97219

    val isActive: Boolean
        get() = simulationActive

    fun canRun(): Boolean {
        val operation = host.getSimulationOperation()
        return operation.id > 0 && operation.status == OperationStatus.ACTIVA
    }

    fun toggle() {
        if (simulationActive) {
            stop()
            showToast("Simulacion detenida")
        } else {
            start()
        }
    }

    fun updateRoutesFromJson(routesJson: String) {
        try {
            val routes = JSONArray(routesJson)
            var selectedDistanceSq = Double.POSITIVE_INFINITY
            var selectedPoints: List<SimulationRoutePoint> = emptyList()

            for (i in 0 until routes.length()) {
                val route = routes.optJSONObject(i) ?: continue
                val points = parseSimulationRoutePoints(route)
                val distanceSq = routeDistanceToSimulationAnchorSq(points)
                if (points.size >= 2 && distanceSq < selectedDistanceSq) {
                    selectedDistanceSq = distanceSq
                    selectedPoints = points
                }
            }

            if (selectedPoints.isNotEmpty()) {
                simulationRoutePoints.clear()
                simulationRoutePoints.addAll(selectedPoints)
                simulationRouteDistanceSq = selectedDistanceSq
                simulationRouteStartTick = null
                simulationRouteDeletedTick = null
                simulationReturnStartPersonPoints.clear()
                simulationReturnVehiclePoint = null
                if (simulationActive) {
                    prepareSimulationActiveRouteLegs()
                }
            }
        } catch (e: Exception) {
            Log.w("SIMULATION", "No se pudo cargar ruta para simulacion: ${e.message}")
        }
    }

    fun updateRouteFromJson(routeJson: String) {
        try {
            val points = parseSimulationRoutePoints(JSONObject(routeJson))
            val distanceSq = routeDistanceToSimulationAnchorSq(points)
            if (points.size >= 2 && distanceSq <= simulationRouteDistanceSq) {
                simulationRoutePoints.clear()
                simulationRoutePoints.addAll(points)
                simulationRouteDistanceSq = distanceSq
                simulationRouteStartTick = null
                simulationRouteDeletedTick = null
                simulationReturnStartPersonPoints.clear()
                simulationReturnVehiclePoint = null
                if (simulationActive) {
                    prepareSimulationActiveRouteLegs()
                }
            }
        } catch (e: Exception) {
            Log.w("SIMULATION", "No se pudo actualizar ruta para simulacion: ${e.message}")
        }
    }

    fun handleRouteDeleted() {
        simulationRoutePoints.clear()
        simulationRouteDistanceSq = Double.POSITIVE_INFINITY
        simulationRouteStartTick = null
        if (simulationActive) {
            simulationRouteDeletedTick = simulationTick
            simulationReturnStartPersonPoints.clear()
            simulationReturnStartPersonPoints.putAll(simulationLastPersonPoints)
            simulationReturnVehiclePoint = simulationLastVehiclePoint
            prepareSimulationReturnRouteLegs()
        } else {
            simulationRouteDeletedTick = null
            simulationReturnStartPersonPoints.clear()
            simulationReturnVehiclePoint = null
            clearSimulationRouteLegs()
        }
    }

    fun stop() {
        simulationActive = false
        simulationRunnable?.let { mainHandler.removeCallbacks(it) }
        simulationRunnable = null
        simulationRouteStartTick = null
        simulationRouteDeletedTick = null
        simulationPersonStartPoints.clear()
        simulationLastPersonPoints.clear()
        simulationReturnStartPersonPoints.clear()
        simulationLastVehiclePoint = null
        simulationReturnVehiclePoint = null
        clearSimulationRouteLegs()
        simulationVehicleStartPoint = null
        simulationTargetsSnapshot = emptyList()
        simulationVehicleTargetSnapshot = null
    }

    private fun start() {
        if (!canRun()) {
            showToast("La simulacion solo esta disponible en operaciones activas")
            return
        }

        if (!host.hasSimulationSocket()) {
            showToast("Socket no disponible para simulacion")
            return
        }

        val personalList = host.getSimulationPersonal()
        if (personalList.isEmpty()) {
            host.fetchSimulationPersonal()
            showToast("Cargando personal de la flotilla. Intenta de nuevo en unos segundos.")
            return
        }

        val vehiculosList = host.getSimulationVehiculos()
        if (vehiculosList.isEmpty()) {
            host.fetchSimulationVehiculos()
            showToast("Cargando vehiculos asignados. Intenta de nuevo en unos segundos.")
            return
        }

        val targets = getSimulationTargets(personalList)
        if (targets.isEmpty()) {
            showToast("No se encontro personal de la flotilla para simular.")
            return
        }

        val vehicleTarget = getSimulationVehicleTarget(vehiculosList)
        if (vehicleTarget == null) {
            showToast("No se encontro un vehiculo asignado para simular.")
            return
        }

        simulationActive = true
        simulationTick = 0
        simulationRouteStartTick = null
        simulationRouteDeletedTick = null
        simulationLastPersonPoints.clear()
        simulationReturnStartPersonPoints.clear()
        simulationLastVehiclePoint = null
        simulationReturnVehiclePoint = null
        clearSimulationRouteLegs()
        simulationTargetsSnapshot = targets
        simulationVehicleTargetSnapshot = vehicleTarget
        simulationVehicleStartPoint = simulationVehicleHomePoint(vehicleTarget)
        prepareSimulationStartPoints(targets)
        if (simulationRoutePoints.size >= 2) {
            prepareSimulationActiveRouteLegs()
        }
        simulationRunnable?.let { mainHandler.removeCallbacks(it) }
        simulationRunnable = object : Runnable {
            override fun run() {
                emitSimulationPositions(targets, vehicleTarget)
                simulationTick += 1
                if (simulationActive) mainHandler.postDelayed(this, 2500)
            }
        }
        simulationRunnable?.run()
        showToast("Simulacion activada")
    }

    private fun getSimulationTargets(personalList: List<PersonalItem>): List<PersonalItem> {
        val currentUser = host.getSimulationUser()
        val myRecord = personalList.firstOrNull { it.idPersonal == currentUser.id }
        val myFlotilla = myRecord?.let { simulationFlotillaName(it) }.orEmpty()

        val sameFlotilla = if (myFlotilla.isNotBlank()) {
            personalList.filter {
                simulationFlotillaName(it).equals(myFlotilla, ignoreCase = true) &&
                    isSimulationCandidate(it)
            }
        } else {
            emptyList()
        }

        return sameFlotilla.ifEmpty {
            personalList.filter(::isSimulationCandidate)
        }
    }

    private fun getSimulationVehicleTarget(vehiculosList: List<VehiculoItem>): VehiculoItem? =
        vehiculosList.firstOrNull { it.lat == null && it.lon == null } ?: vehiculosList.firstOrNull()

    private fun prepareSimulationStartPoints(targets: List<PersonalItem>) {
        simulationPersonStartPoints.clear()
        val anchor = simulationAnchorPoint()
        val radiusLat = 8.0 / 111_320.0
        val radiusLon = 8.0 / 104_500.0
        targets.forEachIndexed { index, person ->
            val angle = Math.PI * 2.0 * index / targets.size.coerceAtLeast(1)
            val personPoint = coordinatePointOrNull(person.lat, person.lon)
            simulationPersonStartPoints[person.idPersonal] = SimulationRoutePoint(
                lat = personPoint?.lat ?: (anchor.lat + sin(angle) * radiusLat),
                lon = personPoint?.lon ?: (anchor.lon + cos(angle) * radiusLon)
            )
        }
    }

    private fun isSimulationCandidate(person: PersonalItem): Boolean {
        val isOperationalRole =
            person.rol.equals("CELL", ignoreCase = true) ||
                person.rol.equals("CET", ignoreCase = true)
        if (!isOperationalRole) return false

        val hasRealBackendLocation = person.lat != null && person.lon != null
        val isCurrentDevice = person.idPersonal == host.getSimulationUser().id
        val currentDeviceHasGps = isCurrentDevice &&
            host.getSimulationLastKnownLat() != null &&
            host.getSimulationLastKnownLon() != null

        return !hasRealBackendLocation && !currentDeviceHasGps
    }

    private fun simulationFlotillaName(person: PersonalItem): String {
        val parent = person.grupoPadreNombre.trim()
        val group = person.grupoNombre.trim()
        return when {
            person.cetFlotilla.isNotBlank() -> person.cetFlotilla.trim()
            parent.isNotBlank() && !parent.equals("Mando Operativo", ignoreCase = true) -> parent
            group.isNotBlank() -> group
            else -> ""
        }
    }

    private fun emitSimulationPositions(
        targets: List<PersonalItem>,
        vehicleTarget: VehiculoItem
    ) {
        val routePoints = simulationRoutePoints.toList()
        val hasRoute = routePoints.size >= 2
        if (hasRoute && simulationRouteStartTick == null) {
            simulationRouteStartTick = simulationTick
            if (simulationPersonToVehicleRoutes.isEmpty() && simulationVehicleToRoutePoints.isEmpty()) {
                prepareSimulationActiveRouteLegs()
            }
        }
        val phaseTick = if (hasRoute) {
            simulationTick - (simulationRouteStartTick ?: simulationTick)
        } else {
            0
        }
        val vehicleStart = simulationVehicleStartPoint ?: simulationVehicleHomePoint(vehicleTarget)
        val routeStart = routePoints.firstOrNull() ?: vehicleStart
        val personToVehicleTicks = simulationMaxRouteTickCount(simulationPersonToVehicleRoutes.values)
        val vehicleToRouteRoute = simulationVehicleToRoutePoints.ifEmpty {
            fallbackSimulationRoute(vehicleStart, routeStart)
        }
        val vehicleToRouteTicks = simulationRouteTickCount(vehicleToRouteRoute)
        val vehicleReturnStart = simulationReturnVehiclePoint ?: simulationLastVehiclePoint ?: vehicleStart
        val vehicleReturnRoute = simulationVehicleReturnPoints.ifEmpty {
            fallbackSimulationRoute(vehicleReturnStart, vehicleStart)
        }
        val vehicleReturnTicks = simulationRouteTickCount(vehicleReturnRoute)
        val personReturnTicks = simulationMaxRouteTickCount(simulationPersonReturnRoutes.values)
        val isReturning = !hasRoute && simulationRouteDeletedTick != null
        val returnTick = simulationTick - (simulationRouteDeletedTick ?: simulationTick)
        val vehiclePosition = when {
            isReturning && returnTick < vehicleReturnTicks ->
                simulationRoutePointAtTick(vehicleReturnRoute, returnTick, vehicleStart)
            isReturning -> vehicleStart
            !hasRoute -> vehicleStart
            phaseTick < personToVehicleTicks -> vehicleStart
            phaseTick < personToVehicleTicks + vehicleToRouteTicks ->
                simulationRoutePointAtTick(
                    points = vehicleToRouteRoute,
                    tick = phaseTick - personToVehicleTicks,
                    fallback = routeStart
                )
            else -> {
                val routeTick = phaseTick - personToVehicleTicks - vehicleToRouteTicks
                routePoints[routeTick.coerceIn(0, routePoints.lastIndex)]
            }
        }
        val vehicleLat = vehiclePosition.lat
        val vehicleLon = vehiclePosition.lon
        val groupRadiusLat = 1.6 / 111_320.0
        val groupRadiusLon = 1.6 / 104_500.0
        val phase = simulationTick * 0.22

        targets.forEachIndexed { index, person ->
            val baseAngle = Math.PI * 2.0 * index / targets.size.coerceAtLeast(1)
            val angle = if (
                isReturning ||
                (hasRoute && phaseTick >= personToVehicleTicks + vehicleToRouteTicks)
            ) {
                baseAngle + phase
            } else {
                baseAngle
            }
            val groupedPoint = SimulationRoutePoint(
                lat = vehicleLat + sin(angle) * groupRadiusLat,
                lon = vehicleLon + cos(angle) * groupRadiusLon
            )
            val startPoint = simulationPersonStartPoints[person.idPersonal] ?: groupedPoint
            val personPosition = if (isReturning) {
                if (returnTick < vehicleReturnTicks) {
                    groupedPoint
                } else if (returnTick - vehicleReturnTicks < personReturnTicks) {
                    val personReturnRoute = simulationPersonReturnRoutes[person.idPersonal].orEmpty()
                        .ifEmpty { fallbackSimulationRoute(vehicleStart, startPoint) }
                    simulationRoutePointAtTick(
                        points = personReturnRoute,
                        tick = returnTick - vehicleReturnTicks,
                        fallback = startPoint
                    )
                } else {
                    val orbitRadiusLat = 1.4 / 111_320.0
                    val orbitRadiusLon = 1.4 / 104_500.0
                    SimulationRoutePoint(
                        lat = startPoint.lat + sin(baseAngle + phase) * orbitRadiusLat,
                        lon = startPoint.lon + cos(baseAngle + phase) * orbitRadiusLon
                    )
                }
            } else if (!hasRoute) {
                startPoint
            } else if (phaseTick < personToVehicleTicks) {
                val personToVehicleRoute = simulationPersonToVehicleRoutes[person.idPersonal].orEmpty()
                    .ifEmpty { fallbackSimulationRoute(startPoint, vehicleStart) }
                simulationRoutePointAtTick(
                    points = personToVehicleRoute,
                    tick = phaseTick,
                    fallback = groupedPoint
                )
            } else {
                groupedPoint
            }
            val lat = personPosition.lat
            val lon = personPosition.lon
            simulationLastPersonPoints[person.idPersonal] = personPosition
            val name = person.apodo.ifBlank { "${person.nombre} ${person.apellido}".trim() }
                .ifBlank { "Personal ${person.idPersonal}" }

            host.emitSimulationPersonalTracking(
                idPersonal = person.idPersonal,
                lat = lat,
                lon = lon,
                apodo = name,
                rol = person.rol
            )

            if (host.isSimulationCesiumReady()) {
                host.updateSimulationPersonalOnMap(person.idPersonal, lat, lon, name)
            }
            host.updateSimulationPersonalPanel(person.idPersonal, lat, lon)
        }

        val vehicleName = vehicleTarget.alias.ifBlank { vehicleTarget.codigoInterno }
            .ifBlank { vehicleTarget.nombre }
            .ifBlank { "Vehiculo ${vehicleTarget.idVehiculo}" }
        simulationLastVehiclePoint = vehiclePosition
        host.emitSimulationVehiculoTracking(
            idVehiculo = vehicleTarget.idVehiculo,
            lat = vehicleLat,
            lon = vehicleLon,
            alias = vehicleName
        )

        if (host.isSimulationCesiumReady()) {
            host.updateSimulationVehiculoOnMap(vehicleTarget.idVehiculo, vehicleLat, vehicleLon, vehicleName)
        }
    }

    private fun routeDistanceToSimulationAnchorSq(points: List<SimulationRoutePoint>): Double {
        if (points.isEmpty()) return Double.POSITIVE_INFINITY
        val anchor = simulationAnchorPoint()
        var best = Double.POSITIVE_INFINITY
        points.forEach { point ->
            val dLat = point.lat - anchor.lat
            val dLon = point.lon - anchor.lon
            val distanceSq = dLat * dLat + dLon * dLon
            if (distanceSq < best) best = distanceSq
        }
        return best
    }

    private fun simulationAnchorPoint(): SimulationRoutePoint {
        val operation = host.getSimulationOperation()
        coordinatePointOrNull(operation.zonaLat, operation.zonaLon)?.let { return it }
        coordinatePointOrNull(host.getSimulationOperationLat(), host.getSimulationOperationLon())?.let { return it }
        simulationRoutePoints.firstOrNull()?.let { return it }

        host.getSimulationPersonal().forEach { person ->
            coordinatePointOrNull(person.lat, person.lon)?.let { return it }
        }

        host.getSimulationVehiculos().forEach { vehiculo ->
            coordinatePointOrNull(vehiculo.lat, vehiculo.lon)?.let { return it }
        }

        return SimulationRoutePoint(
            lat = fallbackSimulationAnchorLat,
            lon = fallbackSimulationAnchorLon
        )
    }

    private fun coordinatePointOrNull(lat: Double?, lon: Double?): SimulationRoutePoint? {
        if (lat == null || lon == null) return null
        if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return null
        if (lat == 0.0 && lon == 0.0) return null
        return SimulationRoutePoint(lat = lat, lon = lon)
    }

    private fun parseSimulationRoutePoints(route: JSONObject): List<SimulationRoutePoint> {
        val geojsonValue = when {
            route.has("geojson") -> route.opt("geojson")
            route.has("geometria") -> route.opt("geometria")
            else -> null
        }
        val geojson = when (geojsonValue) {
            is JSONObject -> geojsonValue
            is String -> JSONObject(geojsonValue)
            else -> return emptyList()
        }
        val coords = geojson.optJSONArray("coordinates") ?: return emptyList()
        val points = mutableListOf<SimulationRoutePoint>()
        for (i in 0 until coords.length()) {
            val coord = coords.optJSONArray(i) ?: continue
            if (coord.length() < 2) continue
            points.add(
                SimulationRoutePoint(
                    lat = coord.optDouble(1),
                    lon = coord.optDouble(0)
                )
            )
        }
        return points
    }

    private fun clearSimulationRouteLegs() {
        simulationRoutePlanGeneration += 1
        simulationPersonToVehicleRoutes.clear()
        simulationPersonReturnRoutes.clear()
        simulationVehicleToRoutePoints = emptyList()
        simulationVehicleReturnPoints = emptyList()
    }

    private fun simulationDefaultVehicleStartPoint(): SimulationRoutePoint {
        val vehicleStartDistanceM = 85.0
        val anchor = simulationAnchorPoint()
        return SimulationRoutePoint(
            lat = anchor.lat + (vehicleStartDistanceM / 111_320.0),
            lon = anchor.lon + (vehicleStartDistanceM / 104_500.0)
        )
    }

    private fun simulationVehicleHomePoint(
        vehicle: VehiculoItem? = simulationVehicleTargetSnapshot
    ): SimulationRoutePoint {
        val point = coordinatePointOrNull(vehicle?.lat, vehicle?.lon)
        return if (point != null) {
            point
        } else {
            simulationVehicleStartPoint ?: simulationDefaultVehicleStartPoint()
        }
    }

    private fun fallbackSimulationRoute(
        from: SimulationRoutePoint,
        to: SimulationRoutePoint
    ): List<SimulationRoutePoint> = listOf(from, to)

    private fun normalizeSimulationRoute(
        from: SimulationRoutePoint,
        to: SimulationRoutePoint,
        points: List<SimulationRoutePoint>
    ): List<SimulationRoutePoint> {
        if (points.isEmpty()) return fallbackSimulationRoute(from, to)
        val normalized = mutableListOf<SimulationRoutePoint>()
        normalized.add(from)
        normalized.addAll(points)
        normalized.add(to)
        return normalized
    }

    private fun simulationRoutePointAtTick(
        points: List<SimulationRoutePoint>,
        tick: Int,
        fallback: SimulationRoutePoint
    ): SimulationRoutePoint {
        if (points.isEmpty()) return fallback
        return points[tick.coerceIn(0, points.lastIndex)]
    }

    private fun simulationRouteTickCount(points: List<SimulationRoutePoint>): Int =
        points.size.coerceAtLeast(2)

    private fun simulationMaxRouteTickCount(routes: Collection<List<SimulationRoutePoint>>): Int =
        routes.maxOfOrNull { simulationRouteTickCount(it) } ?: 2

    private fun prepareSimulationActiveRouteLegs() {
        val routeStart = simulationRoutePoints.firstOrNull() ?: return
        val vehicleHome = simulationVehicleHomePoint()
        val generation = ++simulationRoutePlanGeneration

        simulationPersonToVehicleRoutes.clear()
        simulationPersonReturnRoutes.clear()
        simulationVehicleReturnPoints = emptyList()
        simulationVehicleToRoutePoints = fallbackSimulationRoute(vehicleHome, routeStart)

        simulationTargetsSnapshot.forEach { person ->
            val personStart = simulationPersonStartPoints[person.idPersonal] ?: vehicleHome
            simulationPersonToVehicleRoutes[person.idPersonal] =
                fallbackSimulationRoute(personStart, vehicleHome)
            requestSimulationOsrmRoute(
                from = personStart,
                to = vehicleHome,
                generation = generation
            ) { points ->
                simulationPersonToVehicleRoutes[person.idPersonal] = points
            }
        }

        requestSimulationOsrmRoute(
            from = vehicleHome,
            to = routeStart,
            generation = generation
        ) { points ->
            simulationVehicleToRoutePoints = points
        }
    }

    private fun prepareSimulationReturnRouteLegs() {
        val vehicleHome = simulationVehicleHomePoint()
        val vehicleReturnStart = simulationReturnVehiclePoint ?: simulationLastVehiclePoint ?: vehicleHome
        val generation = ++simulationRoutePlanGeneration

        simulationPersonToVehicleRoutes.clear()
        simulationVehicleToRoutePoints = emptyList()
        simulationPersonReturnRoutes.clear()
        simulationVehicleReturnPoints = fallbackSimulationRoute(vehicleReturnStart, vehicleHome)

        requestSimulationOsrmRoute(
            from = vehicleReturnStart,
            to = vehicleHome,
            generation = generation
        ) { points ->
            simulationVehicleReturnPoints = points
        }

        simulationTargetsSnapshot.forEach { person ->
            val personHome = simulationPersonStartPoints[person.idPersonal] ?: vehicleHome
            simulationPersonReturnRoutes[person.idPersonal] =
                fallbackSimulationRoute(vehicleHome, personHome)
            requestSimulationOsrmRoute(
                from = vehicleHome,
                to = personHome,
                generation = generation
            ) { points ->
                simulationPersonReturnRoutes[person.idPersonal] = points
            }
        }
    }

    private fun requestSimulationOsrmRoute(
        from: SimulationRoutePoint,
        to: SimulationRoutePoint,
        generation: Int,
        onRoute: (List<SimulationRoutePoint>) -> Unit
    ) {
        val fallback = fallbackSimulationRoute(from, to)
        val url = "https://router.project-osrm.org/route/v1/driving/" +
            "${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson"
        val request = Request.Builder().url(url).get().build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w("SIMULATION", "OSRM no disponible para simulacion: ${e.message}")
                mainHandler.post {
                    if (simulationActive && generation == simulationRoutePlanGeneration) {
                        onRoute(fallback)
                    }
                }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = it.body?.string().orEmpty()
                    val points = if (it.isSuccessful) {
                        try {
                            parseOsrmRoutePoints(body)
                        } catch (e: Exception) {
                            Log.w("SIMULATION", "Respuesta OSRM invalida: ${e.message}")
                            emptyList()
                        }
                    } else {
                        Log.w("SIMULATION", "OSRM rechazo ruta de simulacion: ${it.code}")
                        emptyList()
                    }
                    val route = normalizeSimulationRoute(from, to, points)
                    mainHandler.post {
                        if (simulationActive && generation == simulationRoutePlanGeneration) {
                            onRoute(route)
                        }
                    }
                }
            }
        })
    }

    private fun parseOsrmRoutePoints(body: String): List<SimulationRoutePoint> {
        if (body.isBlank()) return emptyList()
        val routes = JSONObject(body).optJSONArray("routes") ?: return emptyList()
        val geometry = routes.optJSONObject(0)?.optJSONObject("geometry") ?: return emptyList()
        val coordinates = geometry.optJSONArray("coordinates") ?: return emptyList()
        val points = mutableListOf<SimulationRoutePoint>()
        for (i in 0 until coordinates.length()) {
            val coord = coordinates.optJSONArray(i) ?: continue
            if (coord.length() < 2) continue
            val lon = coord.optDouble(0)
            val lat = coord.optDouble(1)
            if (lat.isNaN() || lon.isNaN()) continue
            points.add(SimulationRoutePoint(lat = lat, lon = lon))
        }
        return points
    }

    private fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }
}
