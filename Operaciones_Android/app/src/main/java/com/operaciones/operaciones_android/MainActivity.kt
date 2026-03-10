package com.operaciones.operaciones_android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
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

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var panelContent: FrameLayout
    private lateinit var btnNavChat: LinearLayout
    private lateinit var btnNavPersonal: LinearLayout
    private lateinit var btnNavEquipo: LinearLayout

    private val messages = mutableListOf<ChatMessage>()
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var chatRecycler: RecyclerView
    private lateinit var msgInput: EditText

    private enum class Panel { NONE, CHAT, PERSONAL, EQUIPO }
    private var activePanel = Panel.NONE

    private lateinit var currentUser: User
    private lateinit var currentOperation: Operation
    private lateinit var locationManager: LocationManager
    private val LOCATION_PERM = 101

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val user = AuthManager.getCurrentUser(this)
        if (user == null) { goToLogin(); return }
        currentUser = user

        val opId = intent.getIntExtra("OPERATION_ID", -1)
        val op = MockData.operations.find { it.id == opId }
        if (op == null || op.status != OperationStatus.EN_REALIZACION) {
            startActivity(Intent(this, OperationStatusActivity::class.java)); finish(); return
        }
        currentOperation = op

        setContentView(R.layout.activity_main)
        webView        = findViewById(R.id.cesiumWebView)
        panelContent   = findViewById(R.id.panelContent)
        btnNavChat     = findViewById(R.id.btnNavChat)
        btnNavPersonal = findViewById(R.id.btnNavPersonal)
        btnNavEquipo   = findViewById(R.id.btnNavEquipo)

        setupWebView()
        setupNavigation()
        requestLocationPermission()
        showPanel(Panel.CHAT)
    }

    private fun setupWebView() {
        webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null)
        webView.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            allowFileAccessFromFileURLs = true; allowUniversalAccessFromFileURLs = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            loadWithOverviewMode = true; useWideViewPort = true
            setSupportZoom(false); mediaPlaybackRequiresUserGesture = false
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("CesiumJS", msg.message()); return true
            }
        }
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(JsBridge(), "Android")
        val html = assets.open("map.html").bufferedReader().use { it.readText() }
        webView.loadDataWithBaseURL("https://cesium.com", html, "text/html", "UTF-8", null)
    }

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
            else -> {}
        }
    }

    private fun setNavActive(btn: LinearLayout, active: Boolean) {
        (btn.getChildAt(1) as? TextView)?.setTextColor(
            if (active) Color.parseColor("#3b82f6") else Color.parseColor("#64748b"))
        btn.setBackgroundColor(if (active) Color.parseColor("#0d1f3c") else Color.TRANSPARENT)
    }

    private fun inflateChatPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_chat, panelContent, false)
        panelContent.addView(view)
        chatRecycler = view.findViewById(R.id.chatRecycler)
        msgInput     = view.findViewById(R.id.msgInput)
        val sendBtn  = view.findViewById<ImageButton>(R.id.sendBtn)
        val alertBtn = view.findViewById<ImageButton>(R.id.btnAlert)
        chatAdapter  = ChatAdapter(messages)
        chatRecycler.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        chatRecycler.adapter = chatAdapter
        if (messages.isNotEmpty()) chatRecycler.scrollToPosition(messages.size - 1)

        sendBtn.setOnClickListener {
            val t = msgInput.text.toString().trim()
            if (t.isNotEmpty()) { addMessage(ChatMessage(currentUser.nombreCompleto, t, MessageType.NORMAL)); msgInput.text.clear() }
        }
        alertBtn.setOnClickListener {
            val t = msgInput.text.toString().trim().ifEmpty { "Aviso de posición" }
            addMessage(ChatMessage("⚠️ ${currentUser.nombreCompleto}", t, MessageType.ALERT))
            msgInput.text.clear()
        }
    }

    private fun inflatePersonalPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_personal, panelContent, false)
        panelContent.addView(view)
        val list = view.findViewById<LinearLayout>(R.id.personalList)
        MockData.getPersonalForOperation(currentOperation.id).forEach { u ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_personal, list, false)
            row.findViewById<TextView>(R.id.personalAvatar).text = u.nombre.first().toString()
            row.findViewById<TextView>(R.id.personalNombre).text = u.nombreCompleto
            row.findViewById<TextView>(R.id.personalRol).text    = "${u.rol.display} · ${u.jerarquia}"
            if (u.id == currentUser.id) {
                row.setBackgroundColor(Color.parseColor("#0d1f3c"))
                row.findViewById<TextView>(R.id.personalNombre).setTextColor(Color.parseColor("#3b82f6"))
            }
            list.addView(row)
        }
    }

    private fun inflateEquipoPanel() {
        val view = LayoutInflater.from(this).inflate(R.layout.panel_equipo, panelContent, false)
        panelContent.addView(view)
        val list = view.findViewById<LinearLayout>(R.id.equipoList)
        MockData.getVehiclesForOperation(currentOperation.id).forEach { v ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_equipo, list, false)
            row.findViewById<TextView>(R.id.equipoIcon).text    = when(v.tipo){"Lancha"->"⛵";"UAV"->"🚁";else->"🚗"}
            row.findViewById<TextView>(R.id.equipoNombre).text  = v.nombre
            row.findViewById<TextView>(R.id.equipoDetalle).text = v.matricula
            row.findViewById<TextView>(R.id.equipoTipo).text    = v.tipo.uppercase()
            list.addView(row)
        }
        MockData.getEquipmentForOperation(currentOperation.id).forEach { e ->
            val row = LayoutInflater.from(this).inflate(R.layout.item_equipo, list, false)
            row.findViewById<TextView>(R.id.equipoIcon).text    = when(e.tipo){"Comunicación"->"📻";"Médico"->"🩺";"Navegación"->"🧭";else->"🔧"}
            row.findViewById<TextView>(R.id.equipoNombre).text  = e.nombre
            row.findViewById<TextView>(R.id.equipoDetalle).text = "S/N: ${e.serial}"
            row.findViewById<TextView>(R.id.equipoTipo).text    = e.tipo.uppercase()
            list.addView(row)
        }
    }

    fun addMessage(msg: ChatMessage) {
        runOnUiThread {
            messages.add(msg)
            if (::chatAdapter.isInitialized) {
                chatAdapter.notifyItemInserted(messages.size - 1)
                if (::chatRecycler.isInitialized) chatRecycler.scrollToPosition(messages.size - 1)
            }
        }
    }

    private fun requestLocationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) startLocationUpdates()
        else ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), LOCATION_PERM)
    }

    override fun onRequestPermissionsResult(rc: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(rc, perms, results)
        if (rc == LOCATION_PERM && results.firstOrNull() == PackageManager.PERMISSION_GRANTED) startLocationUpdates()
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        val listener = LocationListener { loc ->
            webView.post { webView.evaluateJavascript("updateMyPosition(${loc.latitude},${loc.longitude})", null) }
        }
        try { locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000L, 5f, listener) } catch (_: Exception) {}
        try { locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 5f, listener) } catch (_: Exception) {}
    }

    inner class JsBridge {
        @JavascriptInterface fun onMapTapped(lat: Double, lon: Double) = runOnUiThread { showMapActionDialog(lat, lon) }
        @JavascriptInterface fun sendTrafficAlert(message: String) { if (message != "Mapa listo") addMessage(ChatMessage("Sistema", message, MessageType.SYSTEM)) }
        @JavascriptInterface fun requestLocation() = requestLocationPermission()
        @JavascriptInterface fun getUserRole() = currentUser.rol.name
        @JavascriptInterface fun getOperationName() = currentOperation.nombre
    }

    private fun showMapActionDialog(lat: Double, lon: Double) {
        val coord = "%.5f, %.5f".format(lat, lon)
        val options = buildList {
            add("📍  Punto de interés"); add("🔴  Área de interés")
            if (currentUser.puedeAsignarEstructuras) add("🏗️  Estructura táctica")
            add("🚨  Aviso de posición")
        }
        AlertDialog.Builder(this).setTitle("Agregar en $coord")
            .setItems(options.toTypedArray()) { _, i ->
                val author = currentUser.nombreCompleto
                when {
                    i == 0 -> { webView.evaluateJavascript("addPointOfInterest($lat,$lon,'PDI','$author')", null); addMessage(ChatMessage(author, "📍 PDI agregado → $coord", MessageType.NORMAL)) }
                    i == 1 -> { webView.evaluateJavascript("addAreaOfInterest($lat,$lon,'$author')", null); addMessage(ChatMessage(author, "🔴 Área marcada → $coord", MessageType.NORMAL)) }
                    i == 2 && currentUser.puedeAsignarEstructuras -> { webView.evaluateJavascript("addTacticalStructure($lat,$lon,'$author')", null); addMessage(ChatMessage(author, "🏗️ Estructura → $coord", MessageType.NORMAL)) }
                    else -> addMessage(ChatMessage("⚠️ $author", "Aviso de posición → $coord", MessageType.ALERT))
                }
                if (activePanel != Panel.CHAT) showPanel(Panel.CHAT)
            }
            .setNegativeButton("Cancelar", null).show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        AlertDialog.Builder(this).setTitle("Salir").setMessage("¿Deseas cerrar sesión?")
            .setPositiveButton("Cerrar sesión") { _, _ -> AuthManager.logout(this); goToLogin() }
            .setNegativeButton("Cancelar", null).show()
    }

    private fun goToLogin() { startActivity(Intent(this, LoginActivity::class.java)); finish() }
}