package com.operaciones.operaciones_android.streaming

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.operaciones.operaciones_android.R
import com.operaciones.operaciones_android.config.ApiConfig
import io.socket.client.IO
import io.socket.client.Socket
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SessionDescription
import org.webrtc.SdpObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap

class MediaStreamingService : Service() {

    companion object {
        const val ACTION_START = "com.operaciones.operaciones_android.streaming.START"
        const val ACTION_STOP = "com.operaciones.operaciones_android.streaming.STOP"

        const val EXTRA_OPERATION_ID = "OPERATION_ID"
        const val EXTRA_TOKEN = "TOKEN"
        const val EXTRA_USER_NAME = "USER_NAME"
        const val EXTRA_USER_ID = "USER_ID"
        const val EXTRA_USER_ROLE = "USER_ROLE"
        const val EXTRA_USER_TABLE = "USER_TABLE"

        @Volatile
        var isRunning: Boolean = false
            private set

        private const val TAG = "MEDIA_STREAM"
        private const val CHANNEL_ID = "sedam_media_stream"
        private const val NOTIFICATION_ID = 3001
        private const val LOCAL_STREAM_ID = "sedam_local_stream"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val httpClient = OkHttpClient()
    private val peerConnections = ConcurrentHashMap<String, PeerConnection>()

    private var operationId = -1
    private var streamId = -1
    private var token = ""
    private var userName = ""
    private var userId = -1
    private var userRole = ""
    private var userTable = "personal"

    private var socket: Socket? = null
    private var rootEglBase: EglBase? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var videoCapturer: VideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoSource: VideoSource? = null
    private var audioSource: AudioSource? = null
    private var localVideoTrack: VideoTrack? = null
    private var localAudioTrack: AudioTrack? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var iceServers: List<PeerConnection.IceServer> = defaultIceServers()
    private var stopping = false

    private val pingRunnable = object : Runnable {
        override fun run() {
            val currentStreamId = streamId
            if (currentStreamId > 0 && socket?.connected() == true) {
                socket?.emit("stream_ping", JSONObject().apply {
                    put("id_operacion", operationId)
                    put("id_stream", currentStreamId)
                })
                mainHandler.postDelayed(this, 15_000L)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopStreaming(notifyServer = true)
            stopSelf()
            return START_NOT_STICKY
        }

        operationId = intent?.getIntExtra(EXTRA_OPERATION_ID, -1) ?: -1
        token = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
        userName = intent?.getStringExtra(EXTRA_USER_NAME).orEmpty()
        userId = intent?.getIntExtra(EXTRA_USER_ID, -1) ?: -1
        userRole = intent?.getStringExtra(EXTRA_USER_ROLE).orEmpty()
        userTable = intent?.getStringExtra(EXTRA_USER_TABLE).orEmpty().ifBlank { "personal" }

        startForegroundCompat(buildNotification("Preparando camara y microfono..."))

        if (operationId <= 0 || token.isBlank()) {
            Log.e(TAG, "No hay operacion o token valido")
            stopSelf()
            return START_NOT_STICKY
        }

        if (!hasCameraAndMicPermissions()) {
            Log.e(TAG, "Faltan permisos CAMERA/RECORD_AUDIO")
            stopSelf()
            return START_NOT_STICKY
        }

        if (isRunning) return START_STICKY

        isRunning = true
        stopping = false
        acquireWakeLock()

        Thread {
            try {
                val stream = createStreamSession()
                streamId = stream.getInt("id_stream")
                iceServers = fetchIceServers()

                mainHandler.post {
                    try {
                        startWebRtcPublisher()
                        connectSignalingSocket()
                        updateNotification("Transmitiendo camara y microfono en vivo")
                    } catch (e: Exception) {
                        Log.e(TAG, "Error iniciando WebRTC", e)
                        stopStreaming(notifyServer = true)
                        stopSelf()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error creando sesion de transmision", e)
                mainHandler.post {
                    stopStreaming(notifyServer = false)
                    stopSelf()
                }
            }
        }.start()

        return START_STICKY
    }

    override fun onDestroy() {
        stopStreaming(notifyServer = true)
        super.onDestroy()
    }

    private fun hasCameraAndMicPermissions(): Boolean {
        val cameraOk = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val micOk = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        return cameraOk && micOk
    }

    private fun createStreamSession(): JSONObject {
        val body = JSONObject().apply {
            put("kind", "AUDIO_VIDEO")
            put("label", userName.ifBlank { "Android" })
            put("consent_ack", true)
            put("foreground_notice", true)
        }

        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/streams")
            .addHeader("Authorization", "Bearer $token")
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()

        httpClient.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("POST stream fallo ${response.code}: $text")
            val json = JSONObject(text)
            return json.getJSONObject("stream")
        }
    }

    private fun fetchIceServers(): List<PeerConnection.IceServer> {
        val request = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/streams/webrtc-config")
            .addHeader("Authorization", "Bearer $token")
            .get()
            .build()

        return try {
            httpClient.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) return defaultIceServers()
                val servers = JSONObject(text)
                    .optJSONObject("config")
                    ?.optJSONArray("iceServers")
                    ?: return defaultIceServers()
                parseIceServers(servers).ifEmpty { defaultIceServers() }
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo cargar ICE config, usando STUN default: ${e.message}")
            defaultIceServers()
        }
    }

    private fun parseIceServers(items: JSONArray): List<PeerConnection.IceServer> {
        val result = mutableListOf<PeerConnection.IceServer>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val urlsAny = item.opt("urls") ?: continue
            val urls = when (urlsAny) {
                is JSONArray -> (0 until urlsAny.length()).mapNotNull { idx -> urlsAny.optString(idx).takeIf { it.isNotBlank() } }
                else -> listOf(urlsAny.toString()).filter { it.isNotBlank() }
            }
            if (urls.isEmpty()) continue

            val builder = if (urls.size == 1) {
                PeerConnection.IceServer.builder(urls.first())
            } else {
                PeerConnection.IceServer.builder(urls)
            }
            val username = item.optString("username", "")
            val credential = item.optString("credential", "")
            if (username.isNotBlank()) builder.setUsername(username)
            if (credential.isNotBlank()) builder.setPassword(credential)
            result.add(builder.createIceServer())
        }
        return result
    }

    private fun defaultIceServers(): List<PeerConnection.IceServer> =
        listOf(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer())

    @SuppressLint("MissingPermission")
    private fun startWebRtcPublisher() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(applicationContext)
                .createInitializationOptions()
        )

