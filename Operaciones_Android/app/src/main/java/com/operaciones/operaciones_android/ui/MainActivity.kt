package com.operaciones.operaciones_android.ui

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.webkit.WebView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.RecyclerView
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
import com.operaciones.operaciones_android.network.OperationMapRepository
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter
import com.operaciones.operaciones_android.ui.panel.ChatPanelRefs
import com.operaciones.operaciones_android.ui.panel.MainPanelRenderer
import com.operaciones.operaciones_android.webview.CesiumWebController
import com.operaciones.operaciones_android.webview.MainJsBridge
import com.operaciones.operaciones_android.map.MapActionController
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController
import com.operaciones.operaciones_android.ui.navigation.PanelNavigationController.Panel

class MainActivity : AppCompatActivity(), MainPanelRenderer.Host, MapActionController.Host, PanelNavigationController.Host {

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
    private lateinit var btnNavChat: LinearLayout
    private lateinit var btnNavPersonal: LinearLayout
    private lateinit var btnNavEquipo: LinearLayout
    private lateinit var mapActionController: MapActionController

    private val operationMapRepository = OperationMapRepository()
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
    private val vehiculosList = mutableListOf<EquipoItem>()
    private val equiposList = mutableListOf<EquipoItem>()

    private var opLat = 0.0
    private var opLon = 0.0
    private var opZoom = 8000

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
            val info = buildString {
                append("Operación: ${currentOperation.nombre}")
                if (currentOperation.codigo.isNotBlank()) {
                    append("\nCódigo: ${currentOperation.codigo}")
                }
                append("\nUbicación: %.5f, %.5f".format(opLat, opLon))
            }
            addMessage(ChatMessage("Sistema", info, MessageType.SYSTEM))
        }

        setContentView(R.layout.activity_main)

        panelContent = findViewById(R.id.panelContent)
        btnNavChat = findViewById(R.id.btnNavChat)
        btnNavPersonal = findViewById(R.id.btnNavPersonal)
        btnNavEquipo = findViewById(R.id.btnNavEquipo)
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
            btnNavEquipo = btnNavEquipo,
            host = this
        )

        setupWebView()
        panelNavigationController.setupNavigation()
        locationHelper.requestLocationPermissionOrStart()
        setupBackPress()
        panelNavigationController.showPanel(Panel.NONE)

        if (currentOperation.id > 0) {
            fetchMapaData()
        }
    }

    override fun addMessage(msg: ChatMessage) {
        runOnUiThread {
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
                    personalList.clear()
                    personalList.addAll(data.personal)

                    vehiculosList.clear()
                    vehiculosList.addAll(data.vehiculos)

                    equiposList.clear()
                    equiposList.addAll(data.equipos)

                    when (panelNavigationController.activePanel) {
                        Panel.PERSONAL -> inflatePersonalPanel()
                        Panel.EQUIPO -> inflateEquipoPanel()
                        else -> {}
                    }
                }
            },
            onError = { message ->
                runOnUiThread {
                    addMessage(ChatMessage("Sistema", message, MessageType.SYSTEM))
                }
            }
        )
    }

    private fun setupWebView() {
        cesiumWebController.setup()
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
    }

    override fun inflatePersonalPanel() {
        panelRenderer.inflatePersonalPanel(
            panelContent = panelContent,
            personalList = personalList,
            currentUser = currentUser
        )
    }

    override fun inflateEquipoPanel() {
        panelRenderer.inflateEquipoPanel(
            panelContent = panelContent,
            vehiculosList = vehiculosList,
            equiposList = equiposList
        )
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
