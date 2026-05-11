package com.operaciones.operaciones_android.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Rect
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.location.LocationHelper
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.model.VehiculoItem
import com.operaciones.operaciones_android.network.ChatSocketManager
import com.operaciones.operaciones_android.ui.chat.OperationChatController
import com.operaciones.operaciones_android.ui.lifecycle.EmergencyServiceController
import com.operaciones.operaciones_android.ui.lifecycle.OperationLifecycleMonitor
import com.operaciones.operaciones_android.ui.map.MapObjectsController
import com.operaciones.operaciones_android.ui.map.OperationMapDataController
import com.operaciones.operaciones_android.ui.media.MediaStreamController
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController.Panel
import com.operaciones.operaciones_android.ui.panel.MainPanelRenderer
import com.operaciones.operaciones_android.ui.panel.PanelDataController
import com.operaciones.operaciones_android.ui.simulation.OperationSimulationController
import com.operaciones.operaciones_android.ui.socket.OperationSocketController
import com.operaciones.operaciones_android.webview.CesiumWebController
import com.operaciones.operaciones_android.webview.MainJsBridge
import okhttp3.OkHttpClient
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity(),
    MainPanelRenderer.Host,
    PanelNavigationController.Host,
    OperationSimulationController.Host,
    OperationChatController.Host,
    MediaStreamController.Host,
    EmergencyServiceController.Host,
    OperationLifecycleMonitor.Host,
    MapObjectsController.Host,
    OperationMapDataController.Host,
    PanelDataController.Host,
    OperationSocketController.Host {

    // Map: JS localId → id_dibujo del backend

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
    private lateinit var connectionBanner: TextView
    private lateinit var btnNavOperation: LinearLayout
    private lateinit var btnNavChat: LinearLayout
    private lateinit var btnNavPersonal: LinearLayout
    private lateinit var btnNavVehiculos: LinearLayout
    private lateinit var btnNavEquipos: LinearLayout
    private lateinit var btnMyLocation: ImageButton
    private lateinit var btnStreamMedia: ImageButton
    private lateinit var btnDeleteSelectedObject: ImageButton

    private var chatSocketManager: ChatSocketManager? = null

    private val httpClient = OkHttpClient()

    private lateinit var panelRenderer: MainPanelRenderer
    private lateinit var cesiumWebController: CesiumWebController
    private lateinit var locationHelper: LocationHelper
    private lateinit var simulationController: OperationSimulationController
    private lateinit var chatController: OperationChatController
    private lateinit var mediaStreamController: MediaStreamController
    private lateinit var emergencyServiceController: EmergencyServiceController
    private lateinit var lifecycleMonitor: OperationLifecycleMonitor
    private lateinit var mapObjectsController: MapObjectsController
    private lateinit var mapDataController: OperationMapDataController
    private lateinit var panelDataController: PanelDataController

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
    private var centerOnNextLocation = false
    private var followedPersonalId: Int? = null

    // Última posición conocida del usuario — se emite al socket cuando se conecta
    private var lastKnownLat: Double? = null
    private var lastKnownLon: Double? = null

    private var isCesiumReady = false

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            hideKeyboardIfTouchOutsideFocusedInput(event)
        }
        return super.dispatchTouchEvent(event)
    }

    private fun hideKeyboardIfTouchOutsideFocusedInput(event: MotionEvent) {
        val focusedInput = currentFocus as? EditText ?: return
        val inputBounds = Rect()
        focusedInput.getGlobalVisibleRect(inputBounds)

        if (inputBounds.contains(event.rawX.toInt(), event.rawY.toInt())) return

        focusedInput.clearFocus()

        val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(focusedInput.windowToken, 0)
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
        simulationController = OperationSimulationController(
            context = this,
            httpClient = httpClient,
            host = this
        )
        chatController = OperationChatController(host = this)
        lifecycleMonitor = OperationLifecycleMonitor(
            httpClient = httpClient,
            host = this
        )
        emergencyServiceController = EmergencyServiceController(this, this)

        chatSocketManager = OperationSocketController(this).create()
        setContentView(R.layout.activity_main)

        panelContent = findViewById(R.id.panelContent)
        connectionBanner = findViewById(R.id.connectionBanner)
        btnNavOperation = findViewById(R.id.btnNavOperation)
        btnNavChat = findViewById(R.id.btnNavChat)
        btnNavPersonal = findViewById(R.id.btnNavPersonal)
        btnNavVehiculos = findViewById(R.id.btnNavVehiculos)
        btnNavEquipos = findViewById(R.id.btnNavEquipos)
        btnMyLocation = findViewById(R.id.btnMyLocation)
        btnStreamMedia = findViewById(R.id.btnStreamMedia)
        btnDeleteSelectedObject = findViewById(R.id.btnDeleteSelectedObject)
        webView = findViewById(R.id.cesiumWebView)

        mediaStreamController = MediaStreamController(this, btnStreamMedia, this)
        panelRenderer = MainPanelRenderer(this)
        panelDataController = PanelDataController(this)

        cesiumWebController = CesiumWebController(
            webView = webView,
            jsBridge = MainJsBridge(this),
            opLat = opLat,
            opLon = opLon,
            opZoom = opZoom
        )

        mapDataController = OperationMapDataController(
            webView = webView,
            cesiumWebController = cesiumWebController,
            host = this
        )

        mapObjectsController = MapObjectsController(
            activity = this,
            cesiumWebController = cesiumWebController,
            httpClient = httpClient,
            host = this
        )

        panelContent.post {
            val maxH = (resources.displayMetrics.heightPixels * 0.40).toInt()
            val params = panelContent.layoutParams
            params.height = maxH
            panelContent.layoutParams = params
        }

        locationHelper = LocationHelper(
            activity = this,
            onLocationUpdate = { latitude, longitude ->
                lastKnownLat = latitude
                lastKnownLon = longitude
                cesiumWebController.updateMyPosition(latitude, longitude)
                if (::currentUser.isInitialized) {
                    panelRenderer.updatePersonalLocation(currentUser.id, latitude, longitude)
                    if (followedPersonalId == currentUser.id) {
                        cesiumWebController.centerOnLocation(latitude, longitude, zoom = 500, follow = true)
                    }
                }
                if (centerOnNextLocation) {
                    centerOnNextLocation = false
                    cesiumWebController.centerOnLocation(latitude, longitude, follow = false)
                }
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
        setupMyLocationButton()
        setupMediaStreamButton()
        setupSelectedObjectDeleteButton()
        setupObjectToolsMenu()
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
            requestMediaStreamForOperation()
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupMyLocationButton() {
        btnMyLocation.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    view.animate().cancel()
                    view.animate()
                        .scaleX(0.9f)
                        .scaleY(0.9f)
                        .alpha(0.78f)
                        .setDuration(70L)
                        .start()
                }

                MotionEvent.ACTION_UP,
                MotionEvent.ACTION_CANCEL -> {
                    view.animate().cancel()
                    view.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .alpha(1f)
                        .setDuration(110L)
                        .start()
                }
            }
            false
        }

        btnMyLocation.setOnClickListener {
            val lat = lastKnownLat
            val lon = lastKnownLon

            if (lat == null || lon == null) {
                centerOnNextLocation = true
                Toast.makeText(this, "Buscando tu ubicacion...", Toast.LENGTH_SHORT).show()
                locationHelper.requestLocationPermissionOrStart()
                return@setOnClickListener
            }

            cesiumWebController.updateMyPosition(lat, lon)
            cesiumWebController.centerOnLocation(lat, lon, follow = false)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupMediaStreamButton() {
        mediaStreamController.setupButton()
    }

    private fun setupSelectedObjectDeleteButton() {
        mapObjectsController.setupDeleteButton(btnDeleteSelectedObject)
    }

    fun onMapObjectSelectedFromBridge(payloadJson: String) {
        mapObjectsController.onMapObjectSelectedFromBridge(payloadJson)
    }

    fun clearSelectedMapObject() {
        if (::mapObjectsController.isInitialized) {
            mapObjectsController.clearSelectedMapObject()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopSimulation()
        stopServerConnectionMonitor()
        chatSocketManager?.disconnect()
        stopEmergencyService()
        stopMediaStream(showToast = false)
    }

    // ── EmergencyMonitorService ──────────────────────────────────────────────

    private fun startServerConnectionMonitor() {
        lifecycleMonitor.start()
    }

    private fun stopServerConnectionMonitor() {
        if (::lifecycleMonitor.isInitialized) {
            lifecycleMonitor.stop()
        }
    }

    private fun setServerConnectionBanner(show: Boolean) {
        if (!::connectionBanner.isInitialized) return
        connectionBanner.visibility = if (show) View.VISIBLE else View.GONE
    }

    override fun getLifecycleUserId(): Int? =
        if (::currentUser.isInitialized) currentUser.id else null

    override fun getLifecycleOperationId(): Int =
        if (::currentOperation.isInitialized) currentOperation.id else -1

    override fun getLifecycleToken(): String = AuthManager.getToken(this)

    override fun onServerConnectionChanged(isDisconnected: Boolean) {
        setServerConnectionBanner(isDisconnected)
    }

    override fun onAssignedOperationClosed(operation: Operation?) {
        leaveClosedOperation(operation)
    }

    private fun leaveClosedOperation(operation: Operation?) {
        stopSimulation()
        stopServerConnectionMonitor()
        chatSocketManager?.disconnect()
        stopEmergencyService()
        stopMediaStream(showToast = false)

        val intent = Intent(this, OperationStatusActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("USER_ID", currentUser.id)
            putExtra("OPERATION_ID", operation?.id ?: currentOperation.id)
            putExtra("OP_ESTADO", operation?.status?.name ?: "CERRADA")
        }

        startActivity(intent)
        finish()
    }

    override fun getEmergencyOperation(): Operation = currentOperation

    override fun getEmergencyUser(): User = currentUser

    override fun getEmergencyToken(): String = AuthManager.getToken(this)

    private fun hasLocationPermission(): Boolean =
        ::emergencyServiceController.isInitialized && emergencyServiceController.hasLocationPermission()

    private fun startEmergencyService() {
        if (::emergencyServiceController.isInitialized) {
            emergencyServiceController.start()
        }
    }

    private fun stopEmergencyService() {
        if (::emergencyServiceController.isInitialized) {
            emergencyServiceController.stop()
        }
    }

    private fun requestMediaStreamForOperation() {
        mediaStreamController.requestForOperation()
    }

    private fun stopMediaStream(showToast: Boolean = true) {
        if (::mediaStreamController.isInitialized) {
            mediaStreamController.stop(showToast)
        }
    }

    override fun getMediaOperationId(): Int = currentOperation.id

    override fun getMediaToken(): String = AuthManager.getToken(this)

    override fun getMediaUser(): User = currentUser

    override fun onInvalidMediaSession() {
        goToLogin()
    }

    override fun getMapOperationId(): Int = currentOperation.id

    override fun getMapToken(): String = AuthManager.getToken(this)

    override fun getMapCurrentUser(): User = currentUser

    override fun addMapMessage(msg: ChatMessage) {
        addMessage(msg)
    }

    override fun openMapChatPanel() {
        openChatPanel()
    }

    override fun isMapChatPanelActive(): Boolean =
        isChatPanelActive()

    override fun selectMapPersonal(idPersonal: Int?) {
        if (::panelRenderer.isInitialized) {
            panelRenderer.selectPersonal(idPersonal)
        }
    }

    override fun getMapDataOperationId(): Int = currentOperation.id

    override fun getMapDataToken(): String = AuthManager.getToken(this)

    override fun getMapDataCurrentUserId(): Int = currentUser.id

    override fun isMapDataCesiumReady(): Boolean = isCesiumReady

    override fun runMapDataOnUi(block: () -> Unit) {
        runOnUiThread(block)
    }

    override fun onMapDataOperationZoneChanged(lat: Double, lon: Double, zoom: Int) {
        opLat = lat
        opLon = lon
        opZoom = zoom
    }

    override fun onMapDataNavigationRoutesLoaded(routesJson: String) {
        updateSimulationRouteFromRoutesJson(routesJson)
    }

    override fun updateMapDataPersonalPanel(idPersonal: Int, lat: Double, lon: Double) {
        panelRenderer.updatePersonalLocation(idPersonal, lat, lon)
    }

    override fun loadMapDataDrawings(replace: Boolean) {
        loadDrawingsFromBackend(replace)
    }

    override fun onMapDataError(message: String) {
        addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
    }

    override fun getSocketOperationId(): Int = currentOperation.id

    override fun getSocketUserId(): Int = currentUser.id

    override fun getSocketUserRole(): String = currentUser.rol.name

    override fun getSocketUserName(): String = currentUser.nombreCompleto

    override fun getSocketLastKnownLat(): Double? = lastKnownLat

    override fun getSocketLastKnownLon(): Double? = lastKnownLon

    override fun isSocketCesiumReady(): Boolean = isCesiumReady

    override fun runSocketOnUi(block: () -> Unit) {
        runOnUiThread(block)
    }

    override fun onSocketNewMessage(item: JSONObject) {
        chatController.addMessageFromJson(item)
    }

    override fun onSocketRemoteRouteCreated(routeJson: String, route: JSONObject) {
        updateSimulationRouteFromRouteJson(routeJson)
        mapDataController.onRemoteRouteCreated(routeJson, route)
    }

    override fun onSocketRemoteRouteDeleted(idRoute: Int) {
        if (idRoute == -1) return
        handleSimulationRouteDeleted()
        cesiumWebController.evaluate("if(typeof removeRemoteRoute === 'function') removeRemoteRoute($idRoute)")
    }

    override fun onSocketTacticalRouteCreated(route: JSONObject) {
        mapDataController.onTacticalRouteCreated(route)
    }

    override fun onSocketTacticalRouteDeleted(idRoute: Int) {
        if (idRoute > 0 && isCesiumReady) {
            cesiumWebController.removeTacticalRouteFromMap(idRoute)
        }
    }

    override fun onSocketTrackingPersonal(id: Int, lat: Double, lon: Double, label: String) {
        cesiumWebController.evaluate(
            "if(typeof updateTrackingPersonal === 'function') updateTrackingPersonal($id, $lat, $lon, '${jsString(label)}')"
        )
        panelRenderer.updatePersonalLocation(id, lat, lon)
    }

    override fun onSocketTrackingVehicle(id: Int, lat: Double, lon: Double, label: String) {
        cesiumWebController.evaluate(
            "if(typeof updateTrackingVehiculo === 'function') updateTrackingVehiculo($id, $lat, $lon, '${jsString(label)}')"
        )
    }

    override fun onSocketPoiCreated(
        idPoi: Int,
        lat: Double,
        lon: Double,
        nombre: String,
        tipo: String,
        color: String,
        iconoSrc: String?,
        sidc: String?
    ) {
        mapDataController.onPoiCreated(idPoi, lat, lon, nombre, tipo, color, iconoSrc, sidc)
    }

    override fun onSocketPoiDeleted(idPoi: Int) {
        if (idPoi > 0 && isCesiumReady) {
            cesiumWebController.removePoiFromMap(idPoi)
        }
    }

    override fun onSocketAreaPolygonCreated(
        idArea: Int,
        nombre: String,
        pointsJson: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        mapDataController.onAreaPolygonCreated(idArea, nombre, pointsJson, color, opacity, outlineWidth)
    }

    override fun onSocketCoverageCircleCreated(
        idArea: Int,
        centerLat: Double,
        centerLon: Double,
        radiusM: Double,
        nombre: String,
        color: String,
        opacity: Double,
        outlineWidth: Double
    ) {
        mapDataController.onCoverageCircleCreated(idArea, centerLat, centerLon, radiusM, nombre, color, opacity, outlineWidth)
    }

    override fun onSocketAreaDeleted(idArea: Int) {
        if (idArea > 0 && isCesiumReady) {
            cesiumWebController.removeAreaFromMap(idArea)
        }
    }

    override fun onSocketStructureCreated(
        idMarca: Int,
        lat: Double,
        lon: Double,
        nombre: String,
        tipoEstructura: String
    ) {
        mapDataController.onStructureCreated(idMarca, lat, lon, nombre, tipoEstructura)
    }

    override fun onSocketStructureDeleted(idMarca: Int) {
        if (idMarca > 0 && isCesiumReady) {
            cesiumWebController.removeStructureFromMap(idMarca)
        }
    }

    override fun onSocketDrawingCreated(dibujo: JSONObject) {
        val idDibujo = dibujo.optInt("id_dibujo", -1)
        if (idDibujo <= 0 || mapObjectsController.hasDrawingBackendId(idDibujo)) return

        val puntos = dibujo.optJSONArray("puntos") ?: JSONArray()
        val coords = JSONArray()
        for (i in 0 until puntos.length()) {
            val p = puntos.optJSONObject(i) ?: continue
            coords.put(JSONObject().put("lat", p.optDouble("lat")).put("lng", p.optDouble("lng")))
        }
        if (coords.length() < 2) return

        val draw = JSONObject()
            .put("id_dibujo", idDibujo)
            .put("color", dibujo.optString("color", "#00ffa6"))
            .put("grosor", dibujo.optDouble("grosor", 4.0))
            .put("coords", coords)
        if (isCesiumReady) cesiumWebController.loadDrawings(JSONArray().put(draw).toString())
    }

    override fun onSocketDrawingDeleted(idDibujo: Int) {
        if (idDibujo > 0 && isCesiumReady) {
            cesiumWebController.removeDrawingFromMap(idDibujo)
        }
    }

    override fun onSocketConnected() {
        setServerConnectionBanner(false)
        syncMapStateFromBackend()
    }

    override fun onSocketDisconnected() {
        setServerConnectionBanner(true)
    }

    override fun addMessage(msg: ChatMessage) {
        chatController.addMessage(msg)
    }

    override fun openChatPanel() {
        panelNavigationController.showPanel(Panel.CHAT)
    }

    override fun selectPersonalOnMap(idPersonal: Int, lat: Double, lon: Double, label: String) {
        followedPersonalId = idPersonal
        panelRenderer.selectPersonal(idPersonal)
        if (::currentUser.isInitialized && idPersonal == currentUser.id) {
            cesiumWebController.selectTrackingPersonal(idPersonal)
            cesiumWebController.centerOnLocation(lat, lon, zoom = 500, follow = true)
        } else {
            cesiumWebController.followTrackingPersonal(idPersonal, lat, lon, zoom = 500)
        }
    }

    override fun refreshPersonalPanelIfActive() {
        if (panelNavigationController.activePanel == Panel.PERSONAL && personalList.isNotEmpty()) {
            panelNavigationController.showPanel(Panel.PERSONAL)
        }
    }

    private fun isChatPanelActive(): Boolean =
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

        if (::mediaStreamController.isInitialized) {
            mediaStreamController.handlePermissionsResult(requestCode)
        }
    }

    private fun fetchMapaData() {
        mapDataController.fetchMapaData()
    }
                    
    private fun syncMapStateFromBackend(force: Boolean = false) {
        if (::mapDataController.isInitialized) {
            mapDataController.syncFromBackend(force)
        }
    }

    override fun getPanelDataOperationId(): Int = currentOperation.id

    override fun getPanelDataToken(): String = AuthManager.getToken(this)

    override fun runPanelDataOnUi(block: () -> Unit) {
        runOnUiThread(block)
    }

    override fun onPanelPersonalLoaded(items: List<PersonalItem>) {
        personalList.clear()
        personalList.addAll(items)

        if (panelNavigationController.activePanel == Panel.PERSONAL) {
            inflatePersonalPanel()
        } else if (panelNavigationController.activePanel == Panel.CHAT) {
            chatController.refreshVisibleMessages()
        }
    }

    override fun onPanelVehiculosLoaded(items: List<VehiculoItem>) {
        vehiculosList.clear()
        vehiculosList.addAll(items)

        if (panelNavigationController.activePanel == Panel.VEHICULOS) {
            inflateVehiculoPanel()
        }
    }

    override fun onPanelEquiposLoaded(items: List<EquipoItem>) {
        equiposList.clear()
        equiposList.addAll(items)

        if (panelNavigationController.activePanel == Panel.EQUIPOS) {
            inflateEquipoPanel()
        }
    }

    override fun onPanelDataError(message: String) {
        addMessage(ChatMessage(user = "Sistema", text = message, type = MessageType.SYSTEM))
    }

    private fun fetchPersonalPanelData() {
        panelDataController.fetchPersonal()
    }

    private fun fetchVehiculosPanelData() {
        panelDataController.fetchVehiculos()
    }

    private fun fetchEquiposPanelData() {
        panelDataController.fetchEquipos()
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
        chatController.sendMessage(
            text = text,
            alert = alert,
            destinatarioRol = destinatarioRol,
            destinoTipo = destinoTipo,
            destinoId = destinoId,
            destinoLabel = destinoLabel
        )
    }

    private fun loadChatHistoryIfNeeded() {
        chatController.loadHistoryIfNeeded()
    }

    override fun getChatOperationId(): Int = currentOperation.id

    override fun getChatToken(): String = AuthManager.getToken(this)

    override fun getChatCurrentUser(): User = currentUser

    override fun getChatPersonal(): List<PersonalItem> = personalList

    private fun jsString(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", " ")
            .replace("\r", " ")

    override fun inflateOperationPanel() {
        panelRenderer.inflateOperationPanel(
            panelContent = panelContent,
            operation = currentOperation
        )
    }

    private fun updateSimulationRouteFromRoutesJson(routesJson: String) {
        simulationController.updateRoutesFromJson(routesJson)
    }

    private fun updateSimulationRouteFromRouteJson(routeJson: String) {
        simulationController.updateRouteFromJson(routeJson)
    }

    private fun handleSimulationRouteDeleted() {
        simulationController.handleRouteDeleted()
    }

    private fun stopSimulation() {
        if (::simulationController.isInitialized) {
            simulationController.stop()
        }
    }

    override fun shouldShowSimulationButton(): Boolean =
        ::simulationController.isInitialized && simulationController.canRun()

    override fun isSimulationActive(): Boolean =
        ::simulationController.isInitialized && simulationController.isActive

    override fun toggleSimulation() {
        simulationController.toggle()
    }

    override fun getSimulationOperation(): Operation = currentOperation

    override fun getSimulationUser(): User = currentUser

    override fun getSimulationPersonal(): List<PersonalItem> = personalList

    override fun getSimulationVehiculos(): List<VehiculoItem> = vehiculosList

    override fun getSimulationOperationLat(): Double = opLat

    override fun getSimulationOperationLon(): Double = opLon

    override fun getSimulationLastKnownLat(): Double? = lastKnownLat

    override fun getSimulationLastKnownLon(): Double? = lastKnownLon

    override fun hasSimulationSocket(): Boolean = chatSocketManager != null

    override fun fetchSimulationPersonal() {
        fetchPersonalPanelData()
    }

    override fun fetchSimulationVehiculos() {
        fetchVehiculosPanelData()
    }

    override fun emitSimulationPersonalTracking(
        idPersonal: Int,
        lat: Double,
        lon: Double,
        apodo: String,
        rol: String
    ) {
        chatSocketManager?.emitTracking(
            idPersonal = idPersonal,
            lat = lat,
            lon = lon,
            apodo = apodo,
            rol = rol
        )
    }

    override fun emitSimulationVehiculoTracking(
        idVehiculo: Int,
        lat: Double,
        lon: Double,
        alias: String
    ) {
        chatSocketManager?.emitTrackingVehiculo(
            idVehiculo = idVehiculo,
            lat = lat,
            lon = lon,
            alias = alias
        )
    }

    override fun isSimulationCesiumReady(): Boolean = isCesiumReady

    override fun updateSimulationPersonalOnMap(idPersonal: Int, lat: Double, lon: Double, label: String) {
        cesiumWebController.evaluate(
            "if(typeof updateTrackingPersonal === 'function') updateTrackingPersonal($idPersonal, $lat, $lon, '${jsString(label)}')"
        )
    }

    override fun updateSimulationVehiculoOnMap(idVehiculo: Int, lat: Double, lon: Double, label: String) {
        cesiumWebController.evaluate(
            "if(typeof updateTrackingVehiculo === 'function') updateTrackingVehiculo($idVehiculo, $lat, $lon, '${jsString(label)}')"
        )
    }

    override fun updateSimulationPersonalPanel(idPersonal: Int, lat: Double, lon: Double) {
        panelRenderer.updatePersonalLocation(idPersonal, lat, lon)
    }

    override fun inflateChatPanel() {
        chatController.refreshVisibleMessages(notify = false)

        val refs = panelRenderer.inflateChatPanel(
            panelContent = panelContent,
            messages = chatController.visibleMessages,
            currentUser = currentUser,
            personalList = personalList,
            onFilterChanged = { selection ->
                chatController.setActiveSelection(selection)
            }
        )

        chatController.bindPanel(refs)
        chatController.refreshVisibleMessages()
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
        if (::mediaStreamController.isInitialized) {
            mediaStreamController.updateButton()
        }
        if (isCesiumReady) {
            syncMapStateFromBackend()
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
        mapObjectsController.showMapActionDialogFromBridge(lat, lon)
    }

    fun applyOperationViewFromBridge() {
        isCesiumReady = true
        cesiumWebController.applyOperationView()
        mapDataController.applyOperationView()
    }

    fun getCurrentUserRoleForBridge(): String = currentUser.rol.name

    fun getCurrentOperationNameForBridge(): String = currentOperation.nombre

    fun onRouteCreatedFromBridge(payloadJson: String) {
        mapObjectsController.onRouteCreatedFromBridge(payloadJson)
    }

    fun sendClearRouteToBackend() {
        mapObjectsController.sendClearRouteToBackend()
    }

    fun setupObjectToolsMenu() {
        mapObjectsController.setupObjectToolsMenu()
    }

    fun loadDrawingsFromBackend(replace: Boolean = true) {
        mapObjectsController.loadDrawingsFromBackend(replace)
    }

    fun onDrawingSavedFromBridge(strokeJson: String) {
        mapObjectsController.onDrawingSavedFromBridge(strokeJson)
    }

    fun onDrawingDeletedFromBridge(localId: String) {
        mapObjectsController.onDrawingDeletedFromBridge(localId)
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
        if (::currentOperation.isInitialized && ::currentUser.isInitialized) {
            stopMediaStream(showToast = false)
        }
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }
}
