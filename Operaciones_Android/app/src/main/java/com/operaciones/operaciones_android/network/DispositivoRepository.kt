package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.DispositivoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class DispositivoRepository(
    private val http: OkHttpClient = OkHttpClient()
) {
    private fun JSONObject.safeString(key: String): String {
        if (isNull(key)) return ""
        return optString(key, "").takeUnless { it.equals("null", ignoreCase = true) } ?: ""
    }

    fun fetchDispositivos(
        operationId: Int,
        token: String,
        onSuccess: (List<DispositivoItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/dispositivos-asignados")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexion cargando dispositivos.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string().orEmpty()
                try {
                    val json = JSONObject(bodyStr)
                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los dispositivos."))
                        return
                    }

                    val result = mutableListOf<DispositivoItem>()
                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    for (i in 0 until items.length()) {
                        val item = items.optJSONObject(i) ?: continue
                        result.add(
                            DispositivoItem(
                                idDispositivo = item.optInt("id_dispositivo"),
                                idPersonal = item.optInt("id_personal"),
                                tipo = item.safeString("tipo"),
                                marca = item.safeString("marca"),
                                modelo = item.safeString("modelo"),
                                numeroTelefono = item.safeString("numero_telefono"),
                                imei = item.safeString("imei"),
                                numeroSerie = item.safeString("numero_serie"),
                                sistemaOperativo = item.safeString("sistema_operativo"),
                                detalles = item.safeString("detalles"),
                                personalNombre = item.safeString("nombre"),
                                personalApellido = item.safeString("apellido"),
                                personalPuesto = item.safeString("puesto")
                            )
                        )
                    }
                    onSuccess(result)
                } catch (_: Exception) {
                    onError("Error procesando dispositivos.")
                }
            }
        })
    }
}
