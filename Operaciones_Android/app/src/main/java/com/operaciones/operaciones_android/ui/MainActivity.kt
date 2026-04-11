package com.operaciones.operaciones_android.ui

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
import com.operaciones.operaciones_android.network.EquipoRepository
import com.operaciones.operaciones_android.network.OperationMapRepository
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
import org.json.JSONObject
import java.io.IOException

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
        val iconoSrc: String? = null
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

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
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
                                cesiumWebController.evaluate("if(typeof drawRemoteRoute === 'function') drawRemoteRoute($rutaJson)")
                            }
                        } else if (event == "eliminada") {
                            val idRuta = data.optInt("id_ruta", -1)
                            if (idRuta != -1) {
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
                        if (id > 0) {
                            cesiumWebController.evaluate("if(typeof updateTrackingPersonal === 'function') updateTrackingPersonal($id, $lat, $lon)")
                        }
                    }
                },
                onTrackingVehiculo = { data ->
                    runOnUiThread {
                        val id = data.optInt("id_vehiculo")
                        val lat = data.optDouble("latitud")
                        val lon = data.optDouble("longitud")
                        if (id > 0) {
                            cesiumWebController.evaluate("if(typeof updateTrackingVehiculo === 'function') updateTrackingVehiculo($id, $lat, $lon)")
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
                        if (idPoi > 0) {
                            if (isCesiumReady) {
                                cesiumWebController.addPoiToMap(idPoi, lat, lon, nombre, tipo, color, iconoSrc)
                            } else {
                                pendingPoiAdditions.add(
                                    PendingPoiAddition(idPoi, lat, lon, nombre, tipo, color, iconoSrc)
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
                onConnected = {
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
                }
            )
        }

        setContentView(R.layout.activity_main)

        panelContent = findViewById(R.id.panelContent)
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
        panelNavigationController.setupNavigation()
        setupBackPress()
        panelNavigationController.showPanel(Panel.NONE)
        // Conectar socket primero para que esté listo cuando llegue la primera ubicación
        chatSocketManager?.connect()
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
        chatSocketManager?.disconnect()
        stopEmergencyService()
    }

    // ── EmergencyMonitorService ──────────────────────────────────────────────

    private fun buildEmergencyServiceIntent(): Intent =
        Intent(this, EmergencyMonitorService::class.java).apply {
            putExtra(EmergencyMonitorService.EXTRA_OPERATION_ID, currentOperation.id)
            putExtra(EmergencyMonitorService.EXTRA_TOKEN, AuthManager.getToken(this@MainActivity))
            putExtra(EmergencyMonitorService.EXTRA_UNIT_CODE, currentOperation.codigo)
            putExtra(EmergencyMonitorService.EXTRA_USER_NAME, currentUser.nombreCompleto)
        }

    private fun startEmergencyService() {
        if (currentOperation.id <= 0) return
        val intent = buildEmergencyServiceIntent()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        Log.d("EMERGENCY", "EmergencyMonitorService iniciado para op=${currentOperation.id}")
    }

    private fun stopEmergencyService() {
        stopService(Intent(this, EmergencyMonitorService::class.java))
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
    }

    private fun fetchMapaData() {
        val token = AuthManager.getToken(this)

        operationMapRepository.fetchMapaData(
            operationId = currentOperation.id,
            token = token,
            onSuccess = { data ->
                runOnUiThread {
                    addMessage(
                        ChatMessage(
                            user = "Sistema",
                            text = "Mapa cargado correctamente.",
                            type = MessageType.SYSTEM
                        )
                    )

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
                        // Pequeño delay adicional para asegurar que Cesium y las funciones JS ya están listas
                        findViewById<WebView>(R.id.cesiumWebView)?.postDelayed({
                            cesiumWebController.evaluate("if(typeof loadRemoteRoutes === 'function') loadRemoteRoutes($jsonString)")
                        }, 2600)
                    }

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

    override fun sendChatMessage(text: String, alert: Boolean, destinatarioRol: String?) {
        if (currentOperation.id <= 0) {
            addMessage(
                ChatMessage(
                    user = "Sistema",
                    text = "No hay operación activa para enviar mensajes.",
                    type = MessageType.SYSTEM
                )
            )
            return
        }

        val token = AuthManager.getToken(this)
        val tipoMensaje = if (alert) "URGENTE" else "NORMAL"

        chatRepository.sendMessage(
            operationId = currentOperation.id,
            token = token,
            contenido = text,
            tipoMensaje = tipoMensaje,
            destinatarioRol = destinatarioRol,
            onSuccess = { item ->
                runOnUiThread {
                    addMessage(parseChatMessage(item))
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
                }
            }
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
                runOnUiThread {
                    addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
                }
            }
        )
    }

    private fun parseChatMessage(item: JSONObject): ChatMessage {
        val id = item.optInt("id_mensaje", -1).takeIf { it > 0 }
        val autor = item.optString("autor_nombre", "Sistema")
        val contenido = item.optString("contenido", "")
        val tipoMensaje = item.optString("tipo_mensaje", "NORMAL").uppercase()

        val messageType = when (tipoMensaje) {
            "URGENTE" -> MessageType.ALERT
            "SISTEMA" -> MessageType.SYSTEM
            else -> MessageType.NORMAL
        }

        val destinatarioRol = item.optString("destinatario_rol", "GLOBAL")
        val autorRol = item.optString("autor_rol", "").uppercase().ifBlank { null }

        return ChatMessage(
            id = id,
            user = autor,
            text = contenido,
            type = messageType,
            destinatarioRol = destinatarioRol,
            autorRol = autorRol
        )
    }

    override fun inflateOperationPanel() {
        panelRenderer.inflateOperationPanel(
            panelContent = panelContent,
            operation = currentOperation
        )
    }

    override fun inflateChatPanel() {
        val refs: ChatPanelRefs = panelRenderer.inflateChatPanel(
            panelContent = panelContent,
            messages = messages,
            currentUser = currentUser
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
                    poi.iconoSrc
                )
            }
            pendingPoiAdditions.clear()
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

                            runOnUiThread {
                                if (idPoi > 0) {
                                    cesiumWebController.addPoiToMap(
                                        idPoi = idPoi,
                                        lat = poiLat,
                                        lon = poiLon,
                                        nombre = poiNombre,
                                        tipoPoi = poiTipo,
                                        color = poiColor,
                                        iconoSrc = poiIconoSrc
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