        rootEglBase = EglBase.create()
        val eglContext = rootEglBase!!.eglBaseContext

        val encoderFactory = DefaultVideoEncoderFactory(eglContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        audioSource = peerConnectionFactory!!.createAudioSource(MediaConstraints())
        localAudioTrack = peerConnectionFactory!!.createAudioTrack("sedam_audio", audioSource)

        videoCapturer = createCameraCapturer()
        videoSource = peerConnectionFactory!!.createVideoSource(false)
        surfaceTextureHelper = SurfaceTextureHelper.create("SedamCameraThread", eglContext)
        videoCapturer?.initialize(surfaceTextureHelper, applicationContext, videoSource!!.capturerObserver)
        videoCapturer?.startCapture(1280, 720, 30)
        localVideoTrack = peerConnectionFactory!!.createVideoTrack("sedam_video", videoSource)

        Log.d(TAG, "WebRTC publisher listo streamId=$streamId")
    }

    private fun createCameraCapturer(): CameraVideoCapturer {
        val enumerator = Camera2Enumerator(this)
        val deviceName = enumerator.deviceNames.firstOrNull { enumerator.isBackFacing(it) }
            ?: enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: throw IllegalStateException("No se encontro camara disponible")

        return enumerator.createCapturer(deviceName, object : CameraVideoCapturer.CameraEventsHandler {
            override fun onCameraError(errorDescription: String?) {
                Log.e(TAG, "Camera error: $errorDescription")
            }

            override fun onCameraDisconnected() {
                Log.w(TAG, "Camera disconnected")
            }

            override fun onCameraFreezed(errorDescription: String?) {
                Log.e(TAG, "Camera freezed: $errorDescription")
            }

            override fun onCameraOpening(cameraName: String?) {
                Log.d(TAG, "Opening camera: $cameraName")
            }

            override fun onFirstFrameAvailable() {
                Log.d(TAG, "First camera frame available")
            }

            override fun onCameraClosed() {
                Log.d(TAG, "Camera closed")
            }
        }) ?: throw IllegalStateException("No se pudo crear capturer")
    }

