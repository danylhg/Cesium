package com.operaciones.operaciones_android.network

import com.operaciones.operaciones_android.config.ApiConfig
import com.operaciones.operaciones_android.model.EquipoItem
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class EquipoRepository(
    private val http: OkHttpClient = OkHttpClient()
) {
    fun fetchEquipos(
        operationId: Int,
        token: String,
        onSuccess: (List<EquipoItem>) -> Unit,
        onError: (String) -> Unit
    ) {
        val req = Request.Builder()
            .url("${ApiConfig.BASE_URL}/ops/$operationId/equipos-asignados")
            .get()
            .addHeader("Authorization", "Bearer $token")
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                onError("Sin conexión cargando equipos.")
            }

            override fun onResponse(call: Call, response: Response) {
                val bodyStr = response.body?.string() ?: ""

                try {
                    val json = JSONObject(bodyStr)
                    if (!response.isSuccessful || !json.optBoolean("ok")) {
                        onError(json.optString("mensaje", "No se pudieron cargar los equipos."))
                        return
                    }

                    val items = json.optJSONArray("items") ?: org.json.JSONArray()
                    val result = mutableListOf<EquipoItem>()

                    for (i in 0 until items.length()) {
                        val e = items.getJSONObject(i)

                        val personalAsignado = e.optString("personal_apodo", "")
                            .ifBlank { e.optString("personal_asignado", "") }

                        val vehiculoAsignado = e.optString("vehiculo_asignado", "")

                        val asignadoA = when {
                            personalAsignado.isNotBlank() -> "Asignado a personal: $personalAsignado"
                            vehiculoAsignado.isNotBlank() -> "Asignado a vehículo: $vehiculoAsignado"
                            else -> ""
                        }

                        val detalle = buildString {
                            val uso = e.optString("uso_en_operacion", "")
                            val ns = e.optString("numero_serie", "")

                            if (uso.isNotBlank()) append(uso)
                            if (uso.isNotBlank() && ns.isNotBlank()) append(" · ")
                            if (ns.isNotBlank()) append("S/N: $ns")
                        }

                        result.add(
                            EquipoItem(
                                idEquipo = e.optInt("id_equipo"),
                                numeroSerie = e.optString("numero_serie", ""),
                                nombre = e.optString("nombre", "Equipo"),
                                categoria = e.optString("categoria", ""),
                                detalle = detalle,
                                asignadoA = asignadoA,
                                personalAsignado = personalAsignado,
                                vehiculoAsignado = vehiculoAsignado
                            )
                        )
                    }

                    onSuccess(result)
                } catch (e: Exception) {
                    onError("Error procesando equipos.")
                }
            }
        })
    }
}