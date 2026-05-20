package com.operaciones.operaciones_android.wear.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.MediaRecorder
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.operaciones.operaciones_android.wear.auth.WearSession
import com.operaciones.operaciones_android.wear.bridge.PhoneBridge
import com.operaciones.operaciones_android.wear.config.WearApiConfig
import com.operaciones.operaciones_android.wear.data.WearChatMessage
import com.operaciones.operaciones_android.wear.data.WearOperation
import com.operaciones.operaciones_android.wear.data.WearOperationStatus
import com.operaciones.operaciones_android.wear.data.WearUser
import com.operaciones.operaciones_android.wear.emergency.WearEmergencyService
import com.operaciones.operaciones_android.wear.health.HeartRateMonitor
import com.operaciones.operaciones_android.wear.network.WearApiClient
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class WearMainActivity : Activity(), SensorEventListener {
    companion object {
        private const val REQUEST_RUNTIME_PERMISSIONS = 7001
        private const val REQUEST_AUDIO_PERMISSION = 7002
        private const val MIN_VITAL_UPLOAD_MS = 15_000L

        private val EXTRA_HEALTH_PERMISSIONS = arrayOf(
            "android.permission.health.READ_HEART_RATE",
            "android.permission.health.READ_OXYGEN_SATURATION",
            "android.permission.health.READ_BODY_TEMPERATURE",
            "android.permission.health.READ_RESPIRATORY_RATE",
            "android.permission.health.READ_BLOOD_PRESSURE"
        )

        val C_BG: Int = Color.parseColor("#060d1a")
        val C_INPUT: Int = Color.parseColor("#0a1520")
        val C_PANEL: Int = Color.parseColor("#101827")
        val C_PANEL_ALT: Int = Color.parseColor("#111827")
        val C_DIVIDER: Int = Color.parseColor("#1e2d45")
        val C_GOLD: Int = Color.parseColor("#C9A227")
        val C_TEXT: Int = Color.parseColor("#dbeafe")
        val C_MUTED: Int = Color.parseColor("#4b5563")
        val C_MUTED_DARK: Int = Color.parseColor("#2A3A50")
        val C_GREEN: Int = Color.parseColor("#4ade80")
        val C_GREEN_DARK: Int = Color.parseColor("#0d2218")
        val C_RED: Int = Color.parseColor("#f87171")
        val C_RED_DARK: Int = Color.parseColor("#1f0a0a")
        val C_BLUE: Int = Color.parseColor("#60a5fa")
    }

    private enum class Panel(val label: String) {
        OPERACION("OP"),
        MENSAJES("MSG"),
        RECURSOS("REC"),
        VITALES("VIT")
    }

    private enum class ChatChannel(
        val shortLabel: String,
        val title: String,
        val destinatarioRol: String,
        val destinoTipo: String? = null,
        val destinoId: String? = null,
        val destinoLabel: String? = null
    ) {
        TODOS("TOD", "Todos", "GLOBAL"),
        CETS("CET", "Todos los CET", "CET", "CETS", "ALL", "Todos los CETs"),
        CELULAS("CEL", "Celulas y CET", "CELL,CET")
    }

    private val api = WearApiClient()
    private lateinit var phoneBridge: PhoneBridge
    private var activePanel = Panel.OPERACION
    private var selectedChatChannel = ChatChannel.TODOS

    private var panelContainer: LinearLayout? = null
    private var statusText: TextView? = null
    private var heartRateValue: TextView? = null
    private var spo2Value: TextView? = null
    private var tempValue: TextView? = null
    private var respValue: TextView? = null
    private var bpValue: TextView? = null
    private var stepsValue: TextView? = null
    private var baroValue: TextView? = null
    private var chatList: LinearLayout? = null
    private var resourceList: LinearLayout? = null
    private var voiceButton: Button? = null
    private var resourceSummary: WearApiClient.ResourceSummary? = null

    private var serverInput: EditText? = null
    private var usernameInput: EditText? = null
    private var passwordInput: EditText? = null

    private var heartRateMonitor: HeartRateMonitor? = null
    private var lastHeartRate: Double? = null
    private var lastLat: Double? = null
    private var lastLon: Double? = null
    private var lastPressure: Float? = null
    private var initialSteps: Float? = null
    private var todaySteps: Long? = null
    private var lastVitalUploadAt = 0L

    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var pressureSensor: Sensor? = null
    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null

    private var voiceRecorder: MediaRecorder? = null
    private var voiceOutputFile: File? = null
    private var voiceStartedAt = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WearApiConfig.load(this)
        phoneBridge = PhoneBridge(this)
        requestRuntimePermissions()
        if (WearSession.isLoggedIn(this)) renderHome() else renderLogin()
    }

    override fun onResume() {
        super.onResume()
        startLocationUpdates()
        startMotionSensors()
        startHeartRateIfPossible()
        startEmergencyMonitorIfPossible()
    }

    override fun onPause() {
        heartRateMonitor?.stop()
        stopMotionSensors()
        super.onPause()
    }

    override fun onDestroy() {
        heartRateMonitor?.stop()
        stopLocationUpdates()
        stopMotionSensors()
        stopVoiceRecording(send = false)
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_AUDIO_PERMISSION) {
            if (hasPermission(Manifest.permission.RECORD_AUDIO)) startVoiceRecording()
            return
        }
        startLocationUpdates()
        startMotionSensors()
        startHeartRateIfPossible()
        startEmergencyMonitorIfPossible()
        if (activePanel == Panel.VITALES) renderActivePanel()
    }

    private fun renderLogin() {
        val content = compactColumn()
        content.addView(brandHeader("ACCESO"))
        content.addView(thinDivider(132))

        content.addView(fieldLabel("SERVIDOR"))
        serverInput = loginInput(WearApiConfig.baseUrl, "192.168.1.1:3001", InputType.TYPE_TEXT_VARIATION_URI)
        content.addView(serverInput)

        content.addView(fieldLabel("USUARIO"))
        usernameInput = loginInput("", "usuario", InputType.TYPE_CLASS_TEXT)
        content.addView(usernameInput)

        content.addView(fieldLabel("CLAVE"))
        passwordInput = loginInput(
            "",
            "password",
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        )
        content.addView(passwordInput)

        content.addView(proButton("ENTRAR", 136, C_GREEN, C_GREEN_DARK) { attemptLogin() })
        statusText = mutedText("listo", 7f)
        content.addView(statusText)
        setCenteredContent(content)
    }

    private fun renderHome() {
        val content = homeColumn()
        content.addView(topBar())
        content.addView(thinDivider(176))
        panelContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        content.addView(panelContainer)
        statusText = mutedText("", 7f)
        content.addView(statusText)
        setHomeContent(content, bottomNav())
        renderActivePanel()
        refreshOperation()
    }

    private fun renderActivePanel() {
        val container = panelContainer ?: return
        container.removeAllViews()
        when (activePanel) {
            Panel.OPERACION -> renderOperationPanel(container)
            Panel.MENSAJES -> renderChatPanel(container)
            Panel.RECURSOS -> renderResourcesPanel(container)
            Panel.VITALES -> renderVitalsPanel(container)
        }
    }

    private fun renderOperationPanel(container: LinearLayout) {
        val user = WearSession.user(this)
        val operation = WearSession.operation(this)
        container.addView(sectionBlock("OPERADOR", user?.nombreCompleto ?: "--", user?.rol?.name ?: "--"))
        container.addView(sectionBlock("OPERACION", operationTitle(operation), operation?.status?.name ?: "SIN ASIGNACION"))
        container.addView(twoButtonRow(
            proButton("SOS", 68, C_RED, C_RED_DARK) { sendEmergency("BOTON_RELOJ") },
            proButton("APP", 68, C_BLUE, C_PANEL_ALT) {
                phoneBridge.openPhone(WearSession.operation(this)) { ok ->
                    runOnUiThread { toast(if (ok) "Abriendo telefono" else "Telefono no conectado") }
                }
            }
        ))
    }

    private fun renderVitalsPanel(container: LinearLayout) {
        val heart = "%.0f".format(lastHeartRate ?: Double.NaN).takeUnless { it == "NaN" } ?: "--"
        container.addView(vitalHero(heart))

        val grid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        grid.addView(twoMetricRow(
            metricCard("SpO2", "-- %").also { spo2Value = it.value },
            metricCard("TEMP", "-- C").also { tempValue = it.value }
        ))
        grid.addView(twoMetricRow(
            metricCard("RESP", "-- rpm").also { respValue = it.value },
            metricCard("PA", "--/--").also { bpValue = it.value }
        ))
        grid.addView(twoMetricRow(
            metricCard("PASOS", todaySteps?.toString() ?: "--").also { stepsValue = it.value },
            metricCard("BARO", lastPressure?.let { "%.0f hPa".format(it) } ?: "--").also { baroValue = it.value }
        ))
        container.addView(grid)

        container.addView(proButton("PERMISOS SALUD", 176, C_PANEL_ALT, C_PANEL) {
            requestRuntimePermissions()
        })
    }

    private fun renderChatPanel(container: LinearLayout) {
        container.addView(sectionBlock("ENVIAR A", selectedChatChannel.title, selectedChatChannel.destinoLabel ?: "canal operativo"))
        container.addView(chatChannelSelector())
        chatList = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        container.addView(chatList)
        container.addView(twoButtonRow(
            proButton("REFRESCAR", 68, C_BLUE, C_PANEL_ALT) { refreshChat() },
            proButton("AUDIO", 68, C_GREEN, C_GREEN_DARK) { toggleVoiceRecording() }.also { voiceButton = it }
        ))
        container.addView(twoButtonRow(
            proButton("OK", 44, C_MUTED, C_PANEL) { sendQuickMessage("OK") },
            proButton("VOY", 44, C_MUTED, C_PANEL) { sendQuickMessage("En camino") },
            proButton("APOYO", 54, C_RED, C_RED_DARK) { sendQuickMessage("Necesito apoyo") }
        ))
        refreshChat()
    }

    private fun renderResourcesPanel(container: LinearLayout) {
        val summary = resourceSummary
        container.addView(twoMetricRow(
            metricCard("PERS", summary?.personal?.size?.toString() ?: "--"),
            metricCard("VEH", summary?.vehiculos?.size?.toString() ?: "--")
        ))
        container.addView(twoMetricRow(
            metricCard("EQP", summary?.equipos?.size?.toString() ?: "--"),
            metricCard("GPS", if (lastLat != null && lastLon != null) "OK" else "--")
        ))
        resourceList = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        container.addView(resourceList)
        renderResourceRows(summary)
        container.addView(proButton("ACTUALIZAR", 176, C_BLUE, C_PANEL_ALT) { refreshResources() })
        if (summary == null) refreshResources()
    }

    private fun attemptLogin() {
        val server = serverInput?.text?.toString().orEmpty()
        val username = usernameInput?.text?.toString()?.trim().orEmpty()
        val password = passwordInput?.text?.toString().orEmpty()
        if (username.isBlank() || password.isBlank()) {
            setStatus("faltan credenciales")
            return
        }
        try {
            WearApiConfig.saveBaseUrl(this, server)
        } catch (e: IllegalArgumentException) {
            setStatus(e.message ?: "servidor invalido")
            return
        }
        setStatus("conectando...")
        api.login(
            context = this,
            username = username,
            password = password,
            onSuccess = { login ->
                api.fetchAssignedOperation(
                    userId = login.user.id,
                    token = login.token,
                    onSuccess = { operation ->
                        WearSession.save(this, login.user, login.token, operation)
                        runOnUiThread {
                            toast("Sesion iniciada")
                            activePanel = Panel.OPERACION
                            renderHome()
                        }
                    },
                    onError = { error ->
                        WearSession.save(this, login.user, login.token, null)
                        runOnUiThread {
                            toast(error)
                            activePanel = Panel.OPERACION
                            renderHome()
                        }
                    }
                )
            },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun refreshOperation() {
        val user = WearSession.user(this) ?: return
        val token = WearSession.token(this)
        if (token.isBlank()) return
        api.fetchAssignedOperation(
            userId = user.id,
            token = token,
            onSuccess = { operation ->
                WearSession.saveOperation(this, operation)
                runOnUiThread {
                    if (activePanel == Panel.OPERACION) renderActivePanel()
                }
            },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun refreshChat() {
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (operation == null || token.isBlank()) {
            renderMessages(emptyList())
            return
        }
        api.getMessages(
            operationId = operation.id,
            token = token,
            onSuccess = { messages -> runOnUiThread { renderMessages(messages) } },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun refreshResources() {
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (operation == null || token.isBlank()) {
            renderResourceRows(null)
            return
        }
        api.getResourceSummary(
            operationId = operation.id,
            token = token,
            onSuccess = { summary ->
                resourceSummary = summary
                runOnUiThread {
                    if (activePanel == Panel.RECURSOS) renderActivePanel()
                }
            },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun renderMessages(messages: List<WearChatMessage>) {
        val list = chatList ?: return
        list.removeAllViews()
        val last = messages.filterForSelectedChat().takeLast(4)
        if (last.isEmpty()) {
            list.addView(sectionBlock("CHAT", "sin mensajes", selectedChatChannel.shortLabel))
            return
        }
        last.forEach { message ->
            val card = TextView(this).apply {
                text = messageLabel(message)
                setTextColor(if (message.tipo == "URGENTE") C_RED else C_TEXT)
                textSize = 8f
                typeface = Typeface.MONOSPACE
                gravity = Gravity.CENTER
                background = rounded(C_PANEL)
                includeFontPadding = false
                setPadding(dp(6), dp(5), dp(6), dp(5))
                if (message.attachmentUrl != null) setOnClickListener { openAttachment(message) }
            }
            list.addView(card, blockParams(176, top = 4))
        }
    }

    private fun List<WearChatMessage>.filterForSelectedChat(): List<WearChatMessage> =
        filter { message ->
            val rol = message.destinatarioRol.uppercase(Locale.US)
            val tipo = message.destinoTipo?.uppercase(Locale.US).orEmpty()
            when (selectedChatChannel) {
                ChatChannel.TODOS -> (tipo.isBlank() && rol == "GLOBAL") || tipo == "GLOBAL"
                ChatChannel.CETS -> tipo == "CETS" || (tipo.isBlank() && rol == "CET")
                ChatChannel.CELULAS -> tipo.isBlank() && rol == "CELL,CET"
            }
        }

    private fun renderResourceRows(summary: WearApiClient.ResourceSummary?) {
        val list = resourceList ?: return
        list.removeAllViews()
        if (summary == null) {
            list.addView(sectionBlock("RECURSOS", "sin datos", ""))
            return
        }
        addResourceGroup(list, "PERSONAL", summary.personal)
        addResourceGroup(list, "VEHICULOS", summary.vehiculos)
        addResourceGroup(list, "EQUIPOS", summary.equipos)
    }

    private fun addResourceGroup(list: LinearLayout, label: String, items: List<String>) {
        val shown = items.take(2).joinToString("\n").ifBlank { "--" }
        val suffix = if (items.size > 2) "+${items.size - 2}" else ""
        list.addView(sectionBlock(label, shown, suffix))
    }

    private fun messageLabel(message: WearChatMessage): String {
        val body = when (message.attachmentKind) {
            "AUDIO" -> "AUDIO ${message.attachmentName ?: ""}".trim()
            "IMAGE" -> "IMAGEN ${message.attachmentName ?: ""}".trim()
            "VIDEO" -> "VIDEO ${message.attachmentName ?: ""}".trim()
            else -> message.contenido.ifBlank { "--" }
        }
        return "${message.autor}\n$body"
    }

    private fun openAttachment(message: WearChatMessage) {
        val url = message.attachmentUrl ?: return
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(WearApiConfig.absoluteUrl(url)))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(intent) }
            .onFailure { toast("No se pudo abrir") }
    }

    private fun sendQuickMessage(text: String) {
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (operation == null || token.isBlank()) {
            toast("Sin operacion")
            return
        }
        api.sendMessage(
            operationId = operation.id,
            token = token,
            contenido = text,
            destinatarioRol = selectedChatChannel.destinatarioRol,
            destinoTipo = selectedChatChannel.destinoTipo,
            destinoId = selectedChatChannel.destinoId,
            destinoLabel = selectedChatChannel.destinoLabel,
            onSuccess = { runOnUiThread { refreshChat() } },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun sendEmergency(source: String) {
        val user = WearSession.user(this)
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (user == null || operation == null || token.isBlank()) {
            toast("Sin sesion u operacion")
            return
        }
        vibrateEmergency()
        phoneBridge.mirrorEmergency(operation.id, source)
        setStatus("enviando SOS")
        api.sendMessage(
            operationId = operation.id,
            token = token,
            contenido = emergencyContent(user, source),
            tipoMensaje = "URGENTE",
            onSuccess = { runOnUiThread { setStatus("SOS enviado") } },
            onError = { error -> runOnUiThread { setStatus(error) } }
        )
    }

    private fun emergencyContent(user: WearUser, source: String): String {
        val timestamp = SimpleDateFormat("HH:mm:ss dd/MM/yyyy", Locale.getDefault()).format(Date())
        val location = if (lastLat != null && lastLon != null) {
            "%.6f, %.6f".format(lastLat, lastLon)
        } else {
            "ubicacion no disponible"
        }
        val heart = lastHeartRate?.let { "%.0f bpm".format(it) } ?: "no disponible"
        return "EMERGENCIA RELOJ:\n" +
            "USUARIO: ${user.nombreCompleto}\n" +
            "ORIGEN: $source\n" +
            "PULSO: $heart\n" +
            "UBICACION: $location\n" +
            "HORA: $timestamp"
    }

    private fun toggleVoiceRecording() {
        if (voiceRecorder != null) {
            stopVoiceRecording(send = true)
            return
        }
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_AUDIO_PERMISSION)
            return
        }
        startVoiceRecording()
    }

    @Suppress("DEPRECATION")
    private fun startVoiceRecording() {
        val file = createAudioFile()
        voiceOutputFile = file
        voiceStartedAt = System.currentTimeMillis()
        try {
            voiceRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                MediaRecorder()
            }.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            voiceButton?.text = "ENVIAR"
            setStatus("grabando")
        } catch (e: Exception) {
            voiceRecorder?.release()
            voiceRecorder = null
            voiceOutputFile = null
            setStatus("microfono no disponible")
        }
    }

    private fun stopVoiceRecording(send: Boolean) {
        val recorder = voiceRecorder ?: return
        val file = voiceOutputFile
        val duration = (System.currentTimeMillis() - voiceStartedAt).coerceAtLeast(0L)
        try {
            recorder.stop()
        } catch (_: Exception) {
        } finally {
            recorder.release()
            voiceRecorder = null
            voiceOutputFile = null
            voiceStartedAt = 0L
            voiceButton?.text = "AUDIO"
        }
        if (!send || file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            return
        }
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (operation == null || token.isBlank()) {
            file.delete()
            toast("Sin operacion")
            return
        }
        setStatus("enviando audio")
        api.sendAttachment(
            operationId = operation.id,
            token = token,
            file = file,
            fileName = file.name,
            mimeType = "audio/mp4",
            attachmentKind = "AUDIO",
            durationMs = duration,
            destinatarioRol = selectedChatChannel.destinatarioRol,
            destinoTipo = selectedChatChannel.destinoTipo,
            destinoId = selectedChatChannel.destinoId,
            destinoLabel = selectedChatChannel.destinoLabel,
            onSuccess = {
                file.delete()
                runOnUiThread {
                    setStatus("audio enviado")
                    refreshChat()
                }
            },
            onError = { error ->
                file.delete()
                runOnUiThread { setStatus(error) }
            }
        )
    }

    private fun createAudioFile(): File {
        val dir = File(cacheDir, "wear_audio").apply { mkdirs() }
        return File.createTempFile("wear_voice_", ".m4a", dir)
    }

    private fun startHeartRateIfPossible() {
        val permission = if (Build.VERSION.SDK_INT >= 36) {
            HeartRateMonitor.READ_HEART_RATE_PERMISSION
        } else {
            Manifest.permission.BODY_SENSORS
        }
        if (!hasPermission(permission)) return
        if (heartRateMonitor == null) {
            heartRateMonitor = HeartRateMonitor(
                context = this,
                onHeartRate = { bpm ->
                    lastHeartRate = bpm
                    runOnUiThread {
                        heartRateValue?.text = "%.0f".format(bpm)
                    }
                    maybeSendVitals()
                },
                onStatus = { state -> runOnUiThread { setStatus(state.lowercase()) } }
            )
        }
        heartRateMonitor?.start()
    }

    private fun startMotionSensors() {
        if (sensorManager == null) {
            sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        }
        stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        pressureSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PRESSURE)
        stepSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        pressureSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    private fun stopMotionSensors() {
        sensorManager?.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        when (event?.sensor?.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val total = event.values.firstOrNull() ?: return
                val base = initialSteps ?: total.also { initialSteps = it }
                todaySteps = (total - base).coerceAtLeast(0f).toLong()
                stepsValue?.text = todaySteps?.toString() ?: "--"
                maybeSendVitals()
            }
            Sensor.TYPE_PRESSURE -> {
                lastPressure = event.values.firstOrNull()
                baroValue?.text = lastPressure?.let { "%.0f hPa".format(it) } ?: "--"
                maybeSendVitals()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) &&
            !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        ) return
        stopLocationUpdates()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationListener = LocationListener { location -> onLocation(location) }
        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).forEach { provider ->
            runCatching {
                locationManager?.requestLocationUpdates(provider, 15_000L, 10f, locationListener!!)
                locationManager?.getLastKnownLocation(provider)?.let { onLocation(it) }
            }
        }
    }

    private fun stopLocationUpdates() {
        locationListener?.let { listener -> runCatching { locationManager?.removeUpdates(listener) } }
        locationListener = null
    }

    private fun onLocation(location: Location) {
        lastLat = location.latitude
        lastLon = location.longitude

        val user = WearSession.user(this) ?: return
        val operation = WearSession.operation(this) ?: return
        val token = WearSession.token(this)
        if (token.isBlank() || user.tabla != "personal" || operation.status != WearOperationStatus.ACTIVA) return
        api.sendTracking(
            operationId = operation.id,
            token = token,
            idPersonal = user.id,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy
        )
        maybeSendVitals()
    }

    private fun maybeSendVitals(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastVitalUploadAt < MIN_VITAL_UPLOAD_MS) return

        val user = WearSession.user(this) ?: return
        val operation = WearSession.operation(this) ?: return
        val token = WearSession.token(this)
        if (token.isBlank() || user.tabla != "personal" || operation.status != WearOperationStatus.ACTIVA) return
        if (lastHeartRate == null && todaySteps == null && lastPressure == null && currentBatteryPct() == null) return

        lastVitalUploadAt = now
        api.sendVitalSigns(
            operationId = operation.id,
            token = token,
            idPersonal = user.id,
            heartRateBpm = lastHeartRate,
            steps = todaySteps,
            pressureHpa = lastPressure,
            batteryPct = currentBatteryPct(),
            latitude = lastLat,
            longitude = lastLon
        )
    }

    private fun currentBatteryPct(): Double? {
        val battery = getSystemService(BATTERY_SERVICE) as? BatteryManager ?: return null
        val pct = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return pct.takeIf { it in 0..100 }?.toDouble()
    }

    private fun startEmergencyMonitorIfPossible() {
        if (!WearSession.isLoggedIn(this)) return
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) &&
            !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        ) return
        val intent = Intent(this, WearEmergencyService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
    }

    private fun requestRuntimePermissions() {
        val permissions = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            if (Build.VERSION.SDK_INT >= 36) addAll(EXTRA_HEALTH_PERMISSIONS) else add(Manifest.permission.BODY_SENSORS)
        }.filterNot { hasPermission(it) }.toTypedArray()
        if (permissions.isNotEmpty()) requestPermissions(permissions, REQUEST_RUNTIME_PERMISSIONS)
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun setStatus(message: String) {
        statusText?.text = message.take(34)
    }

    private fun operationTitle(operation: WearOperation?): String {
        if (operation == null) return "--"
        return operation.codigo.ifBlank { operation.id.toString() }
    }

    private fun trackingState(): String {
        val operation = WearSession.operation(this)
        return if (operation?.status == WearOperationStatus.ACTIVA) "TRACKING ACTIVO" else "TRACKING PAUSADO"
    }

    private fun locationText(): String =
        if (lastLat != null && lastLon != null) "%.5f\n%.5f".format(lastLat, lastLon) else "--"

    private fun vibrateEmergency() {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 250, 120, 250, 120, 450), -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 250, 120, 250, 120, 450), -1)
        }
    }

    private fun setCenteredContent(content: LinearLayout) {
        setContentView(
            FrameLayout(this).apply {
                setBackgroundColor(C_BG)
                addView(
                    ScrollView(context).apply {
                        isFillViewport = true
                        addView(content)
                    },
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                )
            }
        )
    }

    private fun setHomeContent(content: LinearLayout, bottomNav: LinearLayout) {
        setContentView(
            FrameLayout(this).apply {
                setBackgroundColor(C_BG)
                addView(
                    ScrollView(context).apply {
                        isFillViewport = false
                        clipToPadding = false
                        setPadding(0, 0, 0, dp(62))
                        addView(content)
                    },
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                    )
                )
                addView(
                    bottomNav,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        dp(48),
                        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    ).apply { bottomMargin = dp(5) }
                )
            }
        )
    }

    private fun compactColumn(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, dp(8), 0, dp(8))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        }

    private fun homeColumn(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, dp(10), 0, dp(74))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.CENTER_HORIZONTAL
            )
        }

    private fun brandHeader(subtitle: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(TextView(context).apply {
                text = "SEDAM"
                setTextColor(C_GOLD)
                textSize = 12f
                typeface = Typeface.MONOSPACE
                letterSpacing = 0.2f
                gravity = Gravity.CENTER
                includeFontPadding = false
            })
            addView(mutedText(subtitle, 7f).apply { letterSpacing = 0.12f })
        }

    private fun topBar(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            addView(TextView(context).apply {
                text = "SEDAM"
                setTextColor(C_GOLD)
                textSize = 10f
                typeface = Typeface.MONOSPACE
                letterSpacing = 0.24f
                includeFontPadding = false
                gravity = Gravity.CENTER
            })
            addView(mutedText(WearSession.operation(context)?.status?.name ?: "SIN OPERACION", 8f))
        }

    private fun bottomNav(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(5), dp(5), dp(5), dp(5))
            background = rounded(C_INPUT)
            Panel.entries.forEach { panel ->
                addView(navButton(panel), LinearLayout.LayoutParams(dp(42), dp(38)).apply {
                    leftMargin = dp(2)
                    rightMargin = dp(2)
                })
            }
        }

    private fun navButton(panel: Panel): Button =
        Button(this).apply {
            text = panel.label
            setTextColor(if (panel == activePanel) C_GREEN else C_TEXT)
            textSize = 9f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            includeFontPadding = false
            minHeight = 0
            minWidth = 0
            stateListAnimator = null
            backgroundTintList = ColorStateList.valueOf(if (panel == activePanel) C_GREEN_DARK else C_PANEL)
            setPadding(0, 0, 0, 0)
            setOnClickListener {
                activePanel = panel
                renderHome()
            }
        }

    private fun chatChannelSelector(): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            ChatChannel.entries.forEach { channel ->
                val selected = channel == selectedChatChannel
                val button = proButton(
                    text = channel.shortLabel,
                    widthDp = 44,
                    textColor = if (selected) C_GREEN else C_TEXT,
                    bgColor = if (selected) C_GREEN_DARK else C_PANEL
                ) {
                    selectedChatChannel = channel
                    renderActivePanel()
                }
                addView(button, buttonRowParams(button).apply {
                    leftMargin = dp(2)
                    rightMargin = dp(2)
                })
            }
            layoutParams = blockParams(176, top = 6)
        }

    private fun sectionBlock(label: String, value: String, sub: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            background = rounded(C_PANEL)
            setPadding(dp(7), dp(5), dp(7), dp(5))
            addView(mutedText(label, 7f))
            addView(valueText(value, 12f, C_TEXT))
            if (sub.isNotBlank()) addView(mutedText(sub, 8f))
            layoutParams = blockParams(176, top = 6)
        }

    private fun vitalHero(heart: String): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(valueText("HR", 10f, C_RED))
            heartRateValue = valueText(heart, 34f, if (heart == "--") C_MUTED else C_TEXT)
            addView(heartRateValue)
            addView(mutedText("bpm", 8f))
            layoutParams = blockParams(176, top = 6)
        }

    private data class MetricViews(val root: LinearLayout, val value: TextView)

    private fun metricCard(label: String, value: String): MetricViews {
        val valueView = valueText(value, 10f, C_BLUE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = rounded(C_PANEL)
            setPadding(dp(4), dp(4), dp(4), dp(4))
            addView(mutedText(label, 7f))
            addView(valueView)
        }
        return MetricViews(root, valueView)
    }

    private fun twoMetricRow(left: MetricViews, right: MetricViews): LinearLayout =
        twoColumnRow(left.root, right.root)

    private fun twoColumnRow(left: View, right: View): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(left, LinearLayout.LayoutParams(dp(84), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                rightMargin = dp(3)
            })
            addView(right, LinearLayout.LayoutParams(dp(84), LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                leftMargin = dp(3)
            })
            layoutParams = blockParams(176, top = 6)
        }

    private fun twoButtonRow(vararg buttons: Button): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            buttons.forEachIndexed { index, button ->
                addView(button, buttonRowParams(button).apply {
                    if (index > 0) leftMargin = dp(3)
                    if (index < buttons.lastIndex) rightMargin = dp(3)
                })
            }
            layoutParams = blockParams(176, top = 6)
        }

    private fun buttonRowParams(button: Button): LinearLayout.LayoutParams {
        val existing = button.layoutParams as? LinearLayout.LayoutParams
        return LinearLayout.LayoutParams(
            existing?.width ?: LinearLayout.LayoutParams.WRAP_CONTENT,
            existing?.height ?: LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER
        }
    }

    private fun proButton(
        text: String,
        widthDp: Int,
        textColor: Int,
        bgColor: Int,
        onClick: () -> Unit
    ): Button =
        Button(this).apply {
            this.text = text
            setTextColor(textColor)
            textSize = 8.5f
            typeface = Typeface.MONOSPACE
            includeFontPadding = false
            minHeight = 0
            minWidth = 0
            stateListAnimator = null
            backgroundTintList = ColorStateList.valueOf(bgColor)
            setPadding(0, 0, 0, 0)
            setOnClickListener { onClick() }
            layoutParams = blockParams(widthDp, height = 32, top = 5)
        }

    private fun loginInput(value: String, hint: String, inputTypeValue: Int): EditText =
        EditText(this).apply {
            setText(value)
            this.hint = hint
            inputType = inputTypeValue
            setSingleLine(true)
            setTextColor(C_BLUE)
            setHintTextColor(C_MUTED_DARK)
            textSize = 8f
            typeface = Typeface.MONOSPACE
            background = rounded(C_INPUT)
            setPadding(dp(8), 0, dp(8), 0)
            includeFontPadding = false
            layoutParams = blockParams(136, height = 30, top = 2)
        }

    private fun fieldLabel(text: String): TextView =
        mutedText(text, 6f).apply {
            letterSpacing = 0.12f
            layoutParams = blockParams(136, top = 5)
        }

    private fun mutedText(text: String, size: Float): TextView =
        TextView(this).apply {
            this.text = text
            setTextColor(C_MUTED)
            textSize = size
            typeface = Typeface.MONOSPACE
            gravity = Gravity.CENTER
            includeFontPadding = false
        }

    private fun valueText(text: String, size: Float, color: Int): TextView =
        TextView(this).apply {
            this.text = text
            setTextColor(color)
            textSize = size
            typeface = Typeface.MONOSPACE
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }

    private fun thinDivider(widthDp: Int): View =
        View(this).apply {
            setBackgroundColor(C_DIVIDER)
            layoutParams = blockParams(widthDp, height = 1, top = 5)
        }

    private fun blockParams(widthDp: Int, height: Int = LinearLayout.LayoutParams.WRAP_CONTENT, top: Int = 0):
        LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(dp(widthDp), if (height > 0) dp(height) else height).apply {
            topMargin = dp(top)
            gravity = Gravity.CENTER_HORIZONTAL
        }

    private fun inlineParams(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)

    private fun rounded(color: Int): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(6).toFloat()
        }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

}