    private fun connectSignalingSocket() {
        socket = IO.socket(ApiConfig.BASE_URL)

        socket?.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Socket stream conectado")
            socket?.emit("join_operacion", JSONObject().apply {
                put("id_operacion", operationId)
                if (userId > 0 && userTable == "personal") put("id_personal", userId)
                if (userRole.isNotBlank()) put("rol", userRole)
            })
            socket?.emit("stream_join", JSONObject().apply {
                put("id_operacion", operationId)
                put("id_stream", streamId)
                put("role", "publisher")
            })
            mainHandler.removeCallbacks(pingRunnable)
            mainHandler.postDelayed(pingRunnable, 15_000L)
        }

        socket?.on("webrtc_viewer_joined") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val viewerSocketId = payload.optString("viewer_socket_id", "")
            if (viewerSocketId.isNotBlank()) {
                mainHandler.post { createOfferForViewer(viewerSocketId) }
            }
        }

        socket?.on("webrtc_answer") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val from = payload.optString("from_socket_id", payload.optString("from", ""))
            val sdp = payload.optString("sdp", "")
            if (from.isNotBlank() && sdp.isNotBlank()) {
                mainHandler.post {
                    peerConnections[from]?.setRemoteDescription(
                        SimpleSdpObserver("setRemoteAnswer:$from"),
                        SessionDescription(SessionDescription.Type.ANSWER, sdp)
                    )
                }
            }
        }

        socket?.on("webrtc_ice_candidate") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val from = payload.optString("from_socket_id", payload.optString("from", ""))
            val candidate = parseIceCandidate(payload)
            if (from.isNotBlank() && candidate != null) {
                mainHandler.post { peerConnections[from]?.addIceCandidate(candidate) }
            }
        }

        socket?.on("webrtc_viewer_left") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val viewerSocketId = payload.optString("viewer_socket_id", "")
            if (viewerSocketId.isNotBlank()) {
                mainHandler.post { closePeer(viewerSocketId) }
            }
        }

        socket?.on("media_stream_stopped") {
            mainHandler.post {
                if (!stopping) {
                    stopStreaming(notifyServer = false)
                    stopSelf()
                }
            }
        }

        socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Log.e(TAG, "Socket stream connect_error: ${args.firstOrNull()}")
        }

        socket?.connect()
    }

    private fun createOfferForViewer(viewerSocketId: String) {
        if (peerConnections.containsKey(viewerSocketId)) return
        val factory = peerConnectionFactory ?: return

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val peerConnection = factory.createPeerConnection(
            rtcConfig,
            object : PeerConnection.Observer {
                override fun onSignalingChange(newState: PeerConnection.SignalingState?) {}
                override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState?) {
                    Log.d(TAG, "ICE $viewerSocketId: $newState")
                }
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState?) {}
                override fun onIceCandidate(candidate: IceCandidate?) {
                    if (candidate != null) sendIceCandidate(viewerSocketId, candidate)
                }
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
                override fun onAddStream(stream: MediaStream?) {}
                override fun onRemoveStream(stream: MediaStream?) {}
                override fun onDataChannel(dataChannel: DataChannel?) {}
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {}
            }
        ) ?: run {
            Log.e(TAG, "No se pudo crear PeerConnection para $viewerSocketId")
            return
        }

        peerConnections[viewerSocketId] = peerConnection
        localAudioTrack?.let { peerConnection.addTrack(it, listOf(LOCAL_STREAM_ID)) }
        localVideoTrack?.let { peerConnection.addTrack(it, listOf(LOCAL_STREAM_ID)) }

        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "false"))
        }

        peerConnection.createOffer(object : SdpObserver {
            override fun onCreateSuccess(description: SessionDescription?) {
                if (description == null) return
                peerConnection.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(description: SessionDescription?) {}
                    override fun onSetSuccess() {
                        socket?.emit("webrtc_offer", JSONObject().apply {
                            put("id_operacion", operationId)
                            put("id_stream", streamId)
                            put("to", viewerSocketId)
                            put("type", description.type.canonicalForm())
                            put("sdp", description.description)
                        })
                    }
                    override fun onCreateFailure(error: String?) {}
                    override fun onSetFailure(error: String?) {
                        Log.e(TAG, "setLocalDescription offer fallo: $error")
                    }
                }, description)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "createOffer fallo: $error")
            }
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }

    private fun sendIceCandidate(viewerSocketId: String, candidate: IceCandidate) {
        socket?.emit("webrtc_ice_candidate", JSONObject().apply {
            put("id_operacion", operationId)
            put("id_stream", streamId)
            put("to", viewerSocketId)
            put("candidate", JSONObject().apply {
                put("sdpMid", candidate.sdpMid)
                put("sdpMLineIndex", candidate.sdpMLineIndex)
                put("candidate", candidate.sdp)
            })
        })
    }

    private fun parseIceCandidate(payload: JSONObject): IceCandidate? {
        val candidateObj = payload.optJSONObject("candidate")
        val source = candidateObj ?: payload
        val candidate = source.optString("candidate", "")
        if (candidate.isBlank()) return null
        return IceCandidate(
            source.optString("sdpMid", null),
            source.optInt("sdpMLineIndex", source.optInt("sdp_m_line_index", 0)),
            candidate
        )
    }

    private fun closePeer(viewerSocketId: String) {
        peerConnections.remove(viewerSocketId)?.dispose()
    }

    private fun stopStreaming(notifyServer: Boolean) {
        if (stopping) return
        stopping = true
        isRunning = false
        mainHandler.removeCallbacks(pingRunnable)

        if (notifyServer && streamId > 0 && socket?.connected() == true) {
            socket?.emit("stream_stop", JSONObject().apply {
                put("id_operacion", operationId)
                put("id_stream", streamId)
                put("status", "STOPPED")
            })
        }

        peerConnections.values.forEach { it.dispose() }
        peerConnections.clear()

        try {
            videoCapturer?.stopCapture()
        } catch (e: Exception) {
            Log.w(TAG, "stopCapture: ${e.message}")
        }
        videoCapturer?.dispose()
        videoCapturer = null

        localVideoTrack?.dispose()
        localVideoTrack = null
        localAudioTrack?.dispose()
        localAudioTrack = null
        videoSource?.dispose()
        videoSource = null
        audioSource?.dispose()
        audioSource = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        rootEglBase?.release()
        rootEglBase = null

        socket?.disconnect()
        socket?.off()
        socket = null

        releaseWakeLock()
        Log.d(TAG, "Transmision detenida")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Transmision de camara y microfono",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Canal de transmision WebRTC en vivo SEDAM"
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(text: String): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SEDAM - Transmision activa")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "operaciones:media_stream")
        wakeLock?.acquire()
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (_: Exception) {
        }
        wakeLock = null
    }

    private class SimpleSdpObserver(private val tag: String) : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String?) {
            Log.e(TAG, "$tag onCreateFailure: $error")
        }
        override fun onSetFailure(error: String?) {
            Log.e(TAG, "$tag onSetFailure: $error")
        }
    }
}
