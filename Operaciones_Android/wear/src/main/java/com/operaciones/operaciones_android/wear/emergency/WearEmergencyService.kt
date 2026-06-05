package com.operaciones.operaciones_android.wear.emergency

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import androidx.core.content.ContextCompat
import com.operaciones.operaciones_android.wear.R
import com.operaciones.operaciones_android.wear.auth.WearSession
import com.operaciones.operaciones_android.wear.bridge.PhoneBridge
import com.operaciones.operaciones_android.wear.config.WearApiConfig
import com.operaciones.operaciones_android.wear.data.WearOperationStatus
import com.operaciones.operaciones_android.wear.network.WearApiClient
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.sqrt

class WearEmergencyService : Service(), SensorEventListener {
    companion object {
        private const val TAG = "WearEmergency"
        private const val CHANNEL_ID = "sedam_wear_emergency"
        private const val NOTIFICATION_ID = 2101
        private const val SHAKE_THRESHOLD = 13f
        private const val SHAKE_RESET_MS = 1_500L
        private const val SHAKE_MIN_GAP_MS = 300L
        private const val MIN_TRACKING_UPLOAD_MS = 15_000L
        private const val MIN_LOCATION_INTERVAL_MS = 10_000L
        private const val MIN_LOCATION_DISTANCE_M = 0f
        private const val FUSED_PROVIDER = "fused"
    }

    private val api = WearApiClient()
    private lateinit var phoneBridge: PhoneBridge
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var shakeCount = 0
    private var lastShakeTime = 0L
    private var emergencyPending = false
    private var lastLat: Double? = null
    private var lastLon: Double? = null
    private var lastTrackingUploadAt = 0L
    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        WearApiConfig.load(this)
        phoneBridge = PhoneBridge(this)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        registerAccelerometer()
        registerLocationListener()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        unregisterAccelerometer()
        unregisterLocationListener()
        super.onDestroy()
    }

    private fun registerAccelerometer() {
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    private fun unregisterAccelerometer() {
        if (::sensorManager.isInitialized) sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return
        val acceleration = sqrt(
            event.values[0] * event.values[0] +
                event.values[1] * event.values[1] +
                event.values[2] * event.values[2]
        ) - SensorManager.GRAVITY_EARTH
        val now = System.currentTimeMillis()
        if (acceleration <= SHAKE_THRESHOLD) return

        val delta = now - lastShakeTime
        if (delta < SHAKE_MIN_GAP_MS) return
        if (delta > SHAKE_RESET_MS) shakeCount = 0

        shakeCount++
        lastShakeTime = now
        if (shakeCount >= 2) {
            shakeCount = 0
            triggerEmergency("AGITAR_RELOJ")
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    @SuppressLint("MissingPermission")
    private fun registerLocationListener() {
        val fineOk = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarseOk = ContextCompat.checkSelfPermission(
            this,
            android.Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        if (!fineOk && !coarseOk) return

        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationListener = LocationListener { loc: Location ->
            onLocation(loc)
        }

        listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, FUSED_PROVIDER).forEach { provider ->
            runCatching {
                locationManager?.requestLocationUpdates(
                    provider,
                    MIN_LOCATION_INTERVAL_MS,
                    MIN_LOCATION_DISTANCE_M,
                    locationListener!!
                )
                locationManager?.getLastKnownLocation(provider)?.let { onLocation(it) }
            }.onFailure {
                Log.w(TAG, "No se pudo activar ubicacion $provider: ${it.message}")
            }
        }
    }

    private fun onLocation(location: Location) {
        lastLat = location.latitude
        lastLon = location.longitude
        Log.d(TAG, "Ubicacion ${location.provider}: ${location.latitude}, ${location.longitude}")
        maybeSendTracking(location)
    }

    private fun maybeSendTracking(location: Location) {
        val now = System.currentTimeMillis()
        if (lastTrackingUploadAt > 0L && now - lastTrackingUploadAt < MIN_TRACKING_UPLOAD_MS) return

        val user = WearSession.user(this) ?: return
        val operation = WearSession.operation(this) ?: return
        val token = WearSession.token(this)
        if (token.isBlank() || user.tabla != "personal" || operation.status != WearOperationStatus.ACTIVA) return

        lastTrackingUploadAt = now
        api.sendTracking(
            operationId = operation.id,
            token = token,
            idPersonal = user.id,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = if (location.hasAccuracy()) location.accuracy else null,
            speedKmh = if (location.hasSpeed()) location.speed.toDouble() * 3.6 else null,
            headingDegrees = if (location.hasBearing()) location.bearing.toDouble() else null,
            onSuccess = { Log.i(TAG, "Tracking enviado op=${operation.id} personal=${user.id}") },
            onError = { Log.w(TAG, it) }
        )
    }

    private fun unregisterLocationListener() {
        locationListener?.let { listener ->
            runCatching { locationManager?.removeUpdates(listener) }
        }
        locationListener = null
    }

    private fun triggerEmergency(source: String) {
        if (emergencyPending) return
        val user = WearSession.user(this)
        val operation = WearSession.operation(this)
        val token = WearSession.token(this)
        if (user == null || operation == null || token.isBlank()) {
            Log.w(TAG, "Emergencia sin sesion u operacion")
            return
        }

        emergencyPending = true
        vibrateEmergency()
        phoneBridge.mirrorEmergency(operation.id, source)

        val timestamp = SimpleDateFormat("HH:mm:ss dd/MM/yyyy", Locale.getDefault()).format(Date())
        val lat = lastLat
        val lon = lastLon
        val location = if (lat != null && lon != null) {
            "%.6f, %.6f".format(lat, lon)
        } else {
            "ubicacion no disponible"
        }
        val content = "EMERGENCIA RELOJ:\n" +
            "USUARIO: ${user.nombreCompleto}\n" +
            "ORIGEN: $source\n" +
            "UBICACION: $location\n" +
            "HORA: $timestamp"

        api.sendMessage(
            operationId = operation.id,
            token = token,
            contenido = content,
            tipoMensaje = "URGENTE",
            onSuccess = { emergencyPending = false },
            onError = {
                Log.e(TAG, it)
                emergencyPending = false
            }
        )
    }

    private fun vibrateEmergency() {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 250, 120, 250, 120, 450), -1))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(longArrayOf(0, 250, 120, 250, 120, 450), -1)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SEDAM Reloj",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("SEDAM Reloj activo")
            .setContentText("SOS por boton o agitada listo")
            .setSmallIcon(R.drawable.ic_watch_notification)
            .setOngoing(true)
            .build()
    }
}
