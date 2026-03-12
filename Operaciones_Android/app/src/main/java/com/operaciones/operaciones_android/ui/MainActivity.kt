package com.operaciones.operaciones_android.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView

import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response

import org.json.JSONObject

import java.io.IOException

import com.operaciones.operaciones_android.auth.AuthManager
import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.ChatMessage
import com.operaciones.operaciones_android.model.EquipoItem
import com.operaciones.operaciones_android.model.MessageType
import com.operaciones.operaciones_android.model.Operation
import com.operaciones.operaciones_android.model.OperationStatus
import com.operaciones.operaciones_android.model.PersonalItem
import com.operaciones.operaciones_android.model.User
import com.operaciones.operaciones_android.ui.adapter.ChatAdapter
import com.operaciones.operaciones_android.webview.MainJsBridge
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.model.OperationMapData
import com.operaciones.operaciones_android.network.OperationMapRepository

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
    private lateinit var btnNavChat: LinearLayout
    private lateinit var btnNavPersonal: LinearLayout
    private lateinit var btnNavEquipo: LinearLayout

    private val operationMapRepository = OperationMapRepository()

    private val messages = mutableListOf<ChatMessage>()
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var chatRecycler: RecyclerView
    private lateinit var msgInput: EditText

    private enum class Panel { NONE, CHAT, PERSONAL, EQUIPO }
    private var activePanel = Panel.NONE

    private lateinit var currentUser: User
    private lateinit var currentOperation: Operation
    private lateinit var locationManager: LocationManager
    private var locationListener: LocationListener? = null  // guardada para poder removerla

    private val LOCATION_PERM = 101
    private val http = OkHttpClient()

    // URL base — igual que LoginActivity
    private val BASE_URL = ApiConfig.BASE_URL

    // Datos de los paneles cargados desde la API
    private val personalList  = mutableListOf<PersonalItem>()
    private val vehiculosList = mutableListOf<EquipoItem>()
    private val equiposList   = mutableListOf<EquipoItem>()

    // Coordenadas de la operación
    private var opLat  = 0.0
    private var opLon  = 0.0
    private var opZoom = 8000

    // ── onCreate ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val user = AuthManager.getCurrentUser(this)
        if (user == null) { goToLogin(); return }
        currentUser = user

        opLat  = intent.getDoubleExtra("OP_LAT",  0.0)
        opLon  = intent.getDoubleExtra("OP_LON",  0.0)
        opZoom = intent.getIntExtra("OP_ZOOM", 8000)

        val opId = intent.getIntExtra("OPERATION_ID", -1)
        currentOperation = Operation(
            id          = opId,
            codigo      = intent.getStringExtra("OP_CODIGO")      ?: "",
            nombre      = intent.getStringExtra("OP_NOMBRE")      ?: "Operación",
            descripcion = intent.getStringExtra("OP_DESCRIPCION") ?: "",
            prioridad   = intent.getStringExtra("OP_PRIORIDAD")   ?: "MEDIA",
            status      = OperationStatus.ACTIVA,
            fechaInicio = intent.getStringExtra("OP_FECHA_INICIO") ?: "",
            fechaFin    = intent.getStringExtra("OP_FECHA_FIN")    ?: "",
            zonaLat     = opLat,
            zonaLon     = opLon,
            zonaZoom    = opZoom
        )

        if (currentOperation.id > 0) {
            val info = buildString {
                append("Operación: ${currentOperation.nombre}")
                if (currentOperation.codigo.isNotBlank()) append("\nCódigo: ${currentOperation.codigo}")
                append("\nUbicación: %.5f, %.5f".format(opLat, opLon))
            }
            addMessage(ChatMessage("Sistema", info, MessageType.SYSTEM))
        }

        setContentView(R.layout.activity_main)

        panelContent   = findViewById(R.id.panelContent)
        btnNavChat     = findViewById(R.id.btnNavChat)
        btnNavPersonal = findViewById(R.id.btnNavPersonal)
        btnNavEquipo   = findViewById(R.id.btnNavEquipo)
        webView        = findViewById(R.id.cesiumWebView)

        // Limitar altura del panel al 40% de la pantalla
        panelContent.post {
            val maxH = (resources.displayMetrics.heightPixels * 0.40).toInt()
            val params = panelContent.layoutParams
            params.height = maxH
            panelContent.layoutParams = params
        }

        setupWebView()
        setupNavigation()
        setupBackPress()
        requestLocationPermission()
        showPanel(Panel.NONE)

        // Cargar datos reales de la API en segundo plano
        if (currentOperation.id > 0) fetchMapaData()
    }

    // ── API: GET /ops/:id/mapa ────────────────────────────────────────────────

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

                    when (activePanel) {
                        Panel.PERSONAL -> inflatePersonalPanel()
                        Panel.EQUIPO   -> inflateEquipoPanel()
                        else           -> {}
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

    // ── WebView ───────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            allowFileAccessFromFileURLs = true
            allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            loadWithOverviewMode = true
            useWideViewPort = true
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("CesiumJS",
                    "${msg.message()} | line=${msg.lineNumber()} | source=${msg.sourceId()}")
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (opLat != 0.0 && opLon != 0.0) {
                    webView.postDelayed({
                        webView.evaluateJavascript("""
                            (function() {
                                if (typeof setOperationView === 'function') {
                                    setOperationView($opLat, $opLon, $opZoom);
                                    return 'OK';
                                }
                                return 'ERROR:setOperationView no existe';
                            })();
                        """.trimIndent(), null)
                    }, 2500)
                }
            }
        }

        webView.addJavascriptInterface(MainJsBridge(this), "Android")
        webView.loadUrl("file:///android_asset/map.html")
    }

    // ── Navegación de paneles ─────────────────────────────────────────────────

    private fun setupNavigation() {
        btnNavChat.setOnClickListener     { togglePanel(Panel.CHAT) }
        btnNavPersonal.setOnClickListener { togglePanel(Panel.PERSONAL) }
        btnNavEquipo.setOnClickListener   { togglePanel(Panel.EQUIPO) }
    }

    private fun togglePanel(panel: Panel) {
        showPanel(if (activePanel == panel) Panel.NONE else panel)
    }

    private fun showPanel(panel: Panel) {
        activePanel = panel
        panelContent.removeAllViews()

        setNavActive(btnNavChat,     panel == Panel.CHAT)
        setNavActive(btnNavPersonal, panel == Panel.PERSONAL)
        setNavActive(btnNavEquipo,   panel == Panel.EQUIPO)

        if (panel == Panel.NONE) { panelContent.visibility = View.GONE; return }

        panelContent.visibility = View.VISIBLE
        when (panel) {
            Panel.CHAT     -> inflateChatPanel()
            Panel.PERSONAL -> inflatePersonalPanel()
            Panel.EQUIPO   -> inflateEquipoPanel()
            Panel.NONE     -> {}
        }
    }

    private fun setNavActive(btn: LinearLayout, active: Boolean) {
        (btn.getChildAt(1) as? TextView)?.setTextColor(
            if (active) Color.parseColor("#3b82f6") else Color.parseColor("#64748b")
        )
        btn.setBackgroundColor(
            if (active) Color.parseColor("#0d1f3c") else Color.TRANSPARENT
        )
    }

    // ── Panel Chat ────────────────────────────────────────────────────────────

    private fun inflateChatPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)

        chatRecycler = view.findViewById(R.id.chatRecycler)
        msgInput     = view.findViewById(R.id.msgInput)
        val sendBtn  = view.findViewById<ImageButton>(R.id.sendBtn)
        val alertBtn = view.findViewById<ImageButton>(R.id.btnAlert)

        chatAdapter = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        chatRecycler.adapter = chatAdapter

        if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)

        sendBtn.setOnClickListener {
            val t = msgInput.text.toString().trim()
            if (t.isNotEmpty()) {
                addMessage(ChatMessage(currentUser.nombreCompleto, t, MessageType.NORMAL))
                msgInput.text.clear()
            }
        }

        alertBtn.setOnClickListener {
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posición" }
            addMessage(ChatMessage("⚠️ ${currentUser.nombreCompleto}", t, MessageType.ALERT))
            msgInput.text.clear()
        }
    }

    // ── Panel Personal ────────────────────────────────────────────────────────

    private fun inflatePersonalPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_personal, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.personalList)

        if (personalList.isEmpty()) {
            // Aún cargando o sin datos — mostrar placeholder
            val tv = TextView(this).apply {
                text = "Cargando personal..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        personalList.forEach { p ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_personal, list, false)

            row.findViewById<TextView>(R.id.personalAvatar).text =
                p.nombre.firstOrNull()?.toString() ?: "?"

            row.findViewById<TextView>(R.id.personalNombre).text =
                if (p.apodo.isNotBlank()) p.apodo else "${p.nombre} ${p.apellido}"

            row.findViewById<TextView>(R.id.personalRol).text =
                buildString {
                    if (p.rol.isNotBlank())    append(p.rol)
                    if (p.puesto.isNotBlank()) append(" · ${p.puesto}")
                }

            // Color de estado: verde si tiene posición reciente, gris si no
            val statusColor = if (p.lat != null && p.lon != null)
                Color.parseColor("#22c55e")
            else
                Color.parseColor("#475569")
            row.findViewById<View>(R.id.personalStatus).setBackgroundColor(statusColor)

            // Resaltar el usuario actual
            if (p.idPersonal == currentUser.id) {
                row.setBackgroundColor(Color.parseColor("#0d1f3c"))
                row.findViewById<TextView>(R.id.personalNombre)
                    .setTextColor(Color.parseColor("#3b82f6"))
            }

            list.addView(row)
        }
    }

    // ── Panel Equipo ──────────────────────────────────────────────────────────

    private fun inflateEquipoPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_equipo, panelContent, false)
        panelContent.addView(view)

        val list = view.findViewById<LinearLayout>(R.id.equipoList)

        if (vehiculosList.isEmpty() && equiposList.isEmpty()) {
            val tv = TextView(this).apply {
                text = "Cargando equipo..."
                setTextColor(Color.parseColor("#64748b"))
                textSize = 12f
                setPadding(0, 16, 0, 0)
            }
            list.addView(tv)
            return
        }

        fun addRow(item: EquipoItem) {
            val row = LayoutInflater.from(this).inflate(R.layout.item_equipo, list, false)

            row.findViewById<TextView>(R.id.equipoIcon).text = when {
                item.esVehiculo -> when (item.tipo.uppercase()) {
                    "INTERCEPTOR" -> "⛵"
                    "UAV", "DRON" -> "🚁"
                    "BLINDADO"    -> "🛡️"
                    else          -> "🚗"
                }
                else -> when (item.tipo.uppercase()) {
                    "COMUNICACION" -> "📻"
                    "TACTICO"      -> "🔧"
                    "NAVEGACION"   -> "🧭"
                    else           -> "🔧"
                }
            }

            row.findViewById<TextView>(R.id.equipoNombre).text  = item.nombre
            row.findViewById<TextView>(R.id.equipoDetalle).text = item.detalle
            row.findViewById<TextView>(R.id.equipoTipo).text    = item.tipo.uppercase()

            list.addView(row)
        }

        vehiculosList.forEach { addRow(it) }
        equiposList.forEach   { addRow(it) }
    }

    // ── Mensajes ──────────────────────────────────────────────────────────────

    fun addMessage(msg: ChatMessage) {
        runOnUiThread {
            messages.add(msg)
            if (::chatAdapter.isInitialized) {
                chatAdapter.notifyItemInserted(messages.size - 1)
                if (::chatRecycler.isInitialized)
                    chatRecycler.scrollToPosition(messages.size - 1)
            }
        }
    }

    // ── GPS ───────────────────────────────────────────────────────────────────

    private fun requestLocationPermission() {
        val fineOk   = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)   == PackageManager.PERMISSION_GRANTED
        val coarseOk = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        if (fineOk || coarseOk) startLocationUpdates()
        else ActivityCompat.requestPermissions(this,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            LOCATION_PERM)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERM &&
            grantResults.isNotEmpty() &&
            grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
            startLocationUpdates()
        }
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager

        // Guardar referencia al listener para poder removerlo en onStop
        locationListener = LocationListener { loc ->
            webView.post {
                webView.evaluateJavascript("""
                    (function() {
                        if (typeof updateMyPosition === 'function') {
                            updateMyPosition(${loc.latitude}, ${loc.longitude});
                        }
                    })();
                """.trimIndent(), null)
            }
        }

        try { locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,     5000L, 5f, locationListener!!) } catch (_: Exception) {}
        try { locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 5f, locationListener!!) } catch (_: Exception) {}
    }

    override fun onStop() {
        super.onStop()
        // Remover listener para evitar memory leak y consumo de GPS en segundo plano
        locationListener?.let {
            try { locationManager.removeUpdates(it) } catch (_: Exception) {}
        }
        locationListener = null
    }

    fun showMapActionDialogFromBridge(lat: Double, lon: Double) {
        showMapActionDialog(lat, lon)
    }

    fun applyOperationViewFromBridge() {
        if (opLat != 0.0 && opLon != 0.0) {
            webView.evaluateJavascript(
                "window.setOperationView($opLat, $opLon, $opZoom);",
                null
            )
        }
    }

    fun requestLocationPermissionFromBridge() {
        requestLocationPermission()
    }

    fun getCurrentUserRoleForBridge(): String = currentUser.rol.name

    fun getCurrentOperationNameForBridge(): String = currentOperation.nombre    

    // ── Diálogo de acción en mapa ─────────────────────────────────────────────

    private fun showMapActionDialog(lat: Double, lon: Double) {
        val coord = "%.5f, %.5f".format(lat, lon)

        val options = buildList {
            add("📍  Punto de interés")
            add("🔴  Área de interés")
            if (currentUser.puedeAsignarEstructuras) add("🏗️  Estructura táctica")
            add("🚨  Aviso de posición")
        }

        AlertDialog.Builder(this)
            .setTitle("Agregar en $coord")
            .setItems(options.toTypedArray()) { _, i ->
                val author = currentUser.nombreCompleto
                when {
                    i == 0 -> {
                        webView.evaluateJavascript(
                            "if (typeof addPointOfInterest === 'function') addPointOfInterest($lat, $lon, 'PDI', '$author');", null)
                        addMessage(ChatMessage(author, "📍 PDI agregado → $coord", MessageType.NORMAL))
                    }
                    i == 1 -> {
                        webView.evaluateJavascript(
                            "if (typeof addAreaOfInterest === 'function') addAreaOfInterest($lat, $lon, '$author');", null)
                        addMessage(ChatMessage(author, "🔴 Área marcada → $coord", MessageType.NORMAL))
                    }
                    i == 2 && currentUser.puedeAsignarEstructuras -> {
                        webView.evaluateJavascript(
                            "if (typeof addTacticalStructure === 'function') addTacticalStructure($lat, $lon, '$author');", null)
                        addMessage(ChatMessage(author, "🏗️ Estructura → $coord", MessageType.NORMAL))
                    }
                    else -> {
                        addMessage(ChatMessage("⚠️ $author", "Aviso de posición → $coord", MessageType.ALERT))
                    }
                }
                if (activePanel != Panel.CHAT) showPanel(Panel.CHAT)
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    // ── Back / logout ─────────────────────────────────────────────────────────

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