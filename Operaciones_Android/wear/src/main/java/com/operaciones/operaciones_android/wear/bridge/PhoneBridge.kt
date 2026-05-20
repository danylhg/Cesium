package com.operaciones.operaciones_android.wear.bridge

import android.content.Context
import com.google.android.gms.wearable.Wearable
import com.operaciones.operaciones_android.wear.data.WearOperation
import org.json.JSONObject

class PhoneBridge(private val context: Context) {
    companion object {
        const val PATH_OPEN_PHONE = "/sedam/open-phone"
        const val PATH_EMERGENCY = "/sedam/emergency"
    }

    fun openPhone(operation: WearOperation?, onDone: (Boolean) -> Unit = {}) {
        val payload = JSONObject().apply {
            put("operation_id", operation?.id ?: -1)
            put("op_codigo", operation?.codigo.orEmpty())
            put("op_nombre", operation?.nombre.orEmpty())
            put("op_descripcion", operation?.descripcion.orEmpty())
            put("op_prioridad", operation?.prioridad.orEmpty())
            put("op_estado", operation?.status?.name.orEmpty())
            put("op_fecha_inicio", operation?.fechaInicio.orEmpty())
            put("op_fecha_fin", operation?.fechaFin.orEmpty())
            put("op_lat", operation?.zonaLat ?: 0.0)
            put("op_lon", operation?.zonaLon ?: 0.0)
            put("op_zoom", operation?.zonaZoom ?: 8000)
        }
        sendMessage(PATH_OPEN_PHONE, payload, onDone)
    }

    fun mirrorEmergency(operationId: Int, source: String, onDone: (Boolean) -> Unit = {}) {
        val payload = JSONObject().apply {
            put("operation_id", operationId)
            put("source", source)
            put("timestamp", System.currentTimeMillis())
        }
        sendMessage(PATH_EMERGENCY, payload, onDone)
    }

    private fun sendMessage(path: String, json: JSONObject, onDone: (Boolean) -> Unit) {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    onDone(false)
                    return@addOnSuccessListener
                }
                var pending = nodes.size
                var anyOk = false
                nodes.forEach { node ->
                    Wearable.getMessageClient(context)
                        .sendMessage(node.id, path, bytes)
                        .addOnSuccessListener {
                            anyOk = true
                            pending--
                            if (pending == 0) onDone(anyOk)
                        }
                        .addOnFailureListener {
                            pending--
                            if (pending == 0) onDone(anyOk)
                        }
                }
            }
            .addOnFailureListener { onDone(false) }
    }
}
