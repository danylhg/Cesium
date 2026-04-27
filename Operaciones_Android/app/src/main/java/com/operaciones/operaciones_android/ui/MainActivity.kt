package com.operaciones.operaciones_android.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.webkit.WebView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.emergency.EmergencyMonitorService
import com.operaciones.operaciones_android.location.LocationHelper
import com.operaciones.operaciones_android.map.MapActionController
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.network.ChatRepository
import com.operaciones.operaciones_android.network.ChatSocketManager
import com.operaciones.operaciones_android.network.DrawingRepository
import com.operaciones.operaciones_android.network.EquipoRepository
import com.operaciones.operaciones_android.network.OperationMapRepository
import com.operaciones.operaciones_android.network.OperationStatusRepository
import com.operaciones.operaciones_android.network.PersonalRepository
import com.operaciones.operaciones_android.network.VehiculoRepository
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController.Panel
import com.operaciones.operaciones_android.ui.panel.ChatPanelRefs
import com.operaciones.operaciones_android.ui.panel.MainPanelRenderer
import com.operaciones.operaciones_android.webview.CesiumWebController
import com.operaciones.operaciones_android.webview.MainJsBridge
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.math.cos
import kotlin.math.sin

class MainActivity : AppCompatActivity(),
    MainPanelRenderer.Host,
    MapActionController.Host,
    PanelNavigationController.Host {

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

    private data class SimulationRoutePoint(
        val lat: Double,
        val lon: Double
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

    private val personalRepository = PersonalRepository()
    private val vehiculoRepository = VehiculoRepository()
    private val equipoRepository = EquipoRepository()
    private val drawingRepository = DrawingRepository()

    // Map: JS localId → id_dibujo del backend
    private val drawingLocalToBackendId = HashMap<String, Int>()
    private var drawingMode: String? = null  // "pencil" | "eraser" | null

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
    private lateinit var connectionBanner: TextView
    private lateinit var btnNavOperation: LinearLayout
    private lateinit var btnNavChat: LinearLayout
    private lateinit var btnNavPersonal: LinearLayout
    private lateinit var btnNavVehiculos: LinearLayout
    private lateinit var btnNavEquipos: LinearLayout
    private lateinit var mapActionController: MapActionController

    private var chatSocketManager: ChatSocketManager? = null

    private val chatRepository = ChatRepository()
    private var chatLoaded = false

    private val operationMapRepository = OperationMapRepository()
    private val operationStatusRepository = OperationStatusRepository()
    private val httpClient = OkHttpClient()

    private lateinit var panelRenderer: MainPanelRenderer
    private lateinit var cesiumWebController: CesiumWebController
    private lateinit var locationHelper: LocationHelper

    private val messages = mutableListOf<ChatMessage>()
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var chatRecycler: RecyclerView
    private lateinit var msgInput: EditText

    private lateinit var panelNavigationController: PanelNavigationController

    private lateinit var currentUser: User
    private lateinit var currentOperation: Operation

    private val personalList = mutableListOf<PersonalItem>()
    private val vehiculosList = mutableListOf<VehiculoItem>()
    private val equiposList = mutableListOf<EquipoItem>()

    private var opLat = 0.0
    private var opLon = 0.0
    private var opZoom = 8000
    private var lastRouteId: Int = -1

    // Última posición conocida del usuario — se emite al socket cuando se conecta
    private var lastKnownLat: Double? = null
    private var lastKnownLon: Double? = null

    private val simulationHandler = Handler(Looper.getMainLooper())
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
    private var simulationRouteDistanceSq = Double.POSITIVE_INFINITY
    private val simulationAnchorLat = 19.04502
    private val simulationAnchorLon = -95.97207

    // POIs pendientes de dibujar hasta que Cesium esté listo
    private var pendingPoisJson: String? = null
    private var pendingOperationZoneJson: String? = null
    private var pendingCoverageCirclesJson: String? = null
    private var pendingAreaPolygonsJson: String? = null
    private var pendingStructuresJson: String? = null
    private var isCesiumReady = false
    private val pendingPoiAdditions = mutableListOf<PendingPoiAddition>()
    private val pendingCoverageCircleAdditions = mutableListOf<PendingCoverageCircleAddition>()
    private val pendingAreaPolygonAdditions = mutableListOf<PendingAreaPolygonAddition>()
    private val pendingStructureAdditions = mutableListOf<PendingStructureAddition>()
    private var emergencyServiceStarted = false
    private val connectionMonitorHandler = Handler(Looper.getMainLooper())
    private val connectionMonitorRunnable = object : Runnable {
        override fun run() {
            checkServerConnection()
            checkAssignedOperationStatus()
            connectionMonitorHandler.postDelayed(this, 10000)
        }
    }

    private fun buildPolygonPointsJson(points: List<Pair<Double, Double>>): String {
        return buildString {
            append("[")
            points.forEachIndexed { i, point ->
                if (i > 0) append(",")
                append("{")
                append("\"lat\":${point.first},")
                append("\"lon\":${point.second}")
                append("}")
            }
            append("]")
        }
    }

    private fun resolveStructureIconUrl(tipoEstructura: String?): String? {
        val tipo = tipoEstructura?.trim()?.uppercase().orEmpty()
        return if (tipo == "ETIQUETA") null else "${ApiConfig.BASE_URL}/img/estructuras/casa.png"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        currentUser = AuthManager.getCurrentUser(this) ?: run {
            goToLogin()
            return
        }

        opLat = intent.getDoubleExtra("OP_LAT", 0.0)
        opLon = intent.getDoubleExtra("OP_LON", 0.0)
        opZoom = intent.getIntExtra("OP_ZOOM", 8000)

        val opId = intent.getIntExtra("OPERATION_ID", -1)
        currentOperation = Operation(
            id = opId,
            codigo = intent.getStringExtra("OP_CODIGO") ?: "",
            nombre = intent.getStringExtra("OP_NOMBRE") ?: "Operación",
            descripcion = intent.getStringExtra("OP_DESCRIPCION") ?: "",
            prioridad = intent.getStringExtra("OP_PRIORIDAD") ?: "MEDIA",
            status = OperationStatus.ACTIVA,
            fechaInicio = intent.getStringExtra("OP_FECHA_INICIO") ?: "",
            fechaFin = intent.getStringExtra("OP_FECHA_FIN") ?: "",
            zonaLat = opLat,
            zonaLon = opLon,
            zonaZoom = opZoom
        )

        if (currentOperation.id > 0) {
            chatSocketManager = ChatSocketManager(
                operationId = currentOperation.id,
                idPersonal  = currentUser.id,
                rol         = currentUser.rol.name,
                onNewMessage = { item ->
                    runOnUiThread {
                        val incoming = parseChatMessage(item)
                        val alreadyExists = incoming.id != null &&
                                messages.any { it.id == incoming.id }

                        if (!alreadyExists) {
                            addMessage(incoming)
                        }
                    }
                },
                onNavigationRouteEvt = { event, data ->
                    runOnUiThread {
                        if (event == "creada") {
                            val rutaJson = data.optJSONObject("ruta")?.toString()
                            if (rutaJson != null) {
                                updateSimulationRouteFromRouteJson(rutaJson)
                                cesiumWebController.evaluate("if(typeof drawRemoteRoute === 'function') drawRemoteRoute($rutaJson)")
                            }
                        } else if (event == "eliminada") {
                            val idRuta = data.optInt("id_ruta", -1)
                            if (idRuta != -1) {
                                handleSimulationRouteDeleted()
                                cesiumWebController.evaluate("if(typeof removeRemoteRoute === 'function') removeRemoteRoute($idRuta)")
                            }
                        }
                    }
                },
                onTrackingPersonal = { data ->
                    runOnUiThread {
                        val id = data.optInt("id_personal")
                        val lat = data.optDouble("latitud")
                        val lon = data.optDouble("longitud")
                        val label = data.optString("apodo", data.optString("nombre", "P-$id"))
                        if (id > 0 && id != currentUser.id) {
                            cesiumWebController.evaluate(
                                "if(typeof updateTrackingPersonal === 'function') updateTrackingPersonal($id, $lat, $lon, '${jsString(label)}')"
                            )
                        }
                    }
                },
                onTrackingVehiculo = { data ->
                    runOnUiThread {
                        val id = data.optInt("id_vehiculo")
                        val lat = data.optDouble("latitud")
                        val lon = data.optDouble("longitud")
                        val label = data.optString("alias", data.optString("nombre", "V-$id"))
                        if (id > 0) {
                            cesiumWebController.evaluate(
                                "if(typeof updateTrackingVehiculo === 'function') updateTrackingVehiculo($id, $lat, $lon, '${jsString(label)}')"
                            )
                        }
                    }
                },
                onPoiCreado = { data ->
                    runOnUiThread {
                        val poi = data.optJSONObject("poi") ?: return@runOnUiThread
                        val idPoi  = poi.optInt("id_poi")
                        val lat    = poi.optDouble("latitud")
                        val lon    = poi.optDouble("longitud")
                        val nombre = poi.optString("nombre", "PDI")
                        val tipo   = poi.optString("tipo_poi", "")
                        val color  = poi.optString("color", "#FFD700").ifBlank { "#FFD700" }
                        val iconoSrc = resolvePoiIconUrl(poi.optString("icono_src", null))
                        val sidc = poi.optString("sidc", null).takeUnless { it.isNullOrBlank() || it.equals("null", ignoreCase = true) }
                        if (idPoi > 0) {
                            if (isCesiumReady) {
                                cesiumWebController.addPoiToMap(idPoi, lat, lon, nombre, tipo, color, iconoSrc, sidc)
                            } else {
                                pendingPoiAdditions.add(
                                    PendingPoiAddition(idPoi, lat, lon, nombre, tipo, color, iconoSrc, sidc)
                                )
                            }
                        }
                    }
                },
                onPoiEliminado = { data ->
                    runOnUiThread {
                        val idPoi = data.optInt("id_poi", -1)
                        if (idPoi > 0 && isCesiumReady) {
                            cesiumWebController.removePoiFromMap(idPoi)
                        }
                    }
                },
                onAreaCreada = { data ->
                    runOnUiThread {
                        val area = data.optJSONObject("area") ?: return@runOnUiThread
                        val geometria = area.optJSONObject("geometria") ?: return@runOnUiThread
                        val metaAny = geometria.optJSONObject("meta") ?: JSONObject()
                        val shape = metaAny.optString("shape", "").lowercase()

                        if (shape == "polygon") {
                            val idArea = area.optInt("id_area", -1)
                            if (idArea <= 0) return@runOnUiThread

                            val rings = geometria.optJSONArray("coordinates") ?: return@runOnUiThread
                            val outerRing = rings.optJSONArray(0) ?: return@runOnUiThread
                            if (outerRing.length() < 4) return@runOnUiThread

                            val points = mutableListOf<Pair<Double, Double>>()
                            for (i in 0 until outerRing.length() - 1) {
                                val point = outerRing.optJSONArray(i) ?: continue
                                val lon = point.optDouble(0, Double.NaN)
                                val lat = point.optDouble(1, Double.NaN)
                                if (lat.isNaN() || lon.isNaN()) continue
                                points.add(lat to lon)
                            }

                            if (points.size < 3) return@runOnUiThread

                            val nombre = area.optString("nombre", "PolÃ­gono / Zona")
                            val color = area.optString("color", "#FFD700").ifBlank { "#FFD700" }
                            val opacity = metaAny.optDouble("opacity", 0.35)
                            val outlineWidth = metaAny.optDouble("outline_width", 3.0)
                            val pointsJson = buildPolygonPointsJson(points)

                            if (isCesiumReady) {
                                cesiumWebController.addAreaPolygonToMap(
                                    idArea, nombre, pointsJson, color, opacity, outlineWidth
                                )
                            } else {
                                pendingAreaPolygonAdditions.add(
                                    PendingAreaPolygonAddition(
                                        idArea, nombre, pointsJson, color, opacity, outlineWidth
                                    )
                                )
                            }
                            return@runOnUiThread
                        }

                        val meta = geometria.optJSONObject("meta") ?: return@runOnUiThread
                        if (!meta.optString("shape").equals("circle", ignoreCase = true)) return@runOnUiThread

                        val center = meta.optJSONArray("center") ?: return@runOnUiThread
                        if (center.length() < 2) return@runOnUiThread

                        val idArea = area.optInt("id_area", -1)
                        val centerLon = center.optDouble(0, Double.NaN)
                        val centerLat = center.optDouble(1, Double.NaN)
                        val radiusM = meta.optDouble("radius_m", Double.NaN)
                        val nombre = area.optString("nombre", "Círculo de cobertura")
                        val color = area.optString("color", "#FF4500").ifBlank { "#FF4500" }
                        val opacity = meta.optDouble("opacity", 0.35)
                        val outlineWidth = meta.optDouble("outline_width", 3.0)

                        if (idArea <= 0 || centerLat.isNaN() || centerLon.isNaN() || radiusM.isNaN()) {
                            return@runOnUiThread
                        }

                        if (isCesiumReady) {
                            cesiumWebController.addCoverageCircleToMap(
                                idArea, centerLat, centerLon, radiusM, nombre, color, opacity, outlineWidth
                            )
                        } else {
                            pendingCoverageCircleAdditions.add(
                                PendingCoverageCircleAddition(
                                    idArea, centerLat, centerLon, radiusM, nombre, color, opacity, outlineWidth
                                )
                            )
                        }
                    }
                },
                onAreaEliminada = { data ->
                    runOnUiThread {
                        val idArea = data.optInt("id_area", -1)
                        if (idArea > 0 && isCesiumReady) {
                            cesiumWebController.removeAreaFromMap(idArea)
                        }
                    }
                },
                onStructureCreada = { data ->
                    runOnUiThread {
                        val structure = data.optJSONObject("estructura") ?: return@runOnUiThread
                        val idMarca = structure.optInt("id_marca", -1)
                        val lat = structure.optDouble("latitud", Double.NaN)
                        val lon = structure.optDouble("longitud", Double.NaN)
                        val nombre = structure.optString("nombre", "Estructura")
                        val tipoEstructura = structure.optString("tipo_estructura", "EDIFICIO")
                        val iconoSrc = resolveStructureIconUrl(tipoEstructura)
                        if (idMarca <= 0 || lat.isNaN() || lon.isNaN()) return@runOnUiThread

                        if (isCesiumReady) {
                            cesiumWebController.addStructureToMap(idMarca, lat, lon, nombre, tipoEstructura, iconoSrc)
                        } else {
                            pendingStructureAdditions.add(
                                PendingStructureAddition(idMarca, lat, lon, nombre, tipoEstructura, iconoSrc)
                            )
                        }
                    }
                },
                onStructureEliminada = { data ->
                    runOnUiThread {
                        val idMarca = data.optInt("id_marca", -1)
                        if (idMarca > 0 && isCesiumReady) {
                            cesiumWebController.removeStructureFromMap(idMarca)
                        }
                    }
                },
                onDibujoCreado = { data ->
                    runOnUiThread {
                        val dibujo = data.optJSONObject("dibujo") ?: return@runOnUiThread
                        val idDibujo = dibujo.optInt("id_dibujo", -1)
                        if (idDibujo <= 0) return@runOnUiThread
                        // Skip echo of our own drawings (already in drawingLocalToBackendId)
                        if (drawingLocalToBackendId.containsValue(idDibujo)) return@runOnUiThread
                        val puntos = dibujo.optJSONArray("puntos") ?: org.json.JSONArray()
                        val coords = org.json.JSONArray()
                        for (i in 0 until puntos.length()) {
                            val p = puntos.optJSONObject(i) ?: continue
                            val c = JSONObject()
                            c.put("lat", p.optDouble("lat"))
                            c.put("lng", p.optDouble("lng"))
                            coords.put(c)
                        }
                        if (coords.length() < 2) return@runOnUiThread
                        val d = JSONObject()
                        d.put("id_dibujo", idDibujo)
                        d.put("color", dibujo.optString("color", "#00ffa6"))
                        d.put("grosor", dibujo.optDouble("grosor", 4.0))
                        d.put("coords", coords)
                        val arr = org.json.JSONArray()
                        arr.put(d)
                        if (isCesiumReady) cesiumWebController.loadDrawings(arr.toString())
                    }
                },
                onDibujoEliminado = { data ->
                    runOnUiThread {
                        val idDibujo = data.optInt("id_dibujo", -1)
                        if (idDibujo > 0 && isCesiumReady) {
                            cesiumWebController.removeDrawingFromMap(idDibujo)
                        }
                    }
                },
                onConnected = {
                    runOnUiThread {
                        setServerConnectionBanner(false)
                    }
                    // Socket conectado y unido al room — emitir posición inmediatamente
                    val lat = lastKnownLat ?: return@ChatSocketManager
                    val lon = lastKnownLon ?: return@ChatSocketManager
                    if (::currentUser.isInitialized) {
                        chatSocketManager?.emitTracking(
                            idPersonal = currentUser.id,
                            lat = lat,
                            lon = lon,
                            apodo = currentUser.nombreCompleto,
                            rol = currentUser.rol.name
                        )
                    }
                },
                onDisconnected = {
                    runOnUiThread {
                        setServerConnectionBanner(true)
                    }
                },
                onConnectionError = {
                    runOnUiThread {
                        setServerConnectionBanner(true)
                    }
                }
            )
        }

        setContentView(R.layout.activity_main)

        panelContent = findViewById(R.id.panelContent)
        connectionBanner = findViewById(R.id.connectionBanner)
        btnNavOperation = findViewById(R.id.btnNavOperation)
        btnNavChat = findViewById(R.id.btnNavChat)
        btnNavPersonal = findViewById(R.id.btnNavPersonal)
        btnNavVehiculos = findViewById(R.id.btnNavVehiculos)
        btnNavEquipos = findViewById(R.id.btnNavEquipos)
        webView = findViewById(R.id.cesiumWebView)

        panelRenderer = MainPanelRenderer(this)

        cesiumWebController = CesiumWebController(
            webView = webView,
            jsBridge = MainJsBridge(this),
            opLat = opLat,
            opLon = opLon,
            opZoom = opZoom
        )

        mapActionController = MapActionController(this, cesiumWebController)

        panelContent.post {
            val maxH = (resources.displayMetrics.heightPixels * 0.40).toInt()
            val params = panelContent.layoutParams
            params.height = maxH
            panelContent.layoutParams = params
        }

        locationHelper = LocationHelper(
            activity = this,
            onLocationUpdate = { latitude, longitude ->
                cesiumWebController.updateMyPosition(latitude, longitude)
            },
            onEmitLocation = { lat, lon ->
                lastKnownLat = lat
                lastKnownLon = lon
                if (::currentUser.isInitialized) {
                    chatSocketManager?.emitTracking(
                        idPersonal = currentUser.id,
                        lat = lat,
                        lon = lon,
                        apodo = currentUser.nombreCompleto,
                        rol = currentUser.rol.name
                    )
                }
            }
        )

        panelNavigationController = PanelNavigationController(
            panelContent = panelContent,
            btnNavOperation = btnNavOperation,
            btnNavChat = btnNavChat,
            btnNavPersonal = btnNavPersonal,
            btnNavVehiculos = btnNavVehiculos,
            btnNavEquipos = btnNavEquipos,
            host = this
        )

        setupWebView()
        setupDrawingToolbar()
        panelNavigationController.setupNavigation()
        setupBackPress()
        panelNavigationController.showPanel(Panel.NONE)
        // Conectar socket primero para que esté listo cuando llegue la primera ubicación
        chatSocketManager?.connect()
        startServerConnectionMonitor()
        locationHelper.requestLocationPermissionOrStart()

        if (currentOperation.id > 0) {
            fetchMapaData()
            fetchPersonalPanelData()
            fetchVehiculosPanelData()
            fetchEquiposPanelData()
            startEmergencyService()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSimulation()
        stopServerConnectionMonitor()
        chatSocketManager?.disconnect()
        stopEmergencyService()
    }

    // ── EmergencyMonitorService ──────────────────────────────────────────────

    private fun startServerConnectionMonitor() {
        checkServerConnection()
        checkAssignedOperationStatus()
        connectionMonitorHandler.removeCallbacks(connectionMonitorRunnable)
        connectionMonitorHandler.postDelayed(connectionMonitorRunnable, 10000)
    }

    private fun stopServerConnectionMonitor() {
        connectionMonitorHandler.removeCallbacks(connectionMonitorRunnable)
    }

    private fun setServerConnectionBanner(show: Boolean) {
        if (!::connectionBanner.isInitialized) return
        connectionBanner.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun checkServerConnection() {
        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/health")
            .get()
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                runOnUiThread {
                    setServerConnectionBanner(true)
                }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = it.body?.string().orEmpty()
                    val isConnected = try {
                        it.isSuccessful && JSONObject(body).optBoolean("ok", false)
                    } catch (_: Exception) {
                        false
                    }

                    runOnUiThread {
                        setServerConnectionBanner(!isConnected)
                    }
                }
            }
        })
    }

    private fun checkAssignedOperationStatus() {
        if (!::currentUser.isInitialized || currentOperation.id <= 0) return

        operationStatusRepository.fetchAssignedOperation(
            userId = currentUser.id,
            token = AuthManager.getToken(this),
            onSuccess = { operation ->
                if (operation == null) {
                    runOnUiThread {
                        leaveClosedOperation(null)
                    }
                    return@fetchAssignedOperation
                }

                if (operation.id != currentOperation.id || operation.status != OperationStatus.ACTIVA) {
                    runOnUiThread {
                        leaveClosedOperation(operation)
                    }
                }
            },
            onError = { }
        )
    }

    private fun leaveClosedOperation(operation: Operation?) {
        stopSimulation()
        stopServerConnectionMonitor()
        chatSocketManager?.disconnect()
        stopEmergencyService()

        val intent = Intent(this, OperationStatusActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("USER_ID", currentUser.id)
            putExtra("OPERATION_ID", operation?.id ?: currentOperation.id)
            putExtra("OP_ESTADO", operation?.status?.name ?: "CERRADA")
        }

        startActivity(intent)
        finish()
    }

    private fun buildEmergencyServiceIntent(): Intent =
        Intent(this, EmergencyMonitorService::class.java).apply {
            putExtra(EmergencyMonitorService.EXTRA_OPERATION_ID, currentOperation.id)
            putExtra(EmergencyMonitorService.EXTRA_TOKEN, AuthManager.getToken(this@MainActivity))
            putExtra(EmergencyMonitorService.EXTRA_UNIT_CODE, currentOperation.codigo)
            putExtra(EmergencyMonitorService.EXTRA_USER_NAME, currentUser.nombreCompleto)
        }

    private fun hasLocationPermission(): Boolean {
        val fineOk = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarseOk = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        return fineOk || coarseOk
    }

    private fun startEmergencyService() {
        if (currentOperation.id <= 0 || emergencyServiceStarted || !hasLocationPermission()) return
        val intent = buildEmergencyServiceIntent()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        emergencyServiceStarted = true
        Log.d("EMERGENCY", "EmergencyMonitorService iniciado para op=${currentOperation.id}")
    }

    private fun stopEmergencyService() {
        stopService(Intent(this, EmergencyMonitorService::class.java))
        emergencyServiceStarted = false
        Log.d("EMERGENCY", "EmergencyMonitorService detenido")
    }

    override fun addMessage(msg: ChatMessage) {
        runOnUiThread {
            val exists = msg.id != null && messages.any { it.id == msg.id }
            if (exists) return@runOnUiThread

            messages.add(msg)

            if (::chatAdapter.isInitialized) {
                chatAdapter.notifyItemInserted(messages.size - 1)
                if (::chatRecycler.isInitialized) {
                    chatRecycler.scrollToPosition(messages.size - 1)
                }
            }
        }
    }

    override fun openChatPanel() {
        panelNavigationController.showPanel(Panel.CHAT)
    }

    override fun isChatPanelActive(): Boolean =
        panelNavigationController.activePanel == Panel.CHAT

    fun requestLocationPermissionFromBridge() {
        locationHelper.requestLocationPermissionOrStart()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        locationHelper.handlePermissionsResult(requestCode, grantResults)
        if (hasLocationPermission()) {
            startEmergencyService()
        }
    }

    private fun fetchMapaData() {
        val token = AuthManager.getToken(this)

        operationMapRepository.fetchMapaData(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { data ->
                runOnUiThread {
                    data.operationZone?.let { zone ->
                        opLat = zone.centerLat
                        opLon = zone.centerLon
                        opZoom = zone.zoomInicial
                        cesiumWebController.setOperationView(opLat, opLon, opZoom)

                        val zoneJson = buildString {
                            append("{")
                            append("\"id_zona\":${zone.idZona},")
                            append("\"nombre\":\"${zone.nombre.replace("\"", "\\\"")}\",")
                            append("\"centroide_lat\":${zone.centerLat},")
                            append("\"centroide_lon\":${zone.centerLon},")
                            append("\"zoom_inicial\":${zone.zoomInicial},")
                            append("\"color\":\"${zone.color}\",")
                            append("\"points\":${buildPolygonPointsJson(zone.points)}")
                            append("}")
                        }
                        if (isCesiumReady) {
                            cesiumWebController.loadOperationZone(zoneJson)
                        } else {
                            pendingOperationZoneJson = zoneJson
                        }
                    } ?: cesiumWebController.applyOperationView()
                    
                    data.rutasNavegacion?.let { jsonString ->
                        updateSimulationRouteFromRoutesJson(jsonString)
                        // Pequeño delay adicional para asegurar que Cesium y las funciones JS ya están listas
                        findViewById<WebView>(R.id.cesiumWebView)?.postDelayed({
                            cesiumWebController.evaluate("if(typeof loadRemoteRoutes === 'function') loadRemoteRoutes($jsonString)")
                        }, 2600)
                    }

                    val trackingDelayMs = if (isCesiumReady) 0L else 2600L
                    findViewById<WebView>(R.id.cesiumWebView)?.postDelayed({
                        loadInitialTrackingMarkers(data.personal, data.vehiculos)
                    }, trackingDelayMs)

                    if (data.pois.isNotEmpty()) {
                        val poisJson = buildString {
                            append("[")
                            data.pois.forEachIndexed { i, poi ->
                                if (i > 0) append(",")
                                append("{")
                                append("\"id_poi\":${poi.idPoi},")
                                append("\"nombre\":\"${poi.nombre.replace("\"", "\\\"")}\",")
                                append("\"tipo_poi\":\"${poi.tipoPoi}\",")
                                append("\"latitud\":${poi.lat},")
                                append("\"longitud\":${poi.lon},")
                                append("\"color\":\"${poi.color}\"")
                                poi.iconoSrc?.let { icon ->
                                    append(",\"icono_src\":\"${resolvePoiIconUrl(icon)?.replace("\"", "\\\"")}\"")
                                }
                                poi.sidc?.let { sidc ->
                                    append(",\"sidc\":\"${sidc.replace("\"", "\\\"")}\"")
                                }
                                append("}")
                            }
                            append("]")
                        }
                        if (isCesiumReady) {
                            cesiumWebController.loadPois(poisJson)
                        } else {
                            pendingPoisJson = poisJson
                        }
                    }

                    if (data.coverageCircles.isNotEmpty()) {
                        val circlesJson = buildString {
                            append("[")
                            data.coverageCircles.forEachIndexed { i, circle ->
                                if (i > 0) append(",")
                                append("{")
                                append("\"id_area\":${circle.idArea},")
                                append("\"nombre\":\"${circle.nombre.replace("\"", "\\\"")}\",")
                                append("\"center_lat\":${circle.centerLat},")
                                append("\"center_lon\":${circle.centerLon},")
                                append("\"radius_m\":${circle.radiusM},")
                                append("\"color\":\"${circle.color}\",")
                                append("\"opacity\":${circle.opacity},")
                                append("\"outline_width\":${circle.outlineWidth}")
                                append("}")
                            }
                            append("]")
                        }
                        if (isCesiumReady) {
                            cesiumWebController.loadCoverageCircles(circlesJson)
                        } else {
                            pendingCoverageCirclesJson = circlesJson
                        }
                    }

                    if (data.areaPolygons.isNotEmpty()) {
                        val polygonsJson = buildString {
                            append("[")
                            data.areaPolygons.forEachIndexed { i, polygon ->
                                if (i > 0) append(",")
                                append("{")
                                append("\"id_area\":${polygon.idArea},")
                                append("\"nombre\":\"${polygon.nombre.replace("\"", "\\\"")}\",")
                                append("\"color\":\"${polygon.color}\",")
                                append("\"opacity\":${polygon.opacity},")
                                append("\"outline_width\":${polygon.outlineWidth},")
                                append("\"points\":${buildPolygonPointsJson(polygon.points)}")
                                append("}")
                            }
                            append("]")
                        }
                        if (isCesiumReady) {
                            cesiumWebController.loadAreaPolygons(polygonsJson)
                        } else {
                            pendingAreaPolygonsJson = polygonsJson
                        }
                    }

                    if (data.structures.isNotEmpty()) {
                        val structuresJson = buildString {
                            append("[")
                            data.structures.forEachIndexed { i, structure ->
                                if (i > 0) append(",")
                                append("{")
                                append("\"id_marca\":${structure.idMarca},")
                                append("\"nombre\":\"${structure.nombre.replace("\"", "\\\"")}\",")
                                append("\"tipo_estructura\":\"${structure.tipoEstructura.replace("\"", "\\\"")}\",")
                                append("\"latitud\":${structure.lat},")
                                append("\"longitud\":${structure.lon}")
                                structure.iconoSrc?.let { icon ->
                                    append(",\"icono_src\":\"${icon.replace("\"", "\\\"")}\"")
                                }
                                append("}")
                            }
                            append("]")
                        }
                        if (isCesiumReady) {
                            cesiumWebController.loadStructures(structuresJson)
                        } else {
                            pendingStructuresJson = structuresJson
                        }
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(
                        ChatMessage(
                            user = "Sistema",
                            text = message,
                            type = MessageType.SYSTEM
                        )
                    )
                }
            }
        )
    }

    private fun fetchPersonalPanelData() {
        val token = AuthManager.getToken(this)

        personalRepository.fetchPersonal(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { items ->
                runOnUiThread {
                    personalList.clear()
                    personalList.addAll(items)

                    if (panelNavigationController.activePanel == Panel.PERSONAL) {
                        inflatePersonalPanel()
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
                }
            }
        )
    }

    private fun fetchVehiculosPanelData() {
        val token = AuthManager.getToken(this)

        vehiculoRepository.fetchVehiculos(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { items ->
                runOnUiThread {
                    vehiculosList.clear()
                    vehiculosList.addAll(items)

                    if (panelNavigationController.activePanel == Panel.VEHICULOS) {
                        inflateVehiculoPanel()
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
                }
            }
        )
    }

    private fun fetchEquiposPanelData() {
        val token = AuthManager.getToken(this)

        equipoRepository.fetchEquipos(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { items ->
                runOnUiThread {
                    equiposList.clear()
                    equiposList.addAll(items)

                    if (panelNavigationController.activePanel == Panel.EQUIPOS) {
                        inflateEquipoPanel()
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
                }
            }
        )
    }

    private fun setupWebView() {
        cesiumWebController.setup()
    }

    override fun sendChatMessage(
        text: String,
        alert: Boolean,
        destinatarioRol: String?,
        destinoTipo: String?,
        destinoId: String?,
        destinoLabel: String?
    ) {
        if (currentOperation.id <= 0) {
            addMessage(ChatMessage(user = "Sistema", text = "No hay operación activa para enviar mensajes.", type = MessageType.SYSTEM))
            return
        }

        val token = AuthManager.getToken(this)

        chatRepository.sendMessage(
            operationId     = currentOperation.id,
            token           = token,
            contenido       = text,
            tipoMensaje     = if (alert) "URGENTE" else "NORMAL",
            destinatarioRol = destinatarioRol,
            destinoTipo     = destinoTipo,
            destinoId       = destinoId,
            destinoLabel    = destinoLabel,
            onSuccess = { item -> runOnUiThread { addMessage(parseChatMessage(item)) } },
            onError   = { message -> runOnUiThread { addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM)) } }
        )
    }

    private fun loadChatHistoryIfNeeded() {
        if (chatLoaded || currentOperation.id <= 0) return

        val token = AuthManager.getToken(this)

        chatRepository.getMessages(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { items ->
                runOnUiThread {
                    messages.clear()

                    for (i in 0 until items.length()) {
                        val item = items.optJSONObject(i) ?: continue
                        messages.add(parseChatMessage(item))
                    }

                    chatLoaded = true

                    if (::chatAdapter.isInitialized) {
                        chatAdapter.notifyDataSetChanged()
                        if (::chatRecycler.isInitialized && messages.isNotEmpty()) {
                            chatRecycler.scrollToPosition(messages.size - 1)
                        }
                    }
                }
            },
            onError = { message ->
                android.util.Log.w("CHAT_HTTP", "No se pudo cargar historial de chat: $message")
            }
        )
    }

    private fun parseChatMessage(item: JSONObject): ChatMessage {
        val id          = item.optInt("id_mensaje", -1).takeIf { it > 0 }
        val autor       = item.optString("autor_nombre", "Sistema")
        val contenido   = item.optString("contenido", "")
        val tipoMensaje = item.optString("tipo_mensaje", "NORMAL").uppercase()

        val messageType = when (tipoMensaje) {
            "URGENTE" -> MessageType.ALERT
            "SISTEMA" -> MessageType.SYSTEM
            else      -> MessageType.NORMAL
        }

        val idPersonal = item.optInt("id_personal", -1).takeIf { it > 0 }
        val idUsuario  = item.optInt("id_usuario",  -1).takeIf { it > 0 }
        val isMine = ::currentUser.isInitialized &&
            ((idPersonal != null && idPersonal == currentUser.id) ||
             (idUsuario  != null && idUsuario  == currentUser.id))

        return ChatMessage(
            id              = id,
            user            = autor,
            text            = contenido,
            type            = messageType,
            isMine          = isMine,
            destinatarioRol = item.optString("destinatario_rol", "GLOBAL"),
            autorRol        = item.optString("autor_rol", "").uppercase().ifBlank { null },
            destinoTipo     = optionalJsonString(item, "destino_tipo"),
            destinoId       = optionalJsonString(item, "destino_id"),
            destinoLabel    = optionalJsonString(item, "destino_label")
        )
    }

    private fun optionalJsonString(item: JSONObject, key: String): String? {
        if (!item.has(key) || item.isNull(key)) return null
        return item.optString(key, "").trim()
            .takeUnless { it.isBlank() || it.equals("null", ignoreCase = true) }
    }

    private fun jsString(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
            .replace("\r", " ")

    private fun loadInitialTrackingMarkers(personal: List<PersonalItem>, vehiculos: List<VehiculoItem>) {
        val js = buildString {
            append("(function(){")
            personal.forEach { person ->
                val lat = person.lat ?: return@forEach
                val lon = person.lon ?: return@forEach
                if (person.idPersonal == currentUser.id) return@forEach
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

    private fun updateSimulationRouteFromRoutesJson(routesJson: String) {
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
            }
        } catch (e: Exception) {
            Log.w("SIMULATION", "No se pudo cargar ruta para simulacion: ${e.message}")
        }
    }

    private fun updateSimulationRouteFromRouteJson(routeJson: String) {
        try {
            val points = parseSimulationRoutePoints(JSONObject(routeJson))
            val distanceSq = routeDistanceToSimulationAnchorSq(points)
            if (points.size >= 2 && distanceSq <= simulationRouteDistanceSq) {
                simulationRoutePoints.clear()
                simulationRoutePoints.addAll(points)
                simulationRouteDistanceSq = distanceSq
                simulationRouteStartTick = null
                simulationRouteDeletedTick = null
            }
        } catch (e: Exception) {
            Log.w("SIMULATION", "No se pudo actualizar ruta para simulacion: ${e.message}")
        }
    }

    private fun handleSimulationRouteDeleted() {
        simulationRoutePoints.clear()
        simulationRouteDistanceSq = Double.POSITIVE_INFINITY
        simulationRouteStartTick = null
        if (simulationActive) {
            simulationRouteDeletedTick = simulationTick
            simulationReturnStartPersonPoints.clear()
            simulationReturnStartPersonPoints.putAll(simulationLastPersonPoints)
            simulationReturnVehiclePoint = simulationLastVehiclePoint
        } else {
            simulationRouteDeletedTick = null
            simulationReturnStartPersonPoints.clear()
            simulationReturnVehiclePoint = null
        }
    }

    private fun routeDistanceToSimulationAnchorSq(points: List<SimulationRoutePoint>): Double {
        if (points.isEmpty()) return Double.POSITIVE_INFINITY
        var best = Double.POSITIVE_INFINITY
        points.forEach { point ->
            val dLat = point.lat - simulationAnchorLat
            val dLon = point.lon - simulationAnchorLon
            val distanceSq = dLat * dLat + dLon * dLon
            if (distanceSq < best) best = distanceSq
        }
        return best
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

    override fun inflateOperationPanel() {
        panelRenderer.inflateOperationPanel(
            panelContent = panelContent,
            operation = currentOperation
        )
    }

    override fun shouldShowSimulationButton(): Boolean = currentOperation.id == 1

    override fun isSimulationActive(): Boolean = simulationActive

    override fun toggleSimulation() {
        if (simulationActive) {
            stopSimulation()
            Toast.makeText(this, "Simulacion detenida", Toast.LENGTH_SHORT).show()
        } else {
            startSimulation()
        }
    }

    override fun inflateChatPanel() {
        val refs: ChatPanelRefs = panelRenderer.inflateChatPanel(
            panelContent = panelContent,
            messages = messages,
            currentUser = currentUser,
            personalList = personalList
        )

        chatRecycler = refs.recyclerView
        chatAdapter = refs.adapter
        msgInput = refs.input

        loadChatHistoryIfNeeded()
    }

    override fun inflatePersonalPanel() {
        panelRenderer.inflatePersonalPanel(
            panelContent = panelContent,
            personalList = personalList,
            currentUser = currentUser
        )

        if (currentOperation.id > 0 && personalList.isEmpty()) {
            fetchPersonalPanelData()
        }
    }

    override fun inflateVehiculoPanel() {
        panelRenderer.inflateVehiculoPanel(
            panelContent = panelContent,
            vehiculosList = vehiculosList
        )

        if (currentOperation.id > 0 && vehiculosList.isEmpty()) {
            fetchVehiculosPanelData()
        }
    }

    override fun inflateEquipoPanel() {
        panelRenderer.inflateEquipoPanel(
            panelContent = panelContent,
            equiposList = equiposList
        )

        if (currentOperation.id > 0 && equiposList.isEmpty()) {
            fetchEquiposPanelData()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::locationHelper.isInitialized) {
            locationHelper.requestLocationPermissionOrStart()
        }
    }

    override fun onStop() {
        super.onStop()
        stopSimulation()
        if (::locationHelper.isInitialized) {
            locationHelper.stopLocationUpdates()
        }
    }

    fun showMapActionDialogFromBridge(lat: Double, lon: Double) {
        mapActionController.showMapActionDialog(currentUser, lat, lon)
    }

    fun applyOperationViewFromBridge() {
        isCesiumReady = true
        cesiumWebController.applyOperationView()

        // POIs del batch inicial (GET /mapa)
        pendingOperationZoneJson?.let { json ->
            pendingOperationZoneJson = null
            cesiumWebController.loadOperationZone(json)
        }

        pendingPoisJson?.let { json ->
            pendingPoisJson = null
            cesiumWebController.loadPois(json)
        }

        pendingCoverageCirclesJson?.let { json ->
            pendingCoverageCirclesJson = null
            cesiumWebController.loadCoverageCircles(json)
        }

        pendingAreaPolygonsJson?.let { json ->
            pendingAreaPolygonsJson = null
            cesiumWebController.loadAreaPolygons(json)
        }

        pendingStructuresJson?.let { json ->
            pendingStructuresJson = null
            cesiumWebController.loadStructures(json)
        }

        if (pendingCoverageCircleAdditions.isNotEmpty()) {
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
        }

        if (pendingAreaPolygonAdditions.isNotEmpty()) {
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
        }

        if (pendingStructureAdditions.isNotEmpty()) {
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
        }

        // POIs recibidos por socket antes de que Cesium estuviera listo
        if (pendingPoiAdditions.isNotEmpty()) {
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

        // Cargar dibujos libres guardados en backend
        if (currentOperation.id > 0) {
            loadDrawingsFromBackend()
        }
    }

    fun getCurrentUserRoleForBridge(): String = currentUser.rol.name

    fun getCurrentOperationNameForBridge(): String = currentOperation.nombre

    fun onRouteCreatedFromBridge(payloadJson: String) {
        Log.d("RUTA_ANDROID", "Ruta recibida desde bridge: $payloadJson")
        sendRouteToBackend(payloadJson)
    }

    private fun sendRouteToBackend(payloadJson: String) {
        val operationId = currentOperation.id
        Log.d("RUTA_ANDROID", "operationId actual: $operationId")
        if (operationId <= 0) {
            Log.e("RUTA_ANDROID", "No hay operación activa válida para enviar ruta")
            return
        }

        val token = AuthManager.getToken(this)
        if (token.isBlank()) {
            Log.e("RUTA_ANDROID", "No hay token para enviar ruta")
            return
        }

        val requestBody = payloadJson.toRequestBody(
            "application/json; charset=utf-8".toMediaType()
        )

        val url = "${ApiConfig.BASE_URL}/ops/$operationId/rutas/navegacion"
        Log.d("RUTA_ANDROID", "URL ruta: $url")

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(requestBody)
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("RUTA_ANDROID", "Error enviando ruta al backend", e)
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string().orEmpty()
                Log.d("RUTA_ANDROID", "Respuesta backend ruta: ${response.code} - $body")

                if (response.isSuccessful) {
                    try {
                        val json = JSONObject(body)
                        if (json.optBoolean("ok")) {
                            val rutaObj = json.optJSONObject("ruta")
                            if (rutaObj != null) {
                                lastRouteId = rutaObj.optInt("id_ruta", -1)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("RUTA_ANDROID", "Error parseando respuesta json de ruta", e)
                    }
                } else {
                    Log.e("RUTA_ANDROID", "Backend rechazó la ruta: $body")
                }
            }
        })
    }

    private fun resolvePoiIconUrl(iconoSrc: String?): String? {
        val cleaned = iconoSrc?.trim()
        if (cleaned.isNullOrBlank() || cleaned.equals("null", ignoreCase = true)) return null
        if (cleaned.startsWith("S")) return cleaned
        if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned
        return "${ApiConfig.BASE_URL}/${cleaned.trimStart('/')}"
    }

    override fun savePoi(lat: Double, lon: Double, nombre: String, tipoPoi: String, color: String, iconoSrc: String?) {
        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        val tipoCreador = if (currentUser.tabla == "personal") "PERSONAL" else "USUARIO"
        val idKey = if (currentUser.tabla == "personal") "id_personal" else "id_usuario"

        val body = """
            {
              "nombre": "${nombre.replace("\"", "\\\"")}",
              "tipo_poi": "$tipoPoi",
              "latitud": $lat,
              "longitud": $lon,
              "color": "$color",
              "icono_src": ${iconoSrc?.let { "\"${it.replace("\"", "\\\"")}\"" } ?: "null"},
              "sidc": ${iconoSrc?.takeIf { it.startsWith("S") }?.let { "\"${it.replace("\"", "\\\"")}\"" } ?: "null"},
              "tipo_creador": "$tipoCreador",
              "$idKey": ${currentUser.id}
            }
        """.trimIndent()

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/pois")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("POI", "Error guardando POI en backend", e)
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = "Error de conexión al guardar el POI.", type = MessageType.SYSTEM))
                }
            }
            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string().orEmpty()
                Log.d("POI", "POI guardado: ${response.code} - $responseBody")

                if (response.isSuccessful) {
                    try {
                        val json = JSONObject(responseBody)
                        val poi = json.optJSONObject("poi")
                        if (json.optBoolean("ok") && poi != null) {
                            val idPoi = poi.optInt("id_poi")
                            val poiLat = poi.optDouble("latitud", lat)
                            val poiLon = poi.optDouble("longitud", lon)
                            val poiNombre = poi.optString("nombre", nombre)
                            val poiTipo = poi.optString("tipo_poi", tipoPoi)
                            val poiColor = poi.optString("color", color).ifBlank { color }
                            val poiIconoSrc = resolvePoiIconUrl(poi.optString("icono_src", iconoSrc))
                            val poiSidc = poi.optString("sidc", null).takeUnless { it.isNullOrBlank() || it.equals("null", ignoreCase = true) }

                            runOnUiThread {
                                if (idPoi > 0) {
                                    cesiumWebController.addPoiToMap(
                                        idPoi = idPoi,
                                        lat = poiLat,
                                        lon = poiLon,
                                        nombre = poiNombre,
                                        tipoPoi = poiTipo,
                                        color = poiColor,
                                        iconoSrc = poiIconoSrc,
                                        sidc = poiSidc
                                    )
                                }

                                val coord = "%.5f, %.5f".format(poiLat, poiLon)
                                addMessage(
                                    ChatMessage(
                                        user = currentUser.nombreCompleto,
                                        text = "📍 $poiNombre [$poiTipo] → $coord",
                                        type = MessageType.NORMAL
                                    )
                                )
                            }
                            return
                        }
                    } catch (_: Exception) {
                        // Si no se pudo interpretar la respuesta, cae al mensaje genérico de error.
                    }
                }

                if (!response.isSuccessful) {
                    val mensaje = try {
                        JSONObject(responseBody).optString("mensaje", "No se pudo guardar el POI.")
                    } catch (_: Exception) {
                        "No se pudo guardar el POI."
                    }

                    runOnUiThread {
                        addMessage(ChatMessage(user = "Sistema", text = mensaje, type = MessageType.SYSTEM))
                    }
                }
            }
        })
    }

    fun sendClearRouteToBackend() {
        if (lastRouteId <= 0) return
        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        val url = "${ApiConfig.BASE_URL}/ops/$operationId/rutas/navegacion/$lastRouteId"
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .delete()
            .build()

        httpClient.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("RUTA_ANDROID", "Error limpiando ruta en backend", e)
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("RUTA_ANDROID", "Ruta limpiada: ${response.code}")
                lastRouteId = -1
            }
        })
    }

    // ── Dibujo libre ──────────────────────────────────────────────

    fun setupDrawingToolbar() {
        val btnPencil = findViewById<TextView>(R.id.btnPencil)
        val btnEraser = findViewById<TextView>(R.id.btnEraser)

        btnPencil.setOnClickListener {
            if (drawingMode == "pencil") {
                drawingMode = null
                cesiumWebController.stopPencilMode()
                btnPencil.alpha = 1f
            } else {
                drawingMode = "pencil"
                cesiumWebController.startPencilMode()
                cesiumWebController.stopEraserMode()
                btnPencil.alpha = 1f
                btnEraser.alpha = 0.4f
            }
        }

        btnEraser.setOnClickListener {
            if (drawingMode == "eraser") {
                drawingMode = null
                cesiumWebController.stopEraserMode()
                btnEraser.alpha = 1f
            } else {
                drawingMode = "eraser"
                cesiumWebController.startEraserMode()
                cesiumWebController.stopPencilMode()
                btnEraser.alpha = 1f
                btnPencil.alpha = 0.4f
            }
        }
    }

    fun loadDrawingsFromBackend() {
        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        drawingRepository.fetchDrawings(
            operationId = operationId,
            token = token,
            onSuccess = { items ->
                if (items.isEmpty()) return@fetchDrawings
                val arr = org.json.JSONArray()
                items.forEach { item ->
                    val localId = "draw_loaded_${item.optInt("id_dibujo")}"
                    drawingLocalToBackendId[localId] = item.optInt("id_dibujo")
                    val d = JSONObject()
                    d.put("id_dibujo", item.optInt("id_dibujo"))
                    d.put("color",     item.optString("color", "#00ffa6"))
                    d.put("grosor",    item.optDouble("grosor", 4.0))
                    // puntos viene como JSONArray desde postgres
                    val puntos = item.optJSONArray("puntos") ?: org.json.JSONArray()
                    // Convertir [{lat,lng}] al formato que espera loadDrawings en JS
                    val coords = org.json.JSONArray()
                    for (i in 0 until puntos.length()) {
                        val p = puntos.optJSONObject(i) ?: continue
                        val c = JSONObject()
                        c.put("lat", p.optDouble("lat"))
                        c.put("lng", p.optDouble("lng"))
                        coords.put(c)
                    }
                    d.put("coords", coords)
                    arr.put(d)
                }
                runOnUiThread {
                    cesiumWebController.loadDrawings(arr.toString())
                }
            },
            onError = { msg -> Log.w("DRAWING", "Error cargando dibujos: $msg") }
        )
    }

    fun onDrawingSavedFromBridge(strokeJson: String) {
        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        try {
            val stroke   = JSONObject(strokeJson)
            val localId  = stroke.optString("localId")
            val coords   = stroke.optJSONArray("coords") ?: return
            val color    = stroke.optString("color", "#00ffa6")
            val grosor   = stroke.optDouble("grosor", 4.0)

            val userData = JSONObject().apply {
                put("tabla",       if (currentUser.tabla == "personal") "personal" else "usuario")
                put("id_personal", currentUser.id)
                put("id_usuario",  currentUser.id)
            }

            drawingRepository.saveDrawing(
                operationId = operationId,
                token       = token,
                userData    = userData,
                coords      = coords,
                color       = color,
                grosor      = grosor,
                onSuccess   = { idDibujo ->
                    if (localId.isNotBlank()) drawingLocalToBackendId[localId] = idDibujo
                    Log.d("DRAWING", "Trazo guardado id_dibujo=$idDibujo localId=$localId")
                },
                onError = { msg -> Log.w("DRAWING", "Error guardando trazo: $msg") }
            )
        } catch (e: Exception) {
            Log.e("DRAWING", "Error parseando strokeJson: ${e.message}")
        }
    }

    fun onDrawingDeletedFromBridge(localId: String) {
        val idDibujo = drawingLocalToBackendId[localId] ?: run {
            Log.w("DRAWING", "onDrawingDeleted: sin id_dibujo para localId=$localId")
            return
        }
        drawingLocalToBackendId.remove(localId)

        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        drawingRepository.deleteDrawing(
            operationId = operationId,
            idDibujo    = idDibujo,
            token       = token,
            onError     = { msg -> Log.w("DRAWING", "Error borrando dibujo: $msg") }
        )
        Log.d("DRAWING", "Trazo eliminado id_dibujo=$idDibujo")
    }

    private fun startSimulation() {
        if (currentOperation.id != 1) {
            Toast.makeText(this, "La simulacion solo esta disponible en la operacion 1", Toast.LENGTH_SHORT).show()
            return
        }

        if (chatSocketManager == null) {
            Toast.makeText(this, "Socket no disponible para simulacion", Toast.LENGTH_SHORT).show()
            return
        }

        if (personalList.isEmpty()) {
            fetchPersonalPanelData()
            Toast.makeText(this, "Cargando personal de la flotilla. Intenta de nuevo en unos segundos.", Toast.LENGTH_SHORT).show()
            return
        }

        if (vehiculosList.isEmpty()) {
            fetchVehiculosPanelData()
            Toast.makeText(this, "Cargando vehiculos asignados. Intenta de nuevo en unos segundos.", Toast.LENGTH_SHORT).show()
            return
        }

        val targets = getSimulationTargets()
        if (targets.isEmpty()) {
            Toast.makeText(this, "No se encontro personal de la flotilla para simular.", Toast.LENGTH_SHORT).show()
            return
        }

        val vehicleTarget = getSimulationVehicleTarget()
        if (vehicleTarget == null) {
            Toast.makeText(this, "No se encontro un vehiculo sin ubicacion real para simular.", Toast.LENGTH_SHORT).show()
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
        prepareSimulationStartPoints(targets)
        simulationRunnable?.let { simulationHandler.removeCallbacks(it) }
        simulationRunnable = object : Runnable {
            override fun run() {
                emitSimulationPositions(targets, vehicleTarget)
                simulationTick += 1
                if (simulationActive) simulationHandler.postDelayed(this, 2500)
            }
        }
        simulationRunnable?.run()
        Toast.makeText(this, "Simulacion activada", Toast.LENGTH_SHORT).show()
    }

    private fun stopSimulation() {
        simulationActive = false
        simulationRunnable?.let { simulationHandler.removeCallbacks(it) }
        simulationRunnable = null
        simulationRouteStartTick = null
        simulationRouteDeletedTick = null
        simulationPersonStartPoints.clear()
        simulationLastPersonPoints.clear()
        simulationReturnStartPersonPoints.clear()
        simulationLastVehiclePoint = null
        simulationReturnVehiclePoint = null
    }

    private fun getSimulationTargets(): List<PersonalItem> {
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

    private fun getSimulationVehicleTarget(): VehiculoItem? =
        vehiculosList.firstOrNull { it.lat == null && it.lon == null }

    private fun prepareSimulationStartPoints(targets: List<PersonalItem>) {
        simulationPersonStartPoints.clear()
        val radiusLat = 55.0 / 111_320.0
        val radiusLon = 55.0 / 104_500.0
        targets.forEachIndexed { index, person ->
            val angle = Math.PI * 2.0 * index / targets.size.coerceAtLeast(1)
            simulationPersonStartPoints[person.idPersonal] = SimulationRoutePoint(
                lat = person.lat ?: (simulationAnchorLat + sin(angle) * radiusLat),
                lon = person.lon ?: (simulationAnchorLon + cos(angle) * radiusLon)
            )
        }
    }

    private fun isSimulationCandidate(person: PersonalItem): Boolean {
        val isOperationalRole =
            person.rol.equals("CELL", ignoreCase = true) ||
                person.rol.equals("CET", ignoreCase = true)
        if (!isOperationalRole) return false

        val hasRealBackendLocation = person.lat != null && person.lon != null
        val isCurrentDevice = person.idPersonal == currentUser.id
        val currentDeviceHasGps = isCurrentDevice && lastKnownLat != null && lastKnownLon != null

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

    private fun interpolatePoint(
        from: SimulationRoutePoint,
        to: SimulationRoutePoint,
        t: Double
    ): SimulationRoutePoint =
        SimulationRoutePoint(
            lat = from.lat + (to.lat - from.lat) * t,
            lon = from.lon + (to.lon - from.lon) * t
        )

    private fun emitSimulationPositions(
        targets: List<PersonalItem>,
        vehicleTarget: VehiculoItem
    ) {
        val routePoints = simulationRoutePoints.toList()
        val approachTicks = 4
        val vehicleToRouteTicks = 4
        val returnTicks = 4
        val vehicleStartDistanceM = 85.0
        val hasRoute = routePoints.size >= 2
        if (hasRoute && simulationRouteStartTick == null) {
            simulationRouteStartTick = simulationTick
        }
        val phaseTick = if (hasRoute) {
            simulationTick - (simulationRouteStartTick ?: simulationTick)
        } else {
            0
        }
        val vehicleStart = SimulationRoutePoint(
            lat = simulationAnchorLat + (vehicleStartDistanceM / 111_320.0),
            lon = simulationAnchorLon + (vehicleStartDistanceM / 104_500.0)
        )
        val isReturning = !hasRoute && simulationRouteDeletedTick != null
        val returnTick = simulationTick - (simulationRouteDeletedTick ?: simulationTick)
        val routeStart = routePoints.firstOrNull() ?: vehicleStart
        val vehiclePosition = when {
            isReturning -> simulationReturnVehiclePoint ?: simulationLastVehiclePoint ?: vehicleStart
            !hasRoute -> vehicleStart
            phaseTick < approachTicks -> vehicleStart
            phaseTick < approachTicks + vehicleToRouteTicks -> {
                val t = (phaseTick - approachTicks).toDouble() / vehicleToRouteTicks
                interpolatePoint(vehicleStart, routeStart, t.coerceIn(0.0, 1.0))
            }
            else -> {
                val routeTick = phaseTick - approachTicks - vehicleToRouteTicks
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
            val angle = if (hasRoute && phaseTick >= approachTicks + vehicleToRouteTicks) {
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
                val returnStart = simulationReturnStartPersonPoints[person.idPersonal] ?: startPoint
                if (returnTick < returnTicks) {
                    val t = returnTick.toDouble() / returnTicks
                    interpolatePoint(returnStart, startPoint, t.coerceIn(0.0, 1.0))
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
            } else if (phaseTick < approachTicks) {
                val t = phaseTick.toDouble() / approachTicks
                interpolatePoint(startPoint, groupedPoint, t.coerceIn(0.0, 1.0))
            } else {
                groupedPoint
            }
            val lat = personPosition.lat
            val lon = personPosition.lon
            simulationLastPersonPoints[person.idPersonal] = personPosition
            val name = person.apodo.ifBlank { "${person.nombre} ${person.apellido}".trim() }
                .ifBlank { "Personal ${person.idPersonal}" }

            chatSocketManager?.emitTracking(
                idPersonal = person.idPersonal,
                lat = lat,
                lon = lon,
                apodo = name,
                rol = person.rol
            )

            if (isCesiumReady) {
                cesiumWebController.evaluate(
                    "if(typeof updateTrackingPersonal === 'function') updateTrackingPersonal(${person.idPersonal}, $lat, $lon, '${jsString(name)}')"
                )
            }
        }

        val vehicleName = vehicleTarget.alias.ifBlank { vehicleTarget.codigoInterno }
            .ifBlank { vehicleTarget.nombre }
            .ifBlank { "Vehiculo ${vehicleTarget.idVehiculo}" }
        simulationLastVehiclePoint = vehiclePosition
        chatSocketManager?.emitTrackingVehiculo(
            idVehiculo = vehicleTarget.idVehiculo,
            lat = vehicleLat,
            lon = vehicleLon,
            alias = vehicleName
        )

        if (isCesiumReady) {
            cesiumWebController.evaluate(
                "if(typeof updateTrackingVehiculo === 'function') updateTrackingVehiculo(${vehicleTarget.idVehiculo}, $vehicleLat, $vehicleLon, '${jsString(vehicleName)}')"
            )
        }
    }

    private fun setupBackPress() {
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Salir")
                    .setMessage("¿Deseas cerrar sesión?")
                    .setPositiveButton("Cerrar sesión") { _, _ ->
                        AuthManager.logout(this@MainActivity)
                        goToLogin()
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
        })
    }

    private fun goToLogin() {
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
