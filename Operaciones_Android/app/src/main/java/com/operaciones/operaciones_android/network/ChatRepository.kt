package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class ChatRepository(
    private val http: OkHttpClient = OkHttpClient()
) {

    fun getMessages(
        operationId: Int,
        token: String,
        onSuccess: (JSONArray) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/chat")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Fallo HTTP real: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    android.util.Log.d("CHAT_HTTP", "GET code=${response.code}")
                    android.util.Log.d("CHAT_HTTP", "GET body=$bodyStr")

                    val json = JSONObject(bodyStr)

                    if (!response.isSuccessful) {
                        onError(json.optString("mensaje", "Error HTTP ${response.code}"))
                        return
                    }

                    if (!json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "Error cargando chat"))
                        return
                    }

                    val items = json.optJSONArray("items") ?: JSONArray()
                    onSuccess(items)

                } catch (e: Exception) {
                    onError("Catch parseando historial: ${e.message}")
                }
            }
        })
    }

    fun sendMessage(
        operationId: Int,
        token: String,
        contenido: String,
        tipoMensaje: String = "NORMAL",
        destinatarioRol: String? = "GLOBAL",
        onSuccess: (JSONObject) -> Unit,
        onError: (String) -> Unit
    ) {
        val body = JSONObject().apply {
            put("contenido", contenido)
            put("tipo_mensaje", tipoMensaje)
            put("destinatario_rol", destinatarioRol ?: "GLOBAL")
        }.toString().toRequestBody("application/json".toMediaType())

        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/chat")
            .post(body)
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Fallo HTTP real al enviar: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    android.util.Log.d("CHAT_HTTP", "POST code=${response.code}")
                    android.util.Log.d("CHAT_HTTP", "POST body=$bodyStr")

                    val json = JSONObject(bodyStr)

                    if (!response.isSuccessful) {
                        onError(json.optString("mensaje", "Error HTTP ${response.code}"))
                        return
                    }

                    if (!json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "Error enviando mensaje"))
                        return
                    }

                    val item = json.optJSONObject("mensaje")
                    if (item == null) {
                        onError("Respuesta OK pero sin mensaje")
                        return
                    }

                    onSuccess(item)

                } catch (e: Exception) {
                    onError("Catch parseando envío: ${e.message}")
                }
            }
        })
    }
}
