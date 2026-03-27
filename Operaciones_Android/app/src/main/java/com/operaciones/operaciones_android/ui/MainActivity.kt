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

    private val personalRepository = PersonalRepository()
    private val vehiculoRepository = VehiculoRepository()
    private val equipoRepository = EquipoRepository()

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
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
                }
            )
        }

        setContentView(R.layout.activity_main)

        panelContent = findViewById(R.id.panelContent)
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

        locationHelper = LocationHelper(this) { latitude, longitude ->
            cesiumWebController.updateMyPosition(latitude, longitude)
        }

        panelNavigationController = PanelNavigationController(
            panelContent = panelContent,
            btnNavChat = btnNavChat,
            btnNavPersonal = btnNavPersonal,
            btnNavVehiculos = btnNavVehiculos,
            btnNavEquipos = btnNavEquipos,
            host = this
        )

        setupWebView()
        panelNavigationController.setupNavigation()
        locationHelper.requestLocationPermissionOrStart()
        setupBackPress()
        panelNavigationController.showPanel(Panel.NONE)
        chatSocketManager?.connect()

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

                    cesiumWebController.applyOperationView()
                    
                    data.rutasNavegacion?.let { jsonString ->
                        // Pequeño delay adicional para asegurar que Cesium y las funciones JS ya están listas
                        findViewById<WebView>(R.id.cesiumWebView)?.postDelayed({
                            cesiumWebController.evaluate("if(typeof loadRemoteRoutes === 'function') loadRemoteRoutes($jsonString)")
                        }, 2600)
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

    override fun sendChatMessage(text: String, alert: Boolean) {
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

        return ChatMessage(
            id = id,
            user = autor,
            text = contenido,
            type = messageType
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
        cesiumWebController.applyOperationView()
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

        val url = "http://192.168.202.103:3001/ops/$operationId/rutas/navegacion"
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

    fun sendClearRouteToBackend() {
        if (lastRouteId <= 0) return
        val operationId = currentOperation.id
        if (operationId <= 0) return
        val token = AuthManager.getToken(this)
        if (token.isBlank()) return

        val url = "http://192.168.202.103:3001/ops/$operationId/rutas/navegacion/$lastRouteId"
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