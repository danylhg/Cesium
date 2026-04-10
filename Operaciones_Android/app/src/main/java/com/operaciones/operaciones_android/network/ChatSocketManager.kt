package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class ChatSocketManager(
    private val operationId: Int,
    private val onNewMessage: (JSONObject) -> Unit,
    private val onNavigationRouteEvt: ((event: String, data: JSONObject) -> Unit)? = null,
    private val onTrackingPersonal: ((JSONObject) -> Unit)? = null,
    private val onTrackingVehiculo: ((JSONObject) -> Unit)? = null,
    private val onPoiCreado: ((JSONObject) -> Unit)? = null,
    private val onConnected: (() -> Unit)? = null,
    private val idPersonal: Int = -1,
    private val rol: String = ""
) {

    private var socket: Socket? = null

    fun connect() {
        if (socket?.connected() == true) return

        socket = IO.socket(ApiConfig.BASE_URL)

        socket?.on(Socket.EVENT_CONNECT) {
            val payload = JSONObject().apply {
                put("id_operacion", operationId)
                if (idPersonal > 0) put("id_personal", idPersonal)
                if (rol.isNotEmpty()) put("rol", rol)
            }
            socket?.emit("join_operacion", payload)
            // Notifica que ya está conectado y unido para que se emita la posición inicial
            onConnected?.invoke()
        }

        socket?.on("chat_message") { args ->
            val item = args.firstOrNull() as? JSONObject ?: return@on
            onNewMessage(item)
        }

        socket?.on("ruta_navegacion_creada") { args ->
            val data = args.firstOrNull() as? JSONObject ?: return@on
            onNavigationRouteEvt?.invoke("creada", data)
        }

        socket?.on("ruta_navegacion_eliminada") { args ->
            val data = args.firstOrNull() as? JSONObject ?: return@on
            onNavigationRouteEvt?.invoke("eliminada", data)
        }

        socket?.on("tracking_personal") { args ->
            val data = args.firstOrNull() as? JSONObject ?: return@on
            onTrackingPersonal?.invoke(data)
        }

        socket?.on("tracking_vehiculo") { args ->
            val data = args.firstOrNull() as? JSONObject ?: return@on
            onTrackingVehiculo?.invoke(data)
        }

        socket?.on("poi_creado") { args ->
            val data = args.firstOrNull() as? JSONObject ?: return@on
            onPoiCreado?.invoke(data)
        }

        socket?.connect()
    }

    fun emitTracking(idPersonal: Int, lat: Double, lon: Double, apodo: String, rol: String = "") {
        val payload = JSONObject().apply {
            put("id_personal", idPersonal)
            put("latitud", lat)
            put("longitud", lon)
            put("apodo", apodo)
            put("nombre", apodo)
            put("rol", rol)
        }
        socket?.emit("tracking_personal", payload)
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
