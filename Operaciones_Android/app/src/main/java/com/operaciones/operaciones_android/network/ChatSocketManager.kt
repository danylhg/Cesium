package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

class ChatSocketManager(
    private val operationId: Int,
    private val onNewMessage: (JSONObject) -> Unit
) {

    private var socket: Socket? = null

    fun connect() {
        if (socket?.connected() == true) return

        socket = IO.socket(ApiConfig.BASE_URL)

        socket?.on(Socket.EVENT_CONNECT) {
            socket?.emit("join_operacion", operationId)
        }

        socket?.on("chat_message") { args ->
            val item = args.firstOrNull() as? JSONObject ?: return@on
            onNewMessage(item)
        }

        socket?.connect()
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
